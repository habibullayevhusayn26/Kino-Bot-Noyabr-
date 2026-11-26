require('dotenv').config();
const config = require('./config');
process.env.TZ = config.timezone;

const mongoose = require('mongoose');
const express = require('express');
const crypto = require('crypto');
const { Telegraf, Markup, Scenes, session } = require('telegraf');
const models = require('./src/models');
const { User, Admin, BotConfig, Session, BroadcastJob } = models;
const messages = require('./src/messages/uz');
const logger = require('./src/utils/logger');
const {
  registrationMiddleware,
  banCheckMiddleware,
  subscriptionCheckMiddleware,
  createRateLimitMiddleware,
  errorBoundary
} = require('./src/middlewares');
const { registerUserHandlers } = require('./src/handlers/userHandlers');
const { registerAdminHandlers } = require('./src/handlers/adminHandlers');
const { checkRequiredChannelMembership } = require('./src/services/subscriptionService');
const channelService = require('./src/services/channelService');
const movieService = require('./src/services/movieService');
const favoriteService = require('./src/services/favoriteService');
const { sendStoredMedia } = require('./src/services/mediaStorageService');
const { getStatistics } = require('./src/services/statsService');
const { createAddMovieScene } = require('./src/scenes/admin/addMovie');
const { createAddRetroGameScene } = require('./src/scenes/admin/addRetroGame');
const {
  isPollingConflict,
  isExpiredCallbackError,
  retryAfterLimit
} = require('./src/utils/telegramErrors');
const { toPremiumEmojiMarkup } = require('./src/utils/premiumEmoji');
const { styledInlineKeyboard, styledReplyKeyboard } = require('./src/keyboards/styled');
const {
  homeKeyboard,
  subscriptionKeyboard: userSubscriptionKeyboard,
  movieCardKeyboard
} = require('./src/keyboards/user');

const app = express();
const port = Number(process.env.PORT) || 3000;
const allowedUpdates = ['message', 'callback_query', 'chat_join_request'];
const webhookPath = `/webhook/${config.webhookSecret || 'unconfigured'}`;
const chatPickerRequestIds = { requiredChannel: 76001, requiredGroup: 76002, storage: 76003 };
const channelAdminRights = {
  is_anonymous: false,
  can_manage_chat: true,
  can_delete_messages: false,
  can_manage_video_chats: false,
  can_restrict_members: false,
  can_promote_members: false,
  can_change_info: false,
  can_invite_users: true,
  can_post_messages: true,
  can_edit_messages: false
};
const groupAdminRights = {
  is_anonymous: false,
  can_manage_chat: true,
  can_delete_messages: false,
  can_manage_video_chats: false,
  can_restrict_members: false,
  can_promote_members: false,
  can_change_info: false,
  can_invite_users: true,
  can_pin_messages: false
};
const maxQueuedUpdates = 250;
const maxConcurrentUpdates = 5;
const recentUpdateLimit = 2000;
const webhookUpdateQueue = [];
const queuedUpdateIds = new Set();
const recentUpdateIds = new Set();
let activeUpdateWorkers = 0;
let broadcastWorkerPromise = null;
let pollingStarted = false;
let webhookReady = false;
let shuttingDown = false;
let httpServer;

app.get('/', (req, res) => res.send('Movie bot ishlamoqda...'));
app.get('/health', (req, res) =>
  res.status(200).json({
    ok: true,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  })
);

const bot = new Telegraf(config.botToken);

bot.catch(async (error, ctx) => {
  logger.error(
    {
      err: error,
      updateType: ctx?.updateType,
      telegramId: ctx?.from?.id
    },
    'Unhandled Telegram update error'
  );
  if (ctx?.session) ctx.session.step = undefined;
  try {
    if (ctx?.callbackQuery) {
      await ctx.answerCbQuery(messages.genericError, { show_alert: true });
    } else if (ctx?.from?.id && ctx?.chat?.type === 'private') {
      await ctx.telegram.sendMessage(ctx.from.id, messages.genericError, {
        protect_content: !isAdmin(ctx)
      });
    }
  } catch (replyError) {
    if (!isExpiredCallbackError(replyError)) {
      logger.error(
        { err: replyError, telegramId: ctx?.from?.id },
        'Could not notify user after an update error'
      );
    }
  }
});

bot.on('chat_join_request', async (ctx) => {
  const joinRequest = ctx.update?.chat_join_request;
  if (!joinRequest) return;

  const name = joinRequest.from?.first_name || joinRequest.from?.username || 'foydalanuvchi';
  const welcomeText = toPremiumEmojiMarkup(
    `✅ Kanalga qo‘shilish so‘rovingiz tasdiqlandi.\n\n👋 Xush kelibsiz, ${name}!\n🎬 Kino kodini yuboring yoki menyudan kino tanlang.`
  );

  try {
    await retryAfterLimit(() =>
      channelService.approveChannelJoinRequest(ctx.telegram, joinRequest, {
        welcomeText,
        replyMarkup: homeKeyboard(false).reply_markup
      })
    );
  } catch (error) {
    logger.error(
      {
        err: error,
        chatId: joinRequest.chat?.id,
        telegramId: joinRequest.from?.id
      },
      'Could not approve chat join request'
    );
  }
});
const ADMIN_TG_ID = config.admin.telegramId;
const ADMIN_TG_IDS = new Set(config.admin.telegramIds);
const adminPermissions = ['movies', 'users', 'broadcast', 'stats', 'settings', 'admins'];
const adminRegistry = new Map();
const data = { settings: { requiredChannels: [] } };
const addMovieScene = createAddMovieScene({
  canManageMovies: (ctx) => isAdmin(ctx) && hasPermission(ctx, 'movies'),
  getStorageChannelId: () => data.settings.storageChannelId,
  logger
});
const addRetroGameScene = createAddRetroGameScene({
  canManageMovies: (ctx) => isAdmin(ctx) && hasPermission(ctx, 'movies'),
  getStorageChannelId: () => data.settings.storageChannelId,
  logger
});
const stage = new Scenes.Stage([addMovieScene, addRetroGameScene]);

function rememberUpdate(updateId) {
  recentUpdateIds.add(updateId);
  if (recentUpdateIds.size > recentUpdateLimit) {
    recentUpdateIds.delete(recentUpdateIds.values().next().value);
  }
}

function processWebhookQueue() {
  while (activeUpdateWorkers < maxConcurrentUpdates && webhookUpdateQueue.length > 0) {
    const update = webhookUpdateQueue.shift();
    activeUpdateWorkers += 1;
    bot
      .handleUpdate(update)
      .catch((error) => {
        logger.error({ err: error, updateId: update.update_id }, 'Webhook update failed');
      })
      .finally(() => {
        queuedUpdateIds.delete(update.update_id);
        rememberUpdate(update.update_id);
        activeUpdateWorkers -= 1;
        processWebhookQueue();
      });
  }
}

