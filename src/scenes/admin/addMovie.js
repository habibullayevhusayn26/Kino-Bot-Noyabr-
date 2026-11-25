const { Markup, Scenes } = require('telegraf');
const messages = require('../../messages/uz');
const { styledInlineKeyboard } = require('../../keyboards/styled');
const movieService = require('../../services/movieService');
const { storeTelegramMedia } = require('../../services/mediaStorageService');

function createAddMovieScene({ canManageMovies, getStorageChannelId, logger = console }) {
  const scene = new Scenes.WizardScene(
    'admin-add-movie',
    async (ctx) => {
      if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
      ctx.wizard.next();
      return ctx.reply(messages.adminAddMovieMedia);
    },
    async (ctx) => {
      if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
      const video = ctx.message?.video;
      const document = ctx.message?.document;
      const videoDocument =
        document && (!document.mime_type || document.mime_type.startsWith('video/'));
      const media = video || (videoDocument ? document : null);
      if (!media?.file_id) return ctx.reply(messages.adminAddMovieInvalidMedia);

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
        logger.error({ err: error, telegramId: ctx.from.id }, 'Could not store movie media');
        return ctx.reply(messages.adminAddMovieStorageFailed);
      }
      ctx.wizard.state.mediaType = video ? 'video' : 'document';
      ctx.wizard.next();
      return ctx.reply(messages.adminAddMovieTitle);
    },
    async (ctx) =>
      readTextStep(ctx, 'title', messages.adminAddMovieTitle, messages.adminAddMovieGenre, 200),
    async (ctx) =>
      readTextStep(ctx, 'genre', messages.adminAddMovieGenre, messages.adminAddMovieYear, 80),
    async (ctx) => {
      if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
      const year = Number(ctx.message?.text?.trim());
      const currentYear = new Date().getFullYear();
      if (!Number.isSafeInteger(year) || year < 1888 || year > currentYear + 2) {
        return ctx.reply(messages.adminAddMovieInvalidYear);
      }
      ctx.wizard.state.year = year;
      ctx.wizard.next();
      return ctx.reply(messages.adminAddMovieLanguage);
    },
    async (ctx) =>
      readTextStep(
        ctx,
        'language',
        messages.adminAddMovieLanguage,
        messages.adminAddMovieQuality,
        40
      ),
    async (ctx) =>
      readTextStep(
        ctx,
        'quality',
        messages.adminAddMovieQuality,
        messages.adminAddMovieDescription,
        40
      ),
    async (ctx) => {
      if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
      const description = String(ctx.message?.text || '').trim();
      if (!description) return ctx.reply(messages.adminAddMovieDescription);
      if (description.length > 4000) return ctx.reply(messages.adminMovieDescriptionTooLong);

      ctx.wizard.state.description = description === '-' ? '' : description;
      ctx.wizard.state.code = await movieService.getNextMovieCode();
      const preview = messages.adminAddMovieConfirm
        .replace('{code}', String(ctx.wizard.state.code))
        .replace('{title}', escapeHtml(ctx.wizard.state.title))
        .replace('{genre}', escapeHtml(ctx.wizard.state.genre))
        .replace('{year}', String(ctx.wizard.state.year))
        .replace('{language}', escapeHtml(ctx.wizard.state.language))
        .replace('{quality}', escapeHtml(ctx.wizard.state.quality));
      const keyboard = styledInlineKeyboard([
        [Markup.button.callback(messages.adminAddMovieSave, 'admin:movie:add:save')],
        [Markup.button.callback(messages.adminAddMovieCancel, 'admin:movie:add:cancel')]
      ]);
      return ctx.reply(preview, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
    }
  );

  scene.use(async (ctx, next) => {
    if (canManageMovies(ctx)) return next();
    return leaveUnauthorized(ctx);
  });

  scene.action('admin:movie:add:save', async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManageMovies(ctx)) return leaveUnauthorized(ctx);
    const state = ctx.wizard.state;
    try {
      const movie = await movieService.createMovie({
        ...state,
        addedBy: Number(ctx.from.id)
      });
      await ctx.scene.leave();
      ctx.session.adminPanelActive = true;
      return ctx.reply(messages.adminMovieSaved.replace('{code}', String(movie.code)));
    } catch (error) {
      logger.error({ err: error, telegramId: ctx.from.id }, 'Movie creation failed');
      return ctx.reply(messages.adminMovieSaveFailed);
    }
  });

  scene.action('admin:movie:add:cancel', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    ctx.session.adminPanelActive = true;
    return ctx.reply(messages.adminAddMovieCancel);
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

module.exports = { createAddMovieScene };
