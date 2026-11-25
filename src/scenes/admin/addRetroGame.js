const { Markup, Scenes } = require('telegraf');
const messages = require('../../messages/uz');
const retroGameService = require('../../services/retroGameService');
const { storeTelegramMedia } = require('../../services/mediaStorageService');
const { toPremiumEmojiMarkup } = require('../../utils/premiumEmoji');

function createAddRetroGameScene({ canManageMovies, getStorageChannelId, logger = console }) {
  const scene = new Scenes.WizardScene(
    'admin-add-retro-game',
    async (ctx) => {
      if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
      ctx.wizard.next();
      return ctx.reply(messages.adminRetroVideo);
    },
    async (ctx) => {
      if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
      const video = ctx.message?.video;
      const document = ctx.message?.document;
      const videoDocument =
        document && (!document.mime_type || document.mime_type.startsWith('video/'));
      const media = video || (videoDocument ? document : null);
      if (!media?.file_id) return ctx.reply(messages.adminRetroInvalidMedia);

      try {
        ctx.wizard.state.fileId = await storeTelegramMedia({
          telegram: ctx.telegram,
          chatId: ctx.chat.id,
          messageId: ctx.message.message_id,
          media,
          mediaType: video ? 'video' : 'document',
          storageChannelId: await getStorageChannelId()
        });
      } catch (error) {
        logger.error({ err: error, telegramId: ctx.from.id }, 'Could not store retro game media');
        return ctx.reply(messages.adminRetroStorageFailed);
      }
      ctx.wizard.state.mediaType = video ? 'video' : 'document';
      ctx.wizard.next();
      return ctx.reply(messages.adminRetroDate);
    },
    async (ctx) => readTextStep(ctx, 'date', messages.adminRetroDate, messages.adminRetroTitle, 80),
    async (ctx) =>
      readTextStep(ctx, 'title', messages.adminRetroTitle, messages.adminRetroCode, 200),
    async (ctx) => {
      if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
      const code = Number(ctx.message?.text?.trim());
      if (!Number.isSafeInteger(code) || code <= 0) {
        return ctx.reply(messages.adminRetroCode);
      }
      if (!(await retroGameService.isRetroGameCodeAvailable(code))) {
        return ctx.reply(messages.adminRetroDuplicateCode);
      }
      ctx.wizard.state.code = code;
      ctx.wizard.next();
      const preview = toPremiumEmojiMarkup(
        `${messages.adminRetroConfirm}\n` +
        `🆔 Kod: ${code}\n📅 Sana: ${escapeHtml(ctx.wizard.state.date)}\n` +
        `⚽ O'yin: ${escapeHtml(ctx.wizard.state.title)}`
      );
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [Markup.button.callback(messages.adminRetroSave, 'admin:retro:add:save')],
            [Markup.button.callback(messages.adminRetroCancel, 'admin:retro:add:cancel')]
          ]
        }
      };
      return ctx.reply(preview, { parse_mode: 'HTML', ...keyboard });
    }
  );

  scene.use(async (ctx, next) => {
    if (canManageMovies(ctx)) return next();
    return leaveUnauthorized(ctx);
  });

  scene.action('admin:retro:add:save', async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
    try {
      const game = await retroGameService.createRetroGame({
        ...ctx.wizard.state,
        addedBy: Number(ctx.from.id)
      });
      await ctx.scene.leave();
      ctx.session.adminPanelActive = true;
      return ctx.reply(messages.adminRetroSaved.replace('{code}', String(game.code)));
    } catch (error) {
      if (error.code === 11000) return ctx.reply(messages.adminRetroDuplicateCode);
      logger.error({ err: error, telegramId: ctx.from.id }, 'Retro game creation failed');
      return ctx.reply(messages.adminRetroSaveFailed);
    }
  });

  scene.action('admin:retro:add:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    ctx.session.adminPanelActive = true;
    return ctx.reply(messages.adminRetroCancel);
  });

  async function readTextStep(ctx, field, currentPrompt, nextPrompt, maxLength) {
    if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
    const value = String(ctx.message?.text || '').trim();
    if (!value || value.length > maxLength) return ctx.reply(currentPrompt);
    ctx.wizard.state[field] = value;
    ctx.wizard.next();
    return ctx.reply(nextPrompt);
  }

  async function leaveUnauthorized(ctx) {
    await ctx.scene.leave();
    return ctx.reply(messages.noAccess);
  }

  return scene;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { createAddRetroGameScene };