function hasValidWebhookSecret(req) {
  const received = req.get('x-telegram-bot-api-secret-token');
  if (!received || !config.webhookSecret) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(config.webhookSecret);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

if (config.renderExternalUrl) {
  app.post(
    webhookPath,
    (req, res, next) => (hasValidWebhookSecret(req) ? next() : res.sendStatus(403)),
    express.json({ limit: '1mb' }),
    (req, res) => {
      if (!webhookReady) return res.sendStatus(503);
      const update = req.body;
      if (!Number.isSafeInteger(update?.update_id)) return res.sendStatus(400);
      if (recentUpdateIds.has(update.update_id) || queuedUpdateIds.has(update.update_id)) {
        return res.sendStatus(200);
      }
      if (webhookUpdateQueue.length + activeUpdateWorkers >= maxQueuedUpdates) {
        return res.sendStatus(503);
      }

      queuedUpdateIds.add(update.update_id);
      webhookUpdateQueue.push(update);
      res.sendStatus(200);
      setImmediate(processWebhookQueue);
    }
  );
}
const premiumEmojis = {
  welcome: toPremiumEmojiMarkup('⚡️'),
  bot: toPremiumEmojiMarkup('🤖'),
  confirm: toPremiumEmojiMarkup('✔️'),
  warning: toPremiumEmojiMarkup('⚠️'),
  web: toPremiumEmojiMarkup('🌐')
};
const defaultMessages = {
  welcome: `${premiumEmojis.welcome} Assalomu alaykum {nickname}\n\n${premiumEmojis.bot} Botdan foydalanish bo\'yicha yordam uchun /help buyrug\'ini yuboring.`,
  subscriptionRequired: `${premiumEmojis.warning} Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling`,
  help: `${premiumEmojis.web} Botdan foydalanishda yordam kerak bo\'lsa, administrator bilan bog\'laning.`
};
function isAdmin(ctx) {
  const telegramId = Number(ctx.from?.id);
  if (ADMIN_TG_IDS.has(telegramId)) return true;
  const record = adminRegistry.get(telegramId);
  return Boolean(record?.active);
}

function isOwner(ctx) {
  return ADMIN_TG_IDS.has(Number(ctx.from?.id));
}

function hasPermission(ctx, permission) {
  if (isOwner(ctx)) return true;
  const record = adminRegistry.get(Number(ctx.from?.id));
  return Boolean(record?.active && record.permissions.includes(permission));
}

function permissionsLabel(permissions) {
  const labels = {
    movies: '🎬 Kinolarni boshqarish',
    users: '👤 Foydalanuvchilar',
    broadcast: '📣 Xabar yuborish',
    stats: '📊 Statistika',
    settings: '📢 Obuna sozlamalari',
    admins: '👥 Adminlar'
  };
  return (
    permissions
      .filter((permission) => adminPermissions.includes(permission))
      .map((permission) => labels[permission])
      .join(', ') || '🔒 Huquq berilmagan'
  );
}

function adminManagementKeyboard(admin) {
  const permissionNames = {
    movies: '🎬 Kinolar',
    users: '👤 Foydalanuvchilar',
    broadcast: '📣 Xabar yuborish',
    stats: '📊 Statistika',
    settings: '📢 Obuna sozlamalari',
    admins: '👥 Adminlar'
  };
  const rows = adminPermissions.map((permission) => [
    Markup.button.callback(
      `${admin.permissions.includes(permission) ? '✅' : '❌'} ${permissionNames[permission]}`,
      `admin:perm:${admin.telegramId}:${permission}`
    )
  ]);
  rows.push([Markup.button.callback("🗑 Adminni o'chirish", `admin:remove:${admin.telegramId}`)]);
  rows.push([Markup.button.callback("⬅️ Adminlar ro'yxati", 'admin:admins')]);
  return styledInlineKeyboard(rows);
}

function reset(ctx, closeAdminPanel = false) {
  const adminPanelActive = !closeAdminPanel && isAdminPanelActive(ctx);
  ctx.session = adminPanelActive ? { adminPanelActive: true } : {};
}

function activateAdminPanel(ctx) {
  ctx.session = { adminPanelActive: true };
}

function isAdminPanelActive(ctx) {
  return isAdmin(ctx) && ctx.session?.adminPanelActive === true;
}

function shouldProtectContent(chatId) {
  return !ADMIN_TG_IDS.has(Number(chatId));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function adminKeyboard(ctx) {
  const can = (permission) => !ctx || hasPermission(ctx, permission);
  const rows = [];
  if (can('movies'))
    rows.push([
      Markup.button.callback("🎬 Kino qo'shish", 'admin:movie:add'),
      Markup.button.callback("📚 Kinolar ro'yxati", 'admin:movie:list')
    ]);
  if (can('movies'))
    rows.push([
      Markup.button.callback('⚽ Retro o‘yin qo‘shish', 'admin:retro:add'),
      Markup.button.callback('⚽ Retro o‘yinlar ro‘yxati', 'admin:retro:list')
    ]);
  if (can('users')) rows.push([Markup.button.callback('👤 Foydalanuvchilar', 'admin:users')]);
  if (can('stats')) rows.push([Markup.button.callback('📊 Statistika', 'admin:stats')]);
  if (can('broadcast')) rows.push([Markup.button.callback('📣 Xabar yuborish', 'admin:broadcast')]);
  if (can('settings')) {
    rows.push([Markup.button.callback("➕ Obuna kanalini qo'shish", 'admin:subscription')]);
    rows.push([
      Markup.button.callback('📋 Obuna kanallari', 'admin:required_list'),
      Markup.button.callback("❌ Obunani o'chirish", 'admin:subscription_off')
    ]);
    rows.push([Markup.button.callback('📦 Saqlash kanalini tanlash', 'admin:storage')]);
  }
  if (isOwner(ctx || {}))
    rows.push([Markup.button.callback('👥 Adminlarni boshqarish', 'admin:admins')]);
  rows.push([Markup.button.callback('🚪 Paneldan chiqish', 'admin:exit')]);
  return styledInlineKeyboard(rows);
}

function requiredChatPickerKeyboard() {
  return styledReplyKeyboard([
    [
      Markup.button.channelRequest(
        messages.adminPickChannel,
        chatPickerRequestIds.requiredChannel,
        {
          user_administrator_rights: channelAdminRights,
          bot_administrator_rights: channelAdminRights
        }
      ),
      Markup.button.groupRequest(messages.adminPickGroup, chatPickerRequestIds.requiredGroup, {
        user_administrator_rights: groupAdminRights,
        bot_administrator_rights: groupAdminRights
      })
    ],
    [messages.adminCancelPicker]
  ])
    .resize()
    .oneTime();
}

function storageChatPickerKeyboard() {
  return styledReplyKeyboard([
    [
      Markup.button.channelRequest(messages.adminPickChannel, chatPickerRequestIds.storage, {
        chat_has_username: false,
        user_administrator_rights: channelAdminRights,
        bot_administrator_rights: channelAdminRights
      })
    ],
    [messages.adminCancelPicker]
  ])
    .resize()
    .oneTime();
}

function userKeyboard(ctx) {
  return homeKeyboard(isAdmin(ctx));
}

const persistentSessionStore = {
  async get(key) {
    const record = await Session.findOne({ key }).lean();
    return record?.data;
  },
  async set(key, value) {
    await Session.findOneAndUpdate(
      { key },
      { $set: { data: value, updatedAt: new Date() } },
      { upsert: true }
    );
  },
  async delete(key) {
    await Session.deleteOne({ key });
  }
};

function formatMessage(template, ctx) {
  const nickname = ctx.from?.first_name || ctx.from?.username || 'foydalanuvchi';
  const name = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || nickname;
  return String(template).replace(
    /\{(nickname|name|bot_username)\}/g,
    (match, key) =>
      ({
        nickname: escapeHtml(nickname),
        name: escapeHtml(name),
        bot_username: escapeHtml(bot.botInfo?.username || '')
      })[key] ?? match
  );
}

function configuredMessage(key, ctx) {
  return formatMessage(data.settings.messages?.[key] || defaultMessages[key], ctx);
}

function replyOptions(replyMarkup) {
  return replyMarkup ? { parse_mode: 'HTML', reply_markup: replyMarkup } : { parse_mode: 'HTML' };
}

function welcomeMessage(ctx) {
  return configuredMessage('welcome', ctx);
}

function welcomeMarkup(ctx) {
  return homeKeyboard(isAdmin(ctx)).reply_markup;
}

function subscriptionKeyboard(channels) {
  const rows = userSubscriptionKeyboard(channels).reply_markup.inline_keyboard;
  rows.push([Markup.button.callback('✅ Tekshirish', 'check_subscription')]);
  return styledInlineKeyboard(rows);
}

async function getRequiredChannels() {
  return channelService.listRequiredChannels();
}

async function requiredSubscription(ctx) {
  if (isAdmin(ctx)) return true;
  const channels = await getRequiredChannels();
  if (!channels.length) return true;
  const result = await checkRequiredChannelMembership(ctx.telegram, ctx.from.id, channels);
  for (const failure of result.failures) {
    logger.error(
      { err: failure.error, channelId: failure.channel.chatId },
      'Subscription check failed'
    );
  }
  if (result.subscribed) return true;
  const text = result.failures.length
    ? messages.subscriptionCheckFailed
    : configuredMessage('subscriptionRequired', ctx);
  await ctx.reply(text, replyOptions(subscriptionKeyboard(result.missingChannels).reply_markup));
  return false;
}

async function checkFullAdmin(ctx, channelInput, options) {
  return channelService.verifyAdminChannel(ctx.telegram, ctx.from.id, channelInput, options);
}

async function hydrateSettings() {
  const admins = await Admin.find({ active: true }).lean();
  adminRegistry.clear();
  admins.forEach((admin) => adminRegistry.set(admin.telegramId, admin));
  let configDocument = await BotConfig.findOne({ configKey: 'main_config' }).lean();
  if (!configDocument) {
    configDocument = await BotConfig.create({
      configKey: 'main_config',
      channels: [],
      settings: {}
    });
    configDocument = configDocument.toObject();
  }
  data.settings.requiredChannels = [];
  data.settings.messages = { ...defaultMessages };
  const storageChannelId = Number(configDocument.settings?.storageChannelId);
  data.settings.storageChannelId =
    Number.isSafeInteger(storageChannelId) && storageChannelId < 0 ? storageChannelId : null;
}

async function saveStorageChannelId(chatId, adminId) {
  await BotConfig.updateOne(
    { configKey: 'main_config' },
    {
      $set: {
        'settings.storageChannelId': Number(chatId),
        'settings.storageChannelSetBy': Number(adminId)
      }
    },
    { upsert: true }
  );
  data.settings.storageChannelId = Number(chatId);
}

async function notifyNewSubscriber(ctx) {
  if (isAdmin(ctx)) return;
  const count = await User.countDocuments();
  const nickname = escapeHtml(
    ctx.from.first_name || ctx.from.last_name || ctx.from.username || 'foydalanuvchi'
  );
  const profileLink = `<a href="tg://user?id=${Number(ctx.from.id)}">${nickname}</a>`;
  await bot.telegram.sendMessage(
    ADMIN_TG_ID,
    `Botga yangi obunachi qo'shildi: ${profileLink}\nObunachilar soni: ${count}`,
    { parse_mode: 'HTML', protect_content: false }
  );
}

function broadcastKeyboard() {
  return styledInlineKeyboard([
    [Markup.button.callback('➡️ Rasmsiz davom etish', 'broadcast:no_media')],
    [Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel')]
  ]);
}

function broadcastButtonKeyboard() {
  return styledInlineKeyboard([
    [Markup.button.callback("➕ Yana tugma qo'shish", 'broadcast:add_button')],
    [Markup.button.callback('👁 Preview', 'broadcast:preview')],
    [Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel')]
  ]);
}

function broadcastConfirmKeyboard() {
  return styledInlineKeyboard([
    [Markup.button.callback('📤 Yuborish', 'broadcast:send')],
    [Markup.button.callback('❌ Bekor qilish', 'broadcast:cancel')]
  ]);
}

function broadcastColorKeyboard() {
  return styledInlineKeyboard([
    [
      Markup.button.callback("🔵 Ko'k", 'broadcast:color:blue'),
      Markup.button.callback('🟢 Yashil', 'broadcast:color:green')
    ],
    [Markup.button.callback('🔴 Qizil', 'broadcast:color:red')]
  ]);
}

function broadcastExtra(broadcast, chatId) {
  const replyMarkup = broadcast.buttons?.length
    ? styledInlineKeyboard(broadcast.buttons).reply_markup
    : undefined;
  const commonExtra = replyMarkup ? { reply_markup: replyMarkup } : {};
  commonExtra.protect_content = shouldProtectContent(chatId);
  const textExtra = {
    ...commonExtra,
    ...(broadcast.captionEntities?.length
      ? { entities: broadcast.captionEntities }
      : { parse_mode: 'HTML' })
  };
  const mediaExtra = {
    ...commonExtra,
    ...(broadcast.captionEntities?.length
      ? { caption_entities: broadcast.captionEntities }
      : { parse_mode: 'HTML' })
  };
  return { textExtra, mediaExtra };
}

async function sendBroadcastMessage(chatId, broadcast) {
  const { textExtra, mediaExtra } = broadcastExtra(broadcast, chatId);
  if (broadcast.mediaType === 'photo') {
    return bot.telegram.sendPhoto(chatId, broadcast.media, {
      ...mediaExtra,
      caption: broadcast.caption || undefined
    });
  }
  if (broadcast.mediaType === 'video') {
    return bot.telegram.sendVideo(chatId, broadcast.media, {
      ...mediaExtra,
      caption: broadcast.caption || undefined
    });
  }
  if (broadcast.mediaType === 'animation') {
    return bot.telegram.sendAnimation(chatId, broadcast.media, {
      ...mediaExtra,
      caption: broadcast.caption || undefined
    });
  }
  return bot.telegram.sendMessage(chatId, broadcast.caption || ' ', textExtra);
}

async function previewBroadcast(ctx) {
  const broadcast = ctx.session?.broadcast;
  if (!broadcast) return ctx.reply('⚠️ Xabar yuborish jarayoni topilmadi.');
  try {
    await sendBroadcastMessage(ctx.from.id, broadcast);
    broadcast.previewed = true;
    return ctx.reply(
      '👁 Preview yuborildi. Tekshirib, yuborishni tasdiqlang.',
      broadcastConfirmKeyboard()
    );
  } catch (error) {
    return ctx.reply(`⚠️ Preview yuborilmadi: ${error.response?.description || error.message}`);
  }
}

async function sendBroadcast(ctx) {
  const draft = ctx.session?.broadcast;
  if (!draft) return { error: 'Xabar yuborish jarayoni topilmadi.' };

  const startedAt = new Date();
  const total = await User.countDocuments({
    blocked: { $ne: true },
    joinedAt: { $lte: startedAt }
  });
  let job;
  try {
    job = await BroadcastJob.findOneAndUpdate(
      { _id: 'main', status: { $ne: 'running' } },
      {
        $set: {
          status: 'running',
          mediaType: draft.mediaType || '',
          media: draft.media || '',
          caption: draft.caption || '',
          captionEntities: draft.captionEntities || [],
          buttons: draft.buttons || [],
          startedBy: Number(ctx.from.id),
          startedAt,
          completedAt: null,
          lastTelegramId: 0,
          total,
          processed: 0,
          sent: 0,
          failed: 0,
          blocked: 0
        },
        $inc: { runs: 1 }
      },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: false }
    ).lean();
  } catch (error) {
    if (error.code === 11000) return { alreadyRunning: true };
    throw error;
  }

  if (!job) return { alreadyRunning: true };
  startBroadcastWorker();
  return { total: job.total };
}

async function processBroadcastJob() {
  while (!shuttingDown) {
    const job = await BroadcastJob.findById('main').lean();
    if (!job || job.status !== 'running') return;

    const recipients = await User.find({
      telegramId: { $gt: job.lastTelegramId || 0 },
      joinedAt: { $lte: job.startedAt },
      blocked: { $ne: true }
    })
      .select({ telegramId: 1 })
      .sort({ telegramId: 1 })
      .limit(25)
      .lean();

    if (recipients.length === 0) {
      const completedJob = await BroadcastJob.findOneAndUpdate(
        { _id: 'main', status: 'running' },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            mediaType: '',
            media: '',
            caption: '',
            captionEntities: [],
            buttons: []
          }
        },
        { returnDocument: 'after' }
      ).lean();
      if (completedJob?.startedBy) {
        try {
          await bot.telegram.sendMessage(
            completedJob.startedBy,
            `Broadcast tugadi.\nYetib bordi: ${completedJob.sent}\nBloklagan: ${completedJob.blocked}\nXatolik: ${completedJob.failed}`,
            { protect_content: false }
          );
        } catch (error) {
          logger.error({ err: error }, 'Broadcast completion notification failed');
        }
      }
      return;
    }

    let processed = job.processed || 0;
    let sent = job.sent || 0;
    for (const recipient of recipients) {
      if (shuttingDown) return;
      let outcome = 'sent';
      let blocked = false;
      try {
        await retryAfterLimit(() => sendBroadcastMessage(recipient.telegramId, job));
      } catch (error) {
        outcome = 'failed';
        blocked = error.response?.error_code === 403;
        if (blocked) {
          await User.updateOne({ telegramId: recipient.telegramId }, { $set: { blocked: true } });
        }
        logger.error({ err: error, telegramId: recipient.telegramId }, 'Broadcast delivery failed');
      }

      const increments = { processed: 1, [outcome]: 1 };
      if (blocked) increments.blocked = 1;
      await BroadcastJob.updateOne(
        { _id: 'main', status: 'running' },
        {
          $set: { lastTelegramId: recipient.telegramId },
          $inc: increments
        }
      );
      processed += 1;
      if (outcome === 'sent') sent += 1;
      if (processed % 100 === 0 && job.startedBy) {
        try {
          await bot.telegram.sendMessage(
            job.startedBy,
            `Broadcast: ${processed}/${job.total}. Yetib bordi: ${sent}.`
          );
        } catch (error) {
          logger.error({ err: error }, 'Broadcast progress notification failed');
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
}

function startBroadcastWorker() {
  if (broadcastWorkerPromise) return broadcastWorkerPromise;
  broadcastWorkerPromise = processBroadcastJob()
    .catch((error) => {
      logger.error({ err: error }, 'Broadcast worker paused');
    })
    .finally(() => {
      broadcastWorkerPromise = null;
    });
  return broadcastWorkerPromise;
}

async function resumeBroadcastWorker() {
  if (broadcastWorkerPromise) return;
  const activeJob = await BroadcastJob.findOne({ _id: 'main', status: 'running' }).lean();
  if (activeJob) startBroadcastWorker();
}

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected; waiting for Mongoose to reconnect');
});

mongoose.connection.on('error', (error) => {
  logger.error({ err: error }, 'MongoDB connection error');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
  Promise.resolve(broadcastWorkerPromise)
    .then(() => resumeBroadcastWorker())
    .catch((error) => logger.error({ err: error }, 'Could not resume broadcast'));
});

async function adminStats(ctx) {
  const stats = await getStatistics(config.timezone);
  const dailyUsers = stats.newUsersPerDay.length
    ? stats.newUsersPerDay.map((entry) => `${entry._id}: ${entry.count}`).join('\n')
    : 'Ma’lumot yo‘q';
  const topMovies = stats.topMovies.length
    ? stats.topMovies
        .map(
          (movie, index) =>
            `${index + 1}. ${escapeHtml(movie.title)} (#${movie.code}) — ${movie.views} marta`
        )
        .join('\n')
    : messages.noMovies;
  return ctx.reply(
    `<b>${messages.adminStatsTitle}</b>\n\n` +
      `<blockquote>${messages.adminStatsUsers
        .replace('{total}', String(stats.totalUsers))
        .replace('{day}', String(stats.activeToday))
        .replace('{week}', String(stats.activeWeek))
        .replace(
          '{month}',
          String(stats.activeMonth)
        )}\n${messages.adminStatsMovies.replace('{total}', String(stats.totalMovies))}</blockquote>\n\n` +
      `<b>${messages.adminStatsNewUsers}</b>\n${dailyUsers}\n\n` +
      `<b>${messages.adminStatsTopMovies}</b>\n${topMovies}\n\n` +
      `<blockquote>Broadcastlar: ${stats.broadcast.runs}\nYetib borgan: ${stats.broadcast.sent}\nBloklagan: ${stats.broadcast.blocked}\nXatolik: ${stats.broadcast.failed}</blockquote>`,
    replyOptions(adminKeyboard(ctx).reply_markup)
  );
}

async function handleStart(ctx) {
  if (ctx.isNewUser) {
    try {
      await notifyNewSubscriber(ctx);
    } catch (error) {
      logger.error({ err: error }, 'New subscriber notification failed');
    }
  }
  const payload = String(ctx.startPayload || '').trim();
  const match = /^movie_(\d+)$/.exec(payload);
  if (match) {
    const movie = await movieService.findMovieByCode(match[1]);
    if (!movie) return ctx.reply(messages.movieNotFound);
    const chatId = ctx.chat?.id || ctx.from?.id;
    const favorite = await favoriteService.isFavorite(ctx.from.id, movie._id);
    const options = {
      caption: messages.movieCaption(movie, (movie.views || 0) + 1),
      parse_mode: 'HTML',
      protect_content: true,
      reply_markup: movieCardKeyboard(movie, favorite, ctx.botInfo?.username).reply_markup
    };
    await retryAfterLimit(() =>
      sendStoredMedia({
        telegram: ctx.telegram,
        chatId,
        fileId: movie.fileId,
        mediaType: movie.mediaType,
        options
      })
    );
    await movieService.incrementMovieViews(movie._id).catch((error) => {
      logger.error(
        { err: error, movieId: String(movie._id) },
        'Could not increment movie view count'
      );
    });
    return;
  }
  return ctx.reply(
    formatMessage(messages.welcome, ctx),
    replyOptions(welcomeMarkup(ctx) || userKeyboard(ctx).reply_markup)
  );
}

bot.use(async (ctx, next) => {
  if (ctx.chat && ctx.chat.type !== 'private') return;
  return next();
});

bot.use(session({ store: persistentSessionStore }));

bot.use(async (ctx, next) => {
  const payload = String(ctx.startPayload || '').trim();
  if (/^movie_\d+$/.test(payload) && ctx.session) {
    ctx.session.pendingMoviePayload = payload;
  }
  return next();
});

bot.use(async (ctx, next) => {
  const reply = ctx.reply.bind(ctx);
  ctx.reply = (text, extra = {}) => {
    const formattedText = typeof text === 'string' ? toPremiumEmojiMarkup(text) : text;
    const options = { ...(extra || {}), protect_content: !isAdmin(ctx) };
    if (typeof formattedText === 'string' && formattedText.includes('<tg-emoji')) {
      options.parse_mode = options.parse_mode || 'HTML';
    }
    return reply(formattedText, options);
  };
  return next();
});

bot.use(async (ctx, next) => {
  if (ctx.answerCbQuery) {
    const answerCbQuery = ctx.answerCbQuery.bind(ctx);
    ctx.answerCbQuery = async (text, extra) => {
      try {
        return await answerCbQuery(text, extra);
      } catch (error) {
        if (isExpiredCallbackError(error)) return false;
        throw error;
      }
    };
  }
  return next();
});

bot.use(errorBoundary({ logger, isAdmin }));
bot.use(createRateLimitMiddleware({ isAdmin }));
bot.use(registrationMiddleware());
bot.use(banCheckMiddleware({ isAdmin }));

bot.use(async (ctx, next) => {
  if (ctx.callbackQuery?.data === 'check_subscription') return next();
  if (
    ctx.callbackQuery?.data &&
    isAdmin(ctx) &&
    /^(?:admin:|broadcast:)/.test(ctx.callbackQuery.data) &&
    ctx.callbackQuery.data !== 'admin:panel' &&
    !isAdminPanelActive(ctx)
  ) {
    await ctx.answerCbQuery('Avval /admin orqali panelni oching.', { show_alert: true });
    return;
  }
  if (ctx.callbackQuery?.data && isAdmin(ctx)) {
    const permission = permissionForCallback(ctx.callbackQuery.data);
    if (permission && !hasPermission(ctx, permission)) {
      await ctx.answerCbQuery("Bu amal uchun sizda huquq yo'q.", { show_alert: true });
      return;
    }
  }
  return next();
});

bot.use(
  subscriptionCheckMiddleware({
    isAdmin,
    listChannels: getRequiredChannels,
    buildKeyboard: (channels) => subscriptionKeyboard(channels).reply_markup,
    texts: {
      ...messages,
      subscriptionRequired: messages.subscriptionRequired
    },
    logger
  })
);
bot.use(stage.middleware());

bot.start(handleStart);

bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery();
  if (await requiredSubscription(ctx)) {
    const payload = String(ctx.session?.pendingMoviePayload || '').trim();
    ctx.session.pendingMoviePayload = undefined;
    const match = /^movie_(\d+)$/.exec(payload);
    if (match) {
      const movie = await movieService.findMovieByCode(match[1]);
      if (!movie) return ctx.reply(messages.movieNotFound);
      const chatId = ctx.chat?.id || ctx.from?.id;
      const favorite = await favoriteService.isFavorite(ctx.from.id, movie._id);
      const options = {
        caption: messages.movieCaption(movie, (movie.views || 0) + 1),
        parse_mode: 'HTML',
        protect_content: true,
        reply_markup: movieCardKeyboard(
          movie,
          favorite,
          ctx.botInfo?.username || bot.botInfo?.username
        ).reply_markup
      };
      await retryAfterLimit(() =>
        sendStoredMedia({
          telegram: ctx.telegram,
          chatId,
          fileId: movie.fileId,
          mediaType: movie.mediaType,
          options
        })
      );
      await movieService.incrementMovieViews(movie._id).catch((error) => {
        logger.error(
          { err: error, movieId: String(movie._id) },
          'Could not increment movie view count'
        );
      });
      return;
    }
    return ctx.reply(
      formatMessage(messages.welcome, ctx),
      replyOptions(welcomeMarkup(ctx) || userKeyboard(ctx).reply_markup)
    );
  }
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(messages.helpText, replyOptions());
});

registerUserHandlers(bot, {
  isAdmin,
  getRequiredChannels,
  logger
});
registerAdminHandlers(bot, {
  isAdmin,
  hasPermission,
  getStorageChannelId: () => data.settings.storageChannelId,
  logger
});

function permissionForCallback(callbackData) {
  if (callbackData === 'admin:stats') return 'stats';
  if (
    callbackData === 'admin:admins' ||
    callbackData === 'admin:add' ||
    callbackData.startsWith('admin:manage:') ||
    callbackData.startsWith('admin:perm:') ||
    callbackData.startsWith('admin:remove:')
  )
    return 'admins';
  if (callbackData.startsWith('admin:movie:') || callbackData.startsWith('admin:retro:'))
    return 'movies';
  if (callbackData === 'admin:users' || callbackData.startsWith('admin:user:')) return 'users';
  if (callbackData.startsWith('broadcast:')) return 'broadcast';
  if (/^admin:(?:subscription|required_list|subscription_off|storage|channel:)/.test(callbackData))
    return 'settings';
  return null;
}

bot.hears(/^(?:Admin panel|🛠 Admin panel)$/, (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
  activateAdminPanel(ctx);
  return ctx.reply('🛠 Admin panel', adminKeyboard(ctx));
});

bot.command('admin', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
  activateAdminPanel(ctx);
  return ctx.reply('🛠 Admin panel', adminKeyboard(ctx));
});

