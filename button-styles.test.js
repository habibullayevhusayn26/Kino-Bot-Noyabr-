const assert = require('node:assert/strict');
const test = require('node:test');
const { Markup } = require('telegraf');
const { homeKeyboard, retroGamesKeyboard } = require('./src/keyboards/user');
const { styledInlineKeyboard, styledReplyKeyboard } = require('./src/keyboards/styled');
const { stripCustomEmoji, toPremiumEmojiMarkup } = require('./src/utils/premiumEmoji');
const messages = require('./src/messages/uz');

test('inline buttons receive semantic Telegram button styles', () => {
  const markup = styledInlineKeyboard([
    [
      Markup.button.callback('Save', 'movie:add:save'),
      Markup.button.callback('Delete', 'movie:delete:1'),
      Markup.button.callback('Edit', 'movie:edit:1')
    ]
  ]);

  assert.deepEqual(
    markup.reply_markup.inline_keyboard[0].map((button) => button.style),
    ['success', 'danger', 'primary']
  );
});

test('reply keyboard text and request buttons receive styles', () => {
  const markup = styledReplyKeyboard([
    ['🔎 Search', '🆕 New movies'],
    [{ text: '❌ Cancel', request_chat: { request_id: 1, chat_is_channel: true } }]
  ]);

  assert.deepEqual(
    markup.reply_markup.keyboard.map((row) => row.map((button) => button.style)),
    [['primary', 'success'], ['danger']]
  );
});

test('the persistent home menu assigns colors to every bottom button', () => {
  const keyboard = homeKeyboard(true).reply_markup.keyboard;

  assert.deepEqual(
    keyboard.flat().map((button) => button.style),
    [
      'primary',
      'primary',
      'primary',
      'success',
      'success',
      'primary',
      'success',
      'primary',
      'primary'
    ]
  );
});

test('movie sharing uses a deep link without inline query mode', () => {
  const markup = require('./src/keyboards/user').movieCardKeyboard(
    { _id: '507f1f77bcf86cd799439011', code: 42, title: 'Test kino' },
    false,
    'movie_demo_bot'
  );
  const shareButton = markup.reply_markup.inline_keyboard[1][0];

  assert.equal(shareButton.style, 'success');
  assert.equal(shareButton.icon_custom_emoji_id, '5974192980662160632');
  assert.equal(shareButton.url.includes('https://t.me/share/url?url='), true);
  assert.equal(
    decodeURIComponent(shareButton.url).includes('https://t.me/movie_demo_bot?start=movie_42'),
    true
  );
  assert.equal(decodeURIComponent(shareButton.url).includes('🎬 Test kino'), true);
  assert.equal(decodeURIComponent(shareButton.url).includes("▶️ Kinoni ko'rish"), true);
  assert.equal(shareButton.switch_inline_query, undefined);
  assert.equal(shareButton.switch_inline_query_current_chat, undefined);
});

test('retro football keyboard has two plain number rows', () => {
  const games = Array.from({ length: 10 }, (_, index) => ({ code: index + 1 }));
  const keyboard = retroGamesKeyboard(games).reply_markup.inline_keyboard;

  assert.deepEqual(
    keyboard.map((row) => row.map((button) => button.text)),
    [
      ['1', '2', '3', '4', '5'],
      ['6', '7', '8', '9', '10']
    ]
  );
  assert.equal(
    keyboard.every((row) => row.every((button) => !button.icon_custom_emoji_id)),
    true
  );
});

test('keyboard labels stay recognizable after premium emoji replacement', () => {
  const keyboard = homeKeyboard(false).reply_markup.keyboard;
  const visibleLabels = keyboard.flat().map((button) => button.text);

  assert.deepEqual(visibleLabels, [
    stripCustomEmoji(messages.menuSearch),
    stripCustomEmoji(messages.menuRetro),
    stripCustomEmoji(messages.menuGenres),
    stripCustomEmoji(messages.menuNew),
    stripCustomEmoji(messages.menuTop),
    stripCustomEmoji(messages.menuRandom),
    stripCustomEmoji(messages.menuFavorites),
    stripCustomEmoji(messages.menuHelp)
  ]);
});
