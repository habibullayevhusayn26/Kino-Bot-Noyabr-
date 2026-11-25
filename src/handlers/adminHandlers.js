const { Markup } = require('telegraf');
const messages = require('../messages/uz');
const { styledInlineKeyboard } = require('../keyboards/styled');
const movieService = require('../services/movieService');
const userService = require('../services/userService');
const { storeTelegramMedia } = require('../services/mediaStorageService');

const MOVIES_PER_PAGE = 8;
const EDIT_FIELDS = [
  ['title', 'adminMovieFieldTitle'],
  ['genre', 'adminMovieFieldGenre'],
  ['year', 'adminMovieFieldYear'],
  ['language', 'adminMovieFieldLanguage'],
  ['quality', 'adminMovieFieldQuality'],
  ['description', 'adminMovieFieldDescription'],
  ['media', 'adminMovieFieldMedia']
];

function registerAdminHandlers(
  bot,
  { isAdmin, hasPermission, getStorageChannelId, logger = console }
) {
  function canManage(ctx, permission) {
    return isAdmin(ctx) && hasPermission(ctx, permission);
  }

  async function renderMovieList(ctx, page) {
    const result = await movieService.listAllMovies({ page, pageSize: MOVIES_PER_PAGE });
    ctx.session.adminMoviePage = result.page;
    if (!result.items.length) return ctx.reply(messages.noMovies);

    const rows = result.items.map((movie) => [
      Markup.button.callback(
        `🎬 ${movie.code} | ${truncate(movie.title, 42)} (${movie.year})`,
        `admin:movie:show:${movie.code}`
      )
    ]);
    const navigation = [];
    if (result.page > 1)
      navigation.push(Markup.button.callback('⬅️ Oldingi', 'admin:movie:page:previous'));
    if (result.hasMore)
      navigation.push(Markup.button.callback('Keyingi ➡️', 'admin:movie:page:next'));
    if (navigation.length) rows.push(navigation);
    rows.push([Markup.button.callback('🛠 Admin panel', 'admin:panel')]);
    return ctx.reply(`${messages.adminMovies} — ${result.total} ta`, styledInlineKeyboard(rows));
  }

  async function showMovie(ctx, code) {
    const movie = await movieService.findMovieByCode(code);
    if (!movie) return ctx.reply(messages.adminMovieNotFound);
    const text = messages.adminMovieActions
      .replace('{code}', String(movie.code))
      .replace('{title}', escapeHtml(movie.title))
      .replace('{views}', String(movie.views || 0));
    const keyboard = styledInlineKeyboard([
      [Markup.button.callback(messages.adminMovieEdit, `admin:movie:edit:${movie.code}`)],
      [
        Markup.button.callback(messages.adminMovieChangeCode, `admin:movie:code:${movie.code}`),
        Markup.button.callback(messages.adminMovieDelete, `admin:movie:delete:${movie.code}`)
      ],
      [Markup.button.callback('📚 Kinolar ro‘yxati', 'admin:movie:list')]
    ]);
    return ctx.reply(text, keyboard);
  }

  bot.action('admin:movie:add', async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    return ctx.scene.enter('admin-add-movie');
  });

  bot.action('admin:movie:list', async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    return renderMovieList(ctx, 1);
  });

  bot.action(/^admin:movie:page:(previous|next)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const currentPage = Number(ctx.session.adminMoviePage) || 1;
    const page = Math.max(1, currentPage + (ctx.match[1] === 'next' ? 1 : -1));
    return renderMovieList(ctx, page);
  });

  bot.action(/^admin:movie:show:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    return showMovie(ctx, ctx.match[1]);
  });

  bot.action(/^admin:movie:edit:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const movie = await movieService.findMovieByCode(ctx.match[1]);
    if (!movie) return ctx.reply(messages.adminMovieNotFound);
    const rows = EDIT_FIELDS.map(([field, textKey]) => [
      Markup.button.callback(messages[textKey], `admin:movie:edit-field:${movie.code}:${field}`)
    ]);
    rows.push([Markup.button.callback('⬅️ Ortga', `admin:movie:show:${movie.code}`)]);
    return ctx.reply(messages.adminMovieEditFields, styledInlineKeyboard(rows));
  });

  bot.action(
    /^admin:movie:edit-field:(\d+):(title|genre|year|language|quality|description|media)$/,
    async (ctx) => {
      await ctx.answerCbQuery();
      if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
      const code = Number(ctx.match[1]);
      const field = ctx.match[2];
      if (!(await movieService.findMovieByCode(code)))
        return ctx.reply(messages.adminMovieNotFound);
      ctx.session.step = field === 'media' ? 'admin_movie_edit_media' : 'admin_movie_edit_value';
      ctx.session.editMovieCode = code;
      ctx.session.editMovieField = field;
      const textKey = EDIT_FIELDS.find(([key]) => key === field)?.[1];
      return ctx.reply(
        field === 'media'
          ? messages.adminMovieEditMedia
          : messages.adminMovieEditPrompt.replace('{field}', messages[textKey])
      );
    }
  );

  bot.action(/^admin:movie:code:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    ctx.session.step = 'admin_movie_code_value';
    ctx.session.editMovieCode = Number(ctx.match[1]);
    return ctx.reply(messages.adminMovieCodePrompt);
  });

  bot.action(/^admin:movie:delete:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const movie = await movieService.findMovieByCode(ctx.match[1]);
    if (!movie) return ctx.reply(messages.adminMovieNotFound);
    const keyboard = styledInlineKeyboard([
      [
        Markup.button.callback(
          messages.adminMovieDeleteConfirmButton,
          `admin:movie:delete-confirm:${movie.code}`
        )
      ],
      [Markup.button.callback('❌ Bekor qilish', `admin:movie:show:${movie.code}`)]
    ]);
    return ctx.reply(
      messages.adminMovieDeleteConfirm.replace('{title}', escapeHtml(movie.title)),
      keyboard
    );
  });

  bot.action(/^admin:movie:delete-confirm:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const movie = await movieService.deleteMovie(ctx.match[1]);
    return ctx.reply(movie ? messages.adminMovieDeleted : messages.adminMovieNotFound);
  });

  bot.action('admin:users', async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'users')) return ctx.reply(messages.noAccess);
    ctx.session.step = 'admin_user_lookup';
    return ctx.reply(messages.adminUserLookupPrompt);
  });

  bot.action(/^admin:user:(ban|unban):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'users')) return ctx.reply(messages.noAccess);
    const telegramId = Number(ctx.match[2]);
    const user = await userService.findUser(telegramId);
    if (!user) return ctx.reply(messages.adminUserNotFound);
    await userService.setBanned(telegramId, ctx.match[1] === 'ban');
    return ctx.reply(messages.adminUserUpdated);
  });

  bot.on('text', async (ctx, next) => {
    if (!isAdmin(ctx) || !ctx.session?.step) return next();
    if (ctx.session.step === 'admin_user_lookup') {
      const telegramId = Number(ctx.message.text.trim());
      if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
        return ctx.reply(messages.adminUserLookupPrompt);
      }
      const user = await userService.findUser(telegramId);
      if (!user) return ctx.reply(messages.adminUserNotFound);
      ctx.session.step = undefined;
      const name = escapeHtml(
        user.name || user.nickname || user.username || String(user.telegramId)
      );
      const status = user.banned ? messages.adminUserBanned : messages.adminUserActive;
      const text = messages.adminUserDetails
        .replace('{name}', name)
        .replace('{id}', String(user.telegramId))
        .replace('{status}', status);
      const action = user.banned ? 'unban' : 'ban';
      const button = user.banned ? messages.adminUserUnban : messages.adminUserBan;
      return ctx.reply(
        text,
        styledInlineKeyboard([
          [Markup.button.callback(button, `admin:user:${action}:${user.telegramId}`)]
        ])
      );
    }

    if (ctx.session.step === 'admin_movie_code_value') {
      const newCode = Number(ctx.message.text.trim());
      if (!Number.isSafeInteger(newCode) || newCode <= 0)
        return ctx.reply(messages.adminMovieCodePrompt);
      const currentCode = ctx.session.editMovieCode;
      try {
        const movie = await movieService.changeMovieCode(currentCode, newCode);
        if (!movie) return ctx.reply(messages.adminMovieNotFound);
        ctx.session.step = undefined;
        ctx.session.editMovieCode = undefined;
        return ctx.reply(messages.adminMovieCodeChanged.replace('{code}', String(movie.code)));
      } catch (error) {
        if (error.code === 11000) return ctx.reply(messages.adminMovieDuplicateCode);
        logger.error({ err: error, telegramId: ctx.from.id }, 'Movie code update failed');
        return ctx.reply(messages.adminMovieSaveFailed);
      }
    }

    if (ctx.session.step === 'admin_movie_edit_value') {
      const field = ctx.session.editMovieField;
      let value = ctx.message.text.trim();
      if (field === 'year') {
        value = Number(value);
        if (!Number.isSafeInteger(value) || value < 1888 || value > new Date().getFullYear() + 2) {
          return ctx.reply(messages.adminAddMovieInvalidYear);
        }
      } else if (field === 'description' && value === '-') {
        value = '';
      } else if (!value) {
        return ctx.reply(
          messages.adminMovieEditPrompt.replace(
            '{field}',
            messages[EDIT_FIELDS.find(([key]) => key === field)?.[1]]
          )
        );
      }

      const code = ctx.session.editMovieCode;
      try {
        const movie = await movieService.updateMovie(code, { [field]: value });
        ctx.session.step = undefined;
        ctx.session.editMovieCode = undefined;
        ctx.session.editMovieField = undefined;
        if (!movie) return ctx.reply(messages.adminMovieNotFound);
        return showMovie(ctx, movie.code);
      } catch (error) {
        logger.error({ err: error, telegramId: ctx.from.id }, 'Movie update failed');
        return ctx.reply(messages.adminMovieSaveFailed);
      }
    }
    return next();
  });

  async function updateMovieMedia(ctx) {
    if (!isAdmin(ctx) || ctx.session?.step !== 'admin_movie_edit_media') return false;
    const video = ctx.message?.video;
    const document = ctx.message?.document;
    const videoDocument =
      document && (!document.mime_type || document.mime_type.startsWith('video/'));
    const media = video || (videoDocument ? document : null);
    if (!media?.file_id) {
      await ctx.reply(messages.adminAddMovieInvalidMedia);
      return true;
    }
    try {
      const mediaType = video ? 'video' : 'document';
      const fileId = await storeTelegramMedia({
        telegram: ctx.telegram,
        chatId: ctx.chat.id,
        messageId: ctx.message.message_id,
        media,
        mediaType,
        storageChannelId: await getStorageChannelId()
      });
      const movie = await movieService.updateMovie(ctx.session.editMovieCode, {
        fileId,
        mediaType
      });
      ctx.session.step = undefined;
      ctx.session.editMovieCode = undefined;
      ctx.session.editMovieField = undefined;
      if (!movie) {
        await ctx.reply(messages.adminMovieNotFound);
        return true;
      }
      await showMovie(ctx, movie.code);
    } catch (error) {
      logger.error({ err: error, telegramId: ctx.from.id }, 'Movie media update failed');
      await ctx.reply(messages.adminMovieSaveFailed);
    }
    return true;
  }

  bot.on('video', async (ctx, next) => {
    if (!(await updateMovieMedia(ctx))) return next();
  });
  bot.on('document', async (ctx, next) => {
    if (!(await updateMovieMedia(ctx))) return next();
  });
}

function truncate(value, maxLength) {
  const text = String(value || '');
  const characters = Array.from(text);
  return characters.length <= maxLength ? text : `${characters.slice(0, maxLength - 1).join('')}…`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { registerAdminHandlers };