bot.action('admin:retro:add', async (ctx) => {
  await ctx.answerCbQuery();
  if (!hasPermission(ctx, 'movies')) return ctx.reply(messages.noAccess);
  return ctx.scene.enter('admin-add-retro-game');
});

bot.action('admin:stats', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
  return adminStats(ctx);
});

bot.action('admin:panel', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
  activateAdminPanel(ctx);
  return ctx.reply('🛠 Admin panel', adminKeyboard(ctx));
});

bot.action('admin:exit', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
  reset(ctx, true);
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch (error) {
    logger.warn({ err: error }, 'Admin panel close failed');
  }
  return ctx.reply(welcomeMessage(ctx), replyOptions(welcomeMarkup(ctx)));
});

bot.action('admin:admins', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply("⛔ Faqat asosiy admin bu bo'limni boshqaradi.");
  const admins = await Admin.find({ active: true }).sort({ createdAt: 1 }).lean();
  const text = admins.length
    ? admins
        .map(
          (admin, index) =>
            `${index + 1}. ${admin.nickname || admin.username || admin.telegramId} - ${permissionsLabel(admin.permissions)}`
        )
        .join('\n')
    : "📭 Hali qo'shimcha adminlar yo'q.";
  const rows = admins.map((admin) => [
    Markup.button.callback(
      `⚙️ ${admin.nickname || admin.username || admin.telegramId}`,
      `admin:manage:${admin.telegramId}`
    )
  ]);
  rows.push([Markup.button.callback("➕ Admin qo'shish", 'admin:add')]);
  rows.push([Markup.button.callback('⬅️ Admin panel', 'admin:panel')]);
  return ctx.reply(`👥 Adminlar\n\n${text}`, styledInlineKeyboard(rows));
});

