const assert = require('node:assert/strict');
const test = require('node:test');
const { Markup } = require('telegraf');
const { homeKeyboard } = require('./src/keyboards/user');
const { styledInlineKeyboard, styledReplyKeyboard } = require('./src/keyboards/styled');
const { stripCustomEmoji } = require('./src/utils/premiumEmoji');
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
    ['primary', 'primary', 'success', 'success', 'primary', 'success', 'primary', 'primary']
  );
});

test('keyboard labels stay recognizable after premium emoji replacement', () => {
  const keyboard = homeKeyboard(false).reply_markup.keyboard;
  const visibleLabels = keyboard.flat().map((button) => button.text);

  assert.deepEqual(visibleLabels, [
    stripCustomEmoji(messages.menuSearch),
    stripCustomEmoji(messages.menuGenres),
    stripCustomEmoji(messages.menuNew),
    stripCustomEmoji(messages.menuTop),
    stripCustomEmoji(messages.menuRandom),
    stripCustomEmoji(messages.menuFavorites),
    stripCustomEmoji(messages.menuHelp)
  ]);
});
