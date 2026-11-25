const messages = require('../messages/uz');
const keyboards = require('../keyboards/user');
const movieService = require('../services/movieService');
const favoriteService = require('../services/favoriteService');
const retroGameService = require('../services/retroGameService');
const { isMessageNotModified, retryAfterLimit } = require('../utils/telegramErrors');
const { stripCustomEmoji } = require('../utils/premiumEmoji');

const PAGE_SIZE = 8;

function exactButton(text) {
  const original = String(text);
  const stripped = stripCustomEmoji(original);
  const alternatives = [...new Set([original, stripped])].map((value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(`^(?:${alternatives.join('|')})$`, 'u');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function format(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function registerUserHandlers(bot, { isAdmin, logger = console }) {
  async function sendRetroGame(ctx, game) {
    if (!game) return ctx.reply(messages.retroNotFound);
    const chatId = ctx.chat?.id || ctx.from?.id;
    const options = {
      caption: messages.retroGameCaption(game),
      parse_mode: 'HTML',
      protect_content: !isAdmin(ctx)
    };
    const sender = game.mediaType === 'document' ? 'sendDocument' : 'sendVideo';
    await retryAfterLimit(() => ctx.telegram[sender](chatId, game.fileId, options));
    await retroGameService.incrementRetroGameViews(game._id).catch((error) => {
      logger.error(
        { err: error, gameId: String(game._id) },
        'Could not increment retro game view count'
      );
    });
  }

  async function sendMovie(ctx, movie) {
    if (!movie) return ctx.reply(messages.movieNotFound);
    const chatId = ctx.chat?.id || ctx.from?.id;
    const favorite = await favoriteService.isFavorite(ctx.from.id, movie._id);
    const options = {
      caption: messages.movieCaption(movie, (movie.views || 0) + 1),
      parse_mode: 'HTML',
      protect_content: !isAdmin(ctx),
      reply_markup: keyboards.movieCardKeyboard(movie, favorite, ctx.botInfo?.username).reply_markup
    };
    const sender = movie.mediaType === 'document' ? 'sendDocument' : 'sendVideo';
    await retryAfterLimit(() => ctx.telegram[sender](chatId, movie.fileId, options));
    try {
      await movieService.incrementMovieViews(movie._id);
    } catch (error) {
      logger.error(
        { err: error, movieId: String(movie._id) },
        'Could not increment movie view count'
      );
    }
  }

  async function renderList(ctx, state) {
    const page = Math.max(Number(state.page) || 1, 1);
    let result;
    if (state.type === 'search') {
      result = await movieService.searchMovies(state.query, { page, pageSize: PAGE_SIZE });
    } else if (state.type === 'new') {
      result = await movieService.listNewMovies({ page, pageSize: PAGE_SIZE });
    } else if (state.type === 'top') {
      result = await movieService.listTopMovies({ page, pageSize: PAGE_SIZE });
    } else if (state.type === 'genre') {
      result = await movieService.listMoviesByGenre(state.genre, { page, pageSize: PAGE_SIZE });
    } else if (state.type === 'favorites') {
      const favoriteResult = await favoriteService.listFavorites(ctx.from.id, {
        page,
        pageSize: PAGE_SIZE
      });
      result = {
        ...favoriteResult,
        items: favoriteResult.items.map((favorite) => favorite.movieId).filter(Boolean)
      };
    } else if (state.type === 'related') {
      const movie = await movieService.findMovieById(state.movieId);
      const items = movie ? await movieService.findRelatedMovies(movie, PAGE_SIZE) : [];
      result = { items, total: items.length, hasMore: false, page };
    } else {
      return ctx.reply(messages.noMovies);
    }

    ctx.session.movieList = { ...state, page: result.page || page };
    if (!result.items.length) {
      return ctx.reply(state.type === 'favorites' ? messages.emptyFavorites : messages.noMovies);
    }

    const title = listTitle(state);
    const summary =
      state.type === 'search'
        ? format(messages.searchResults, {
            query: escapeHtml(state.query),
            total: result.total,
            page: result.page || page
          })
        : `${escapeHtml(title)} — ${result.total} ta`;
    return ctx.reply(
      summary,
      keyboards.movieListKeyboard(result.items, {
        page: result.page || page,
        hasMore: result.hasMore
      })
    );
  }

  async function showSearchResults(ctx, query) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery) return ctx.reply(messages.searchPrompt);
    return renderList(ctx, { type: 'search', query: cleanQuery, page: 1 });
  }

  bot.hears(exactButton(messages.menuSearch), async (ctx) => {
    ctx.session.searchMode = true;
    return ctx.reply(messages.searchPrompt);
  });

  bot.hears(exactButton(messages.menuRetro), async (ctx) => {
    const games = await retroGameService.listLatestRetroGames(10);
    if (!games.length) return ctx.reply(messages.retroEmpty);
    ctx.session.retroGames = games;
    const list = games
      .map(
        (game, index) =>
          `${index + 1}. ${escapeHtml(game.title)}${game.date ? ` — ${escapeHtml(game.date)}` : ''}`
      )
      .join('\n');
    return ctx.reply(`⚽ <b>Oxirgi 10 ta retro futbol o‘yini</b>\n\n${list}\n\nRaqamni tanlang:`, {
      parse_mode: 'HTML',
      reply_markup: keyboards.retroGamesKeyboard(games).reply_markup
    });
  });

  bot.hears(exactButton(messages.menuGenres), async (ctx) => {
    const genres = await movieService.listGenres();
    if (!genres.length) return ctx.reply(messages.noGenres);
    ctx.session.genres = genres;
    return ctx.reply(messages.chooseGenre, keyboards.genresKeyboard(genres));
  });

  bot.hears(exactButton(messages.menuNew), (ctx) => renderList(ctx, { type: 'new', page: 1 }));
  bot.hears(exactButton(messages.menuTop), (ctx) => renderList(ctx, { type: 'top', page: 1 }));
  bot.hears(exactButton(messages.menuFavorites), (ctx) =>
    renderList(ctx, { type: 'favorites', page: 1 })
  );

  bot.hears(exactButton(messages.menuRandom), async (ctx) => {
    const movie = await movieService.findRandomMovie();
    if (!movie) return ctx.reply(messages.noMovies);
    return sendMovie(ctx, movie);
  });

  bot.hears(exactButton(messages.menuHelp), (ctx) => ctx.reply(messages.helpText));
  bot.command('help', (ctx) => ctx.reply(messages.helpText));

  bot.hears(/^\d+$/, async (ctx, next) => {
    if (isAdmin(ctx) && ctx.session?.step) return next();
    const game = await retroGameService.findRetroGameByCode(ctx.message.text.trim());
    if (game) return sendRetroGame(ctx, game);
    const movie = await movieService.findMovieByCode(ctx.message.text.trim());
    if (!movie) return ctx.reply(messages.movieNotFound);
    return sendMovie(ctx, movie);
  });

  bot.action(/^retro:open:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const game = await retroGameService.findRetroGameByCode(ctx.match[1]);
    return sendRetroGame(ctx, game);
  });

  bot.action(/^movie:open:([a-f\d]{24})$/i, async (ctx) => {
    await ctx.answerCbQuery();
    const movie = await movieService.findMovieById(ctx.match[1]);
    return sendMovie(ctx, movie);
  });

  bot.action(/^movie:related:([a-f\d]{24})$/i, async (ctx) => {
    await ctx.answerCbQuery();
    return renderList(ctx, { type: 'related', movieId: ctx.match[1], page: 1 });
  });

  bot.action(/^movie:genre:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const genre = ctx.session.genres?.[Number(ctx.match[1])];
    if (!genre) return ctx.reply(messages.noGenres);
    return renderList(ctx, { type: 'genre', genre, page: 1 });
  });

  bot.action(/^movie:list:(previous|next)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const state = ctx.session.movieList;
    if (!state) return ctx.reply(messages.searchPrompt);
    state.page = Math.max(1, (Number(state.page) || 1) + (ctx.match[1] === 'next' ? 1 : -1));
    return renderList(ctx, state);
  });

  bot.action(/^favorite:toggle:([a-f\d]{24})$/i, async (ctx) => {
    const movie = await movieService.findMovieById(ctx.match[1]);
    if (!movie) {
      await ctx.answerCbQuery(messages.movieNotFound, { show_alert: true });
      return;
    }
    const exists = await favoriteService.isFavorite(ctx.from.id, movie._id);
    const changed = exists
      ? await favoriteService.removeFavorite(ctx.from.id, movie._id)
      : await favoriteService.addFavorite(ctx.from.id, movie._id);
    await ctx.answerCbQuery(exists ? messages.favoriteRemoved : messages.favoriteAdded);
    if (!changed) return;
    try {
      await ctx.editMessageReplyMarkup(
        keyboards.movieCardKeyboard(movie, !exists, ctx.botInfo?.username).reply_markup
      );
    } catch (error) {
      if (isMessageNotModified(error)) return;
      throw error;
    }
  });

  bot.on('text', async (ctx, next) => {
    const query = ctx.message.text.trim();
    if (!query || query.startsWith('/') || query === 'Admin panel' || query === '🛠 Admin panel') {
      return next();
    }
    if (isAdmin(ctx) && ctx.session?.step) return next();
    if (ctx.session.searchMode) ctx.session.searchMode = false;
    return showSearchResults(ctx, query);
  });
}

function listTitle(state) {
  if (state.type === 'new') return messages.newMovies;
  if (state.type === 'top') return messages.topMovies;
  if (state.type === 'favorites') return messages.favorites;
  if (state.type === 'related') return messages.relatedMovies;
  if (state.type === 'genre') return state.genre;
  return messages.searchPrompt;
}

module.exports = { registerUserHandlers };