bot.action('admin:add', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply("⛔ Faqat asosiy admin bu bo'limni boshqaradi.");
  ctx.session = { step: 'admin_add', adminPanelActive: true };
  return ctx.reply("➕ Qo'shiladigan adminning Telegram ID raqamini yuboring:");
});

bot.action(/^admin:manage:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply("⛔ Faqat asosiy admin bu bo'limni boshqaradi.");
  const admin = await Admin.findOne({ telegramId: Number(ctx.match[1]), active: true }).lean();
  if (!admin) return ctx.reply('🔎 Admin topilmadi.', adminKeyboard(ctx));
  return ctx.reply(
    `👤 Admin: ${admin.nickname || admin.username || admin.telegramId}\n🆔 ID: ${admin.telegramId}\n🔐 Huquqlar: ${permissionsLabel(admin.permissions)}`,
    adminManagementKeyboard(admin)
  );
});

bot.action(/^admin:perm:(\d+):(movies|users|broadcast|stats|settings|admins)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply("⛔ Faqat asosiy admin bu bo'limni boshqaradi.");
  const telegramId = Number(ctx.match[1]);
  const permission = ctx.match[2];
  const admin = await Admin.findOne({ telegramId, active: true });
  if (!admin) return ctx.reply('🔎 Admin topilmadi.', adminKeyboard(ctx));
  admin.permissions = admin.permissions.includes(permission)
    ? admin.permissions.filter((item) => item !== permission)
    : [...admin.permissions, permission];
  await admin.save();
  adminRegistry.set(telegramId, admin.toObject());
  return ctx.reply(
    `✅ Huquq yangilandi.\n\n🔐 Huquqlar: ${permissionsLabel(admin.permissions)}`,
    adminManagementKeyboard(admin)
  );
});

