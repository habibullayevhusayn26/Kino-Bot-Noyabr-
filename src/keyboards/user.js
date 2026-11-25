const { Markup } = require('telegraf');
const messages = require('../messages/uz');
const { styledInlineKeyboard, styledReplyKeyboard } = require('./styled');

function homeKeyboard(isAdmin = false) {
  const rows = [
    [
      { text: messages.menuSearch, style: 'primary' },
      { text: messages.menuGenres, style: 'primary' }
    ],
    [
      { text: messages.menuNew, style: 'success' },
      { text: messages.menuTop, style: 'success' }
    ],
    [
      { text: messages.menuRandom, style: 'primary' },
      { text: messages.menuFavorites, style: 'success' }
    ],
    [{ text: messages.menuHelp, style: 'primary' }]
  ];
  if (isAdmin) rows.push([{ text: '🛠 Admin panel', style: 'primary' }]);
  return styledReplyKeyboard(rows).resize();
}

function movieCardKeyboard(movie, favorite = false, botUsername = '') {
  const username = String(botUsername || '').replace(/^@/, '');
  const deepLink = username
    ? `https://t.me/${username}?start=movie_${encodeURIComponent(String(movie.code))}`
    : '';
  const shareText = `🎬 ${movie.title}\n▶️ Kinoni ko'rish`;
  const shareUrl = deepLink
    ? `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent(shareText)}`
    : 'https://t.me/share';
  return styledInlineKeyboard([
    [
      Markup.button.callback(
        favorite ? '💔 Sevimlilardan olib tashlash' : '❤️ Sevimlilarga qo‘shish',
        `favorite:toggle:${movie._id}`
      )
    ],
    [Markup.button.url('📤 Ulashish', shareUrl)],
    [Markup.button.callback('🎬 O‘xshash kinolar', `movie:related:${movie._id}`)]
  ]);
}

function movieListKeyboard(movies, { page, hasMore }) {
  const rows = movies.map((movie) => [
    Markup.button.callback(
      `🎬 ${movie.code} | ${truncate(movie.title, 44)}${movie.year ? ` (${movie.year})` : ''}`,
      `movie:open:${movie._id}`
    )
  ]);
  const navigation = [];
  if (page > 1) navigation.push(Markup.button.callback('⬅️ Oldingi', 'movie:list:previous'));
  if (hasMore) navigation.push(Markup.button.callback('Keyingi ➡️', 'movie:list:next'));
  if (navigation.length) rows.push(navigation);
  return styledInlineKeyboard(rows);
}

function genresKeyboard(genres) {
  const rows = [];
  for (let index = 0; index < genres.length; index += 2) {
    rows.push(
      genres
        .slice(index, index + 2)
        .map((genre, offset) =>
          Markup.button.callback(`🎭 ${truncate(genre, 28)}`, `movie:genre:${index + offset}`)
        )
    );
  }
  return styledInlineKeyboard(rows);
}

function subscriptionKeyboard(channels) {
  const rows = channels
    .map((channel) => {
      const username = String(channel.username || '').replace(/^@/, '');
      const url = channel.inviteLink || (username ? `https://t.me/${username}` : '');
      return url ? [Markup.button.url(`📢 ${channel.title || channel.username}`, url)] : [];
    })
    .filter((row) => row.length);
  return styledInlineKeyboard(rows);
}

function truncate(value, maxLength) {
  const text = String(value || '');
  return Array.from(text).length <= maxLength
    ? text
    : `${Array.from(text)
        .slice(0, maxLength - 1)
        .join('')}…`;
}

module.exports = {
  homeKeyboard,
  movieCardKeyboard,
  movieListKeyboard,
  genresKeyboard,
  subscriptionKeyboard
};
