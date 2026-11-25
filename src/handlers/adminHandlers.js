const { Markup } = require('telegraf');
const messages = require('../messages/uz');
const { styledInlineKeyboard } = require('../keyboards/styled');
const movieService = require('../services/movieService');
const retroGameService = require('../services/retroGameService');
const userService = require('../services/userService');
const { storeTelegramMedia } = require('../services/mediaStorageService');
const { toPremiumEmojiMarkup } = require('../utils/premiumEmoji');

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
    const text = toPremiumEmojiMarkup(messages.adminMovieActions
      .replace('{code}', String(movie.code))
      .replace('{title}', escapeHtml(movie.title))
      .replace('{views}', String(movie.views || 0)));
    const keyboard = styledInlineKeyboard([
      [Markup.button.callback(messages.adminMovieEdit, `admin:movie:edit:${movie.code}`)],
      [
        Markup.button.callback(messages.adminMovieChangeCode, `admin:movie:code:${movie.code}`),
        Markup.button.callback(messages.adminMovieDelete, `admin:movie:delete:${movie.code}`)
      ],
      [Markup.button.callback('📚 Kinolar ro‘yxati', 'admin:movie:list')]
    ]);
    return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }

  async function renderRetroList(ctx, page) {
    const result = await retroGameService.listRetroGames({ page, pageSize: MOVIES_PER_PAGE });
    ctx.session.adminRetroPage = result.page;
    if (!result.items.length) return ctx.reply(messages.retroEmpty);
    const rows = result.items.map((game) => [
      Markup.button.callback(
        `⚽ ${game.code} | ${truncate(game.title, 42)}${game.date ? ` — ${truncate(game.date, 20)}` : ''}`,
        `admin:retro:show:${game.code}`
      )
    ]);
    const navigation = [];
    if (result.page > 1)
      navigation.push(Markup.button.callback('⬅️ Oldingi', 'admin:retro:page:previous'));
    if (result.hasMore)
      navigation.push(Markup.button.callback('Keyingi ➡️', 'admin:retro:page:next'));
    if (navigation.length) rows.push(navigation);
    rows.push([Markup.button.callback('🔎 Kod yoki nom bilan qidirish', 'admin:retro:search')]);
    rows.push([Markup.button.callback('🛠 Admin panel', 'admin:panel')]);
    return ctx.reply(`⚽ Retro futbol o‘yinlari — ${result.total} ta`, styledInlineKeyboard(rows));
  }

  async function showRetroGame(ctx, code) {
    const game = await retroGameService.findRetroGameByCode(code);
    if (!game) return ctx.reply(messages.retroNotFound);
    const text = toPremiumEmojiMarkup(
      `⚽ O‘yin: ${escapeHtml(game.title)}\n` +
        `📅 Sana: ${escapeHtml(game.date)}\n` +
        `🆔 Kod: ${game.code}\n` +
        `👁 Ko‘rilgan: ${game.views || 0}`
    );
    const keyboard = styledInlineKeyboard([
      [Markup.button.callback('✏️ Tahrirlash', `admin:retro:edit:${game.code}`)],
      [
        Markup.button.callback('🆔 Kodni o‘zgartirish', `admin:retro:code:${game.code}`),
        Markup.button.callback('🗑 O‘chirish', `admin:retro:delete:${game.code}`)
      ],
      [Markup.button.callback('⚽ O‘yinlar ro‘yxati', 'admin:retro:list')]
    ]);
    return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
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
      if (field === 'genre') {
        const genres = await movieService.listGenres();
        ctx.session.editMovieCode = code;
        ctx.session.genreChoices = genres;
        ctx.session.step = 'admin_movie_edit_genre_choice';
        const rows = genres.map((genre, index) => [
          Markup.button.callback(`🎭 ${genre}`, `admin:movie:genre:${code}:${index}`)
        ]);
        rows.push([Markup.button.callback(messages.addNewGenre, `admin:movie:genre:new:${code}`)]);
        return ctx.reply(messages.chooseMovieGenre, styledInlineKeyboard(rows));
      }
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

  bot.action(/^admin:movie:genre:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const code = Number(ctx.match[1]);
    const genre = ctx.session.genreChoices?.[Number(ctx.match[2])];
    if (!genre) return ctx.reply(messages.chooseMovieGenre);
    try {
      const movie = await movieService.updateMovie(code, { genre });
      ctx.session.step = undefined;
      ctx.session.genreChoices = undefined;
      ctx.session.editMovieCode = undefined;
      return ctx.reply(movie ? messages.adminMovieEditSaved : messages.adminMovieNotFound);
    } catch (error) {
      logger.error({ err: error, telegramId: ctx.from.id }, 'Movie genre update failed');
      return ctx.reply(messages.adminMovieSaveFailed);
    }
  });

  bot.action(/^admin:movie:genre:new:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    ctx.session.editMovieCode = Number(ctx.match[1]);
    ctx.session.step = 'admin_movie_edit_genre_new';
    return ctx.reply(messages.enterNewGenre);
  });

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

  bot.action('admin:retro:list', async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    return renderRetroList(ctx, 1);
  });

  bot.action(/^admin:retro:page:(previous|next)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const currentPage = Number(ctx.session.adminRetroPage) || 1;
    const page = Math.max(1, currentPage + (ctx.match[1] === 'next' ? 1 : -1));
    return renderRetroList(ctx, page);
  });

  bot.action('admin:retro:search', async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    ctx.session.step = 'admin_retro_lookup';
    return ctx.reply('🔎 Retro futbol o‘yinining kodini yoki nomini kiriting.');
  });

  bot.action(/^admin:retro:show:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    return showRetroGame(ctx, ctx.match[1]);
  });

  bot.action(/^admin:retro:edit:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const code = Number(ctx.match[1]);
    if (!(await retroGameService.findRetroGameByCode(code)))
      return ctx.reply(messages.retroNotFound);
    const rows = [
      [Markup.button.callback('🏷️ O‘yin nomi', `admin:retro:edit-field:${code}:title`)],
      [Markup.button.callback('📅 Sana', `admin:retro:edit-field:${code}:date`)],
      [Markup.button.callback('🎬 Video', `admin:retro:edit-field:${code}:media`)],
      [Markup.button.callback('⬅️ Ortga', `admin:retro:show:${code}`)]
    ];
    return ctx.reply('✏️ Tahrirlanadigan maydonni tanlang:', styledInlineKeyboard(rows));
  });

  bot.action(/^admin:retro:edit-field:(\d+):(title|date|media)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const code = Number(ctx.match[1]);
    const field = ctx.match[2];
    if (!(await retroGameService.findRetroGameByCode(code)))
      return ctx.reply(messages.retroNotFound);
    ctx.session.editRetroCode = code;
    ctx.session.editRetroField = field;
    ctx.session.step = field === 'media' ? 'admin_retro_edit_media' : 'admin_retro_edit_value';
    return ctx.reply(
      field === 'title'
        ? '🏷️ Retro o‘yin uchun yangi nomni yuboring.'
        : field === 'date'
          ? '📅 Retro o‘yin uchun yangi sanani yuboring.'
          : '🎬 Yangi video yoki video-fayl yuboring.'
    );
  });

  bot.action(/^admin:retro:code:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    ctx.session.editRetroCode = Number(ctx.match[1]);
    ctx.session.step = 'admin_retro_code_value';
    return ctx.reply('🆔 Yangi musbat va unikal o‘yin kodini yuboring.');
  });

  bot.action(/^admin:retro:delete:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const code = Number(ctx.match[1]);
    const game = await retroGameService.findRetroGameByCode(code);
    if (!game) return ctx.reply(messages.retroNotFound);
    return ctx.reply(
      `⚠️ “${escapeHtml(game.title)}” o‘yinini o‘chirishni tasdiqlaysizmi?`,
      styledInlineKeyboard([
        [Markup.button.callback('🗑 Ha, o‘chirish', `admin:retro:delete-confirm:${code}`)],
        [Markup.button.callback('❌ Bekor qilish', `admin:retro:show:${code}`)]
      ])
    );
  });

  bot.action(/^admin:retro:delete-confirm:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!canManage(ctx, 'movies')) return ctx.reply(messages.noAccess);
    const game = await retroGameService.deleteRetroGame(ctx.match[1]);
    return ctx.reply(game ? '🗑 Retro futbol o‘yini o‘chirildi.' : messages.retroNotFound);
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
    if (ctx.session.step === 'admin_retro_lookup') {
      const query = ctx.message.text.trim();
      if (!query) return ctx.reply('🔎 Retro futbol o‘yinining kodini yoki nomini kiriting.');
      const games = await retroGameService.searchRetroGames(query);
      ctx.session.step = undefined;
      if (!games.length) return ctx.reply(messages.retroNotFound);
      if (games.length === 1) return showRetroGame(ctx, games[0].code);
      const rows = games.map((game) => [
        Markup.button.callback(
          `⚽ ${game.code} | ${truncate(game.title, 42)}`,
          `admin:retro:show:${game.code}`
        )
      ]);
      rows.push([Markup.button.callback('⬅️ Retro ro‘yxati', 'admin:retro:list')]);
      return ctx.reply('🔎 Topilgan o‘yinlar:', styledInlineKeyboard(rows));
    }
    if (ctx.session.step === 'admin_retro_code_value') {
      const newCode = Number(ctx.message.text.trim());
      if (!Number.isSafeInteger(newCode) || newCode <= 0)
        return ctx.reply('🆔 Yangi musbat va unikal o‘yin kodini yuboring.');
      try {
        const game = await retroGameService.changeRetroGameCode(
          ctx.session.editRetroCode,
          newCode
        );
        ctx.session.step = undefined;
        ctx.session.editRetroCode = undefined;
        if (!game) return ctx.reply(messages.retroNotFound);
        return showRetroGame(ctx, game.code);
      } catch (error) {
        if (error.code === 11000)
          return ctx.reply('⚠️ Bu kod boshqa kino yoki o‘yinda ishlatilgan.');
        logger.error({ err: error, telegramId: ctx.from.id }, 'Retro game code update failed');
        return ctx.reply(messages.adminRetroSaveFailed);
      }
    }
    if (ctx.session.step === 'admin_retro_edit_value') {
      const field = ctx.session.editRetroField;
      const value = ctx.message.text.trim();
      if (!value || value.length > (field === 'title' ? 200 : 80))
        return ctx.reply(
          field === 'title'
            ? '🏷️ Retro o‘yin uchun yangi nomni yuboring.'
            : '📅 Retro o‘yin uchun yangi sanani yuboring.'
        );
      try {
        const game = await retroGameService.updateRetroGame(ctx.session.editRetroCode, {
          [field]: value
        });
        ctx.session.step = undefined;
        ctx.session.editRetroCode = undefined;
        ctx.session.editRetroField = undefined;
        if (!game) return ctx.reply(messages.retroNotFound);
        return showRetroGame(ctx, game.code);
      } catch (error) {
        logger.error({ err: error, telegramId: ctx.from.id }, 'Retro game update failed');
        return ctx.reply(messages.adminRetroSaveFailed);
      }
    }
    if (ctx.session.step === 'admin_movie_edit_genre_new') {
      const genre = String(ctx.message.text || '').trim();
      if (!genre || genre.length > 80) return ctx.reply(messages.enterNewGenre);
      try {
        const code = ctx.session.editMovieCode;
        const movie = await movieService.updateMovie(code, { genre });
        ctx.session.step = undefined;
        ctx.session.genreChoices = undefined;
        ctx.session.editMovieCode = undefined;
        return ctx.reply(movie ? messages.adminMovieEditSaved : messages.adminMovieNotFound);
      } catch (error) {
        logger.error({ err: error, telegramId: ctx.from.id }, 'Movie genre update failed');
        return ctx.reply(messages.adminMovieSaveFailed);
      }
    }
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

  async function updateRetroMedia(ctx) {
    if (!isAdmin(ctx) || ctx.session?.step !== 'admin_retro_edit_media') return false;
    const video = ctx.message?.video;
    const document = ctx.message?.document;
    const videoDocument =
      document && (!document.mime_type || document.mime_type.startsWith('video/'));
    const media = video || (videoDocument ? document : null);
    if (!media?.file_id) {
      await ctx.reply(messages.adminRetroInvalidMedia);
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
      const game = await retroGameService.updateRetroGame(ctx.session.editRetroCode, {
        fileId,
        mediaType
      });
      ctx.session.step = undefined;
      ctx.session.editRetroCode = undefined;
      ctx.session.editRetroField = undefined;
      if (!game) {
        await ctx.reply(messages.retroNotFound);
        return true;
      }
      await showRetroGame(ctx, game.code);
    } catch (error) {
      logger.error({ err: error, telegramId: ctx.from.id }, 'Retro game media update failed');
      await ctx.reply(messages.adminRetroSaveFailed);
    }
    return true;
  }

  bot.on('video', async (ctx, next) => {
    if (await updateRetroMedia(ctx)) return;
    if (!(await updateMovieMedia(ctx))) return next();
  });
  bot.on('document', async (ctx, next) => {
    if (await updateRetroMedia(ctx)) return;
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