bot.action(/^admin:remove:(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply("⛔ Faqat asosiy admin bu bo'limni boshqaradi.");
  const telegramId = Number(ctx.match[1]);
  await Admin.updateOne({ telegramId }, { $set: { active: false } });
  adminRegistry.delete(telegramId);
  return ctx.reply("🗑 Admin o'chirildi.", adminKeyboard(ctx));
});

bot.action('admin:broadcast', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
  ctx.session = { step: 'broadcast_media', broadcast: { buttons: [] }, adminPanelActive: true };
  return ctx.reply(
    `${toPremiumEmojiMarkup('🖼')} Xabar uchun rasm, video yoki GIF yuboring. Media shart emas:`,
    replyOptions(broadcastKeyboard().reply_markup)
  );
});

bot.action('broadcast:no_media', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media')
    return ctx.reply('⚠️ Broadcast jarayoni topilmadi.');
  ctx.session.step = 'broadcast_caption';
  return ctx.reply(
    `${toPremiumEmojiMarkup('💬')} Xabar matnini yuboring. Premium emoji uchun HTML teglaridan foydalanishingiz mumkin:`,
    replyOptions()
  );
});

bot.action('broadcast:add_button', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_buttons')
    return ctx.reply('📝 Avval xabar matnini kiriting.');
  ctx.session.step = 'broadcast_button_text';
  return ctx.reply('➕ Inline tugma matnini yuboring:');
});

bot.action('broadcast:preview', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_buttons')
    return ctx.reply('⚠️ Avval xabarni tayyorlang.');
  return previewBroadcast(ctx);
});

bot.action(/^broadcast:color:(blue|green|red)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_button_color')
    return ctx.reply('⚠️ Tugma rangi tanlash bosqichi topilmadi.');
  const style = { blue: 'primary', green: 'success', red: 'danger' }[ctx.match[1]];
  ctx.session.broadcast.buttons.push([
    {
      text: ctx.session.pendingButtonText,
      url: ctx.session.pendingButtonUrl,
      style
    }
  ]);
  ctx.session.pendingButtonText = undefined;
  ctx.session.pendingButtonUrl = undefined;
  ctx.session.step = 'broadcast_buttons';
  return ctx.reply("✅ Tugma qo'shildi. Yana tugma qo'shasizmi?", broadcastButtonKeyboard());
});

bot.action('broadcast:send', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx) || !ctx.session?.broadcast?.previewed)
    return ctx.reply('👁 Avval Preview tugmasini bosing.');
  const result = await sendBroadcast(ctx);
  reset(ctx);
  if (result.alreadyRunning)
    return ctx.reply('⏳ Boshqa broadcast hozir davom etmoqda.', adminKeyboard(ctx));
  if (result.error) return ctx.reply(result.error, adminKeyboard(ctx));
  return ctx.reply(
    `Broadcast boshlandi.\nJami qabul qiluvchilar: ${result.total}`,
    adminKeyboard(ctx)
  );
});

bot.action('broadcast:cancel', async (ctx) => {
  await ctx.answerCbQuery();
  reset(ctx);
  return ctx.reply('❌ Xabar yuborish bekor qilindi.', adminKeyboard(ctx));
});

bot.action('admin:subscription', async (ctx) => {
  await ctx.answerCbQuery();
  if (!hasPermission(ctx, 'settings')) return ctx.reply("⛔ Ruxsat yo'q.");
  ctx.session = { step: 'required_subscription_chat', adminPanelActive: true };
  return ctx.reply(messages.adminChooseRequiredChat, requiredChatPickerKeyboard());
});

bot.action('welcome:required_add', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isOwner(ctx)) return ctx.reply('⛔ Faqat asosiy admin bu amalni bajarishi mumkin.');
  ctx.session = { step: 'required_subscription_chat', adminPanelActive: true };
  return ctx.reply(messages.adminChooseRequiredChat, requiredChatPickerKeyboard());
});

bot.action('admin:storage', async (ctx) => {
  await ctx.answerCbQuery();
  if (!hasPermission(ctx, 'settings')) return ctx.reply("⛔ Ruxsat yo'q.");
  ctx.session = { step: 'storage_chat', adminPanelActive: true };
  return ctx.reply(messages.adminChooseStorageChannel, storageChatPickerKeyboard());
});

bot.action('admin:required_list', async (ctx) => {
  await ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
  const channels = await getRequiredChannels();
  if (!channels.length) return ctx.reply('📭 Majburiy obuna kanallari yo‘q.', adminKeyboard(ctx));
  const rows = channels.map((channel, index) => [
    Markup.button.callback(
      `🗑 ${index + 1}. ${String(channel.title || channel.username || channel.chatId).slice(0, 36)}`,
      `admin:channel:remove:${channel.chatId}`
    )
  ]);
  rows.push([Markup.button.callback('🛠 Admin panel', 'admin:panel')]);
  return ctx.reply(
    channels
      .map(
        (channel, index) =>
          `📢 ${index + 1} - ${channel.title || channel.username || channel.chatId}`
      )
      .join('\n'),
    styledInlineKeyboard(rows)
  );
});

bot.action(/^admin:channel:remove:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!hasPermission(ctx, 'settings')) return ctx.reply("⛔ Ruxsat yo'q.");
  const channel = (await getRequiredChannels()).find(
    (item) => item.chatId === Number(ctx.match[1])
  );
  if (!channel) return ctx.reply('🔎 Kanal topilmadi.');
  return ctx.reply(
    `⚠️ “${escapeHtml(channel.title || channel.username || channel.chatId)}” kanalini o‘chirasizmi?`,
    styledInlineKeyboard([
      [Markup.button.callback('🗑 Ha, o‘chirish', `admin:channel:delete:${channel.chatId}`)],
      [Markup.button.callback('❌ Bekor qilish', 'admin:required_list')]
    ])
  );
});

bot.action(/^admin:channel:delete:(-?\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  if (!hasPermission(ctx, 'settings')) return ctx.reply("⛔ Ruxsat yo'q.");
  const deleted = await channelService.removeRequiredChannel(ctx.match[1]);
  return ctx.reply(
    deleted ? messages.adminChannelRemoved : '🔎 Kanal topilmadi.',
    adminKeyboard(ctx)
  );
});

bot.action('admin:subscription_off', async (ctx) => {
  await ctx.answerCbQuery();
  if (!hasPermission(ctx, 'settings')) return ctx.reply("⛔ Ruxsat yo'q.");
  await channelService.clearRequiredChannels();
  data.settings.requiredChannels = [];
  return ctx.reply('✅ Majburiy obuna o‘chirildi.', adminKeyboard(ctx));
});

async function storeBroadcastMedia(ctx, mediaType) {
  const storageChannelId = data.settings.storageChannelId;
  if (!Number.isSafeInteger(storageChannelId) || storageChannelId >= 0) {
    throw new Error(messages.adminStorageNotConfigured);
  }
  const storedMessage = await ctx.telegram.forwardMessage(
    storageChannelId,
    ctx.chat.id,
    ctx.message.message_id
  );
  const fileId =
    mediaType === 'photo'
      ? storedMessage.photo?.at(-1)?.file_id
      : storedMessage[mediaType]?.file_id;
  if (!fileId) throw new Error('⚠️ Saqlangan Telegram media fayl ID sini aniqlab bo‘lmadi.');
  return fileId;
}

bot.on('video', async (ctx) => {
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media') {
    return ctx.reply('⚠️ Bu turdagi media xabar qabul qilinmaydi.');
  }
  let fileId;
  try {
    fileId = await storeBroadcastMedia(ctx, 'video');
  } catch (error) {
    logger.error({ err: error }, 'Broadcast video storage failed');
    return ctx.reply(
      `⚠️ Video saqlash kanaliga joylanmadi: ${error.response?.description || error.message}`
    );
  }
  ctx.session.broadcast.mediaType = 'video';
  ctx.session.broadcast.media = fileId;
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('📝 Media uchun izoh yuboring:');
});

bot.on('photo', async (ctx) => {
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media') {
    return ctx.reply('⚠️ Bu turdagi media xabar qabul qilinmaydi.');
  }
  let fileId;
  try {
    fileId = await storeBroadcastMedia(ctx, 'photo');
  } catch (error) {
    logger.error({ err: error }, 'Broadcast photo storage failed');
    return ctx.reply(
      `⚠️ Rasm saqlash kanaliga joylanmadi: ${error.response?.description || error.message}`
    );
  }
  ctx.session.broadcast.mediaType = 'photo';
  ctx.session.broadcast.media = fileId;
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('📝 Media uchun izoh yuboring:');
});

bot.on('animation', async (ctx) => {
  if (!isAdmin(ctx) || ctx.session?.step !== 'broadcast_media') {
    return ctx.reply('⚠️ Bu turdagi media xabar qabul qilinmaydi.');
  }
  let fileId;
  try {
    fileId = await storeBroadcastMedia(ctx, 'animation');
  } catch (error) {
    logger.error({ err: error }, 'Broadcast animation storage failed');
    return ctx.reply(
      `⚠️ GIF saqlash kanaliga joylanmadi: ${error.response?.description || error.message}`
    );
  }
  ctx.session.broadcast.mediaType = 'animation';
  ctx.session.broadcast.media = fileId;
  ctx.session.step = 'broadcast_caption';
  return ctx.reply('📝 Media uchun izoh yuboring:');
});

bot.on('text', async (ctx) => {
  const rawText = ctx.message.text;
  const value = rawText.trim();
  const step = ctx.session?.step;
  if (
    value === messages.adminCancelPicker &&
    ['required_subscription_chat', 'storage_chat'].includes(step)
  ) {
    reset(ctx);
    await ctx.reply(messages.adminPickerCancelled, Markup.removeKeyboard());
    return ctx.reply('🛠 Admin panel', adminKeyboard(ctx));
  }
  if (value.startsWith('/')) {
    reset(ctx);
    return ctx.reply('⚠️ Bu buyruq mavjud emas.');
  }
  if (/^(?:Admin panel|🛠 Admin panel)$/.test(value)) {
    if (!isAdmin(ctx)) return ctx.reply("⛔ Ruxsat yo'q.");
    activateAdminPanel(ctx);
    return ctx.reply('🛠 Admin panel', adminKeyboard(ctx));
  }
  if (step === 'broadcast_caption') {
    ctx.session.broadcast.caption = rawText;
    ctx.session.broadcast.captionEntities = ctx.message.entities || [];
    ctx.session.step = 'broadcast_buttons';
    return ctx.reply("➕ Inline tugma qo'shasizmi?", broadcastButtonKeyboard());
  }
  if (step === 'broadcast_button_text') {
    ctx.session.pendingButtonText = value;
    ctx.session.step = 'broadcast_button_url';
    return ctx.reply('🔗 Tugma havolasini yuboring (https://...):');
  }
  if (step === 'broadcast_button_url') {
    if (!isHttpUrl(value))
      return ctx.reply('⚠️ Havola http:// yoki https:// bilan boshlanishi kerak. Qayta yuboring:');
    ctx.session.pendingButtonUrl = value;
    ctx.session.step = 'broadcast_button_color';
    return ctx.reply('🎨 Tugma rangini tanlang:', broadcastColorKeyboard());
  }
  if (step === 'admin_add') {
    if (!isOwner(ctx)) return ctx.reply("⛔ Faqat asosiy admin yangi admin qo'sha oladi.");
    if (!/^\d+$/.test(value))
      return ctx.reply("⚠️ Telegram ID faqat raqamlardan iborat bo'lishi kerak:");
    const telegramId = Number(value);
    if (ADMIN_TG_IDS.has(telegramId))
      return ctx.reply("⚠️ Asosiy adminni qayta qo'shib bo'lmaydi.");
    const admin = await Admin.findOneAndUpdate(
      { telegramId },
      { $set: { active: true }, $setOnInsert: { telegramId, permissions: [] } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    adminRegistry.set(telegramId, admin);
    reset(ctx);
    return ctx.reply(
      `✅ Admin qo\'shildi: ${telegramId}. Endi uning huquqlarini belgilang.`,
      adminKeyboard(ctx)
    );
  }
  return ctx.reply('Bu xabar uchun faol funksiya mavjud emas.', replyOptions());
});

bot.on('message', async (ctx, next) => {
  const sharedChat = ctx.message?.chat_shared;
  if (!sharedChat || !isAdmin(ctx)) return next();

  const requestId = sharedChat.request_id;
  const isRequiredChannel =
    requestId === chatPickerRequestIds.requiredChannel &&
    ctx.session?.step === 'required_subscription_chat';
  const isRequiredGroup =
    requestId === chatPickerRequestIds.requiredGroup &&
    ctx.session?.step === 'required_subscription_chat';
  const isStorageChannel =
    requestId === chatPickerRequestIds.storage && ctx.session?.step === 'storage_chat';
  if (!isRequiredChannel && !isRequiredGroup && !isStorageChannel) return;

  try {
    const chat = await checkFullAdmin(ctx, sharedChat.chat_id, {
      allowGroups: !isStorageChannel,
      createInviteLink: !isStorageChannel
    });
    if (isStorageChannel) {
      await saveStorageChannelId(chat.chatId, ctx.from.id);
      reset(ctx);
      ctx.session = { adminPanelActive: true };
      await ctx.reply(
        messages.adminStorageChannelSaved.replace('{title}', escapeHtml(chat.title)),
        Markup.removeKeyboard()
      );
      return ctx.reply('🛠 Admin panel', adminKeyboard(ctx));
    }

    await channelService.addRequiredChannel(chat, ctx.from.id);
    reset(ctx);
    ctx.session = { adminPanelActive: true };
    await ctx.reply(
      messages.adminRequiredChatAdded.replace('{title}', escapeHtml(chat.title)),
      Markup.removeKeyboard()
    );
    return ctx.reply('🛠 Admin panel', adminKeyboard(ctx));
  } catch (error) {
    logger.warn(
      { err: error, chatId: sharedChat.chat_id, telegramId: ctx.from.id },
      'Could not configure selected chat'
    );
    return ctx.reply(
      messages.adminChatSharedFailed,
      isStorageChannel ? storageChatPickerKeyboard() : requiredChatPickerKeyboard()
    );
  }
});

bot.on('callback_query', async (ctx) => {
  await safeAnswerCbQuery(ctx);
  reset(ctx);
});

bot.catch(async (error, ctx) => {
  logger.error({ err: error, updateType: ctx.updateType }, 'Update failed');
  await safeAnswerCbQuery(ctx);
  try {
    if (ctx.from?.id)
      await ctx.telegram.sendMessage(
        ctx.from.id,
        "⚠️ Texnik xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
        { protect_content: !isAdmin(ctx) }
      );
  } catch (replyError) {
    logger.error({ err: replyError }, 'Error notification failed');
  }
});

async function safeAnswerCbQuery(ctx) {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCbQuery();
  } catch {}
}

async function startBot() {
  config.validateConfig();

  httpServer = app.listen(port, '0.0.0.0');
  try {
    await new Promise((resolve, reject) => {
      httpServer.once('listening', resolve);
      httpServer.once('error', reject);
    });
    logger.info({ port }, 'Express server listening');

    await mongoose.connect(config.mongoUri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000
    });
    await movieService.prepareMovieTextIndex();
    await Promise.all(Object.values(models).map((model) => model.init()));
    await channelService.migrateLegacyRequiredChannels();
    await hydrateSettings();
    await configureBotCommands();

    if (config.renderExternalUrl) {
      bot.botInfo = await bot.telegram.getMe();
      const webhookUrl = new URL(webhookPath, config.renderExternalUrl).toString();
      webhookReady = true;
      await bot.telegram.setWebhook(webhookUrl, {
        secret_token: config.webhookSecret,
        allowed_updates: allowedUpdates
      });
      logger.info('Telegram webhook configured');
    } else {
      await bot.telegram.deleteWebhook({ drop_pending_updates: false });
      await bot.launch({ allowedUpdates });
      pollingStarted = true;
      logger.info('Telegram polling mode started');
    }

    await resumeBroadcastWorker().catch((error) => {
      logger.error({ err: error }, 'Could not check for a resumable broadcast');
    });
    logger.info('Movie bot started');
    return httpServer;
  } catch (error) {
    webhookReady = false;
    if (pollingStarted) {
      bot.stop('STARTUP_FAILED');
      pollingStarted = false;
    }
    if (httpServer?.listening) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    throw error;
  }
}

async function configureBotCommands() {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Botni ishga tushirish va asosiy menyu' },
      { command: 'help', description: 'Bot imkoniyatlari haqida yordam' },
      { command: 'admin', description: 'Administrator panelini ochish' }
    ]);
  } catch (error) {
    logger.warn({ err: error }, 'Could not configure Telegram bot commands');
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  webhookReady = false;
  if (pollingStarted) {
    bot.stop(signal);
    pollingStarted = false;
  }
  if (httpServer?.listening) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  const shutdownDeadline = Date.now() + 15000;
  while (
    (webhookUpdateQueue.length > 0 || activeUpdateWorkers > 0) &&
    Date.now() < shutdownDeadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (broadcastWorkerPromise) await broadcastWorkerPromise;
  await mongoose.disconnect();
  logger.info({ signal }, 'Shutdown complete');
}

if (require.main === module) {
  startBot().catch(async (error) => {
    if (isPollingConflict(error)) {
      logger.fatal(
        { errorCode: error.response.error_code, description: error.response.description },
        'Another process is already polling this bot token; stop the other instance and run only one polling process'
      );
    } else {
      logger.fatal({ err: error }, 'Bot startup failed');
    }
    process.exitCode = 1;
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
}

process.once('SIGINT', () =>
  shutdown('SIGINT').catch((error) => {
    logger.error({ err: error }, 'SIGINT shutdown failed');
    process.exitCode = 1;
  })
);
process.once('SIGTERM', () =>
  shutdown('SIGTERM').catch((error) => {
    logger.error({ err: error }, 'SIGTERM shutdown failed');
    process.exitCode = 1;
  })
);
