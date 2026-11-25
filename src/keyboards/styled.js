const { Markup } = require('telegraf');
const { findCustomEmoji } = require('../utils/premiumEmoji');

function styledInlineKeyboard(rows) {
  return Markup.inlineKeyboard(styleRows(rows));
}

function styledReplyKeyboard(rows) {
  return Markup.keyboard(styleRows(rows));
}

function styleRows(rows) {
  return rows.map((row) =>
    row.map((button) => {
      const styledButton = typeof button === 'string' ? { text: button } : { ...button };
      if (!['primary', 'success', 'danger'].includes(styledButton.style)) {
        styledButton.style = buttonStyle(styledButton);
      }
      const customEmoji = findCustomEmoji(styledButton.text);
      if (customEmoji && !styledButton.icon_custom_emoji_id) {
        styledButton.icon_custom_emoji_id = customEmoji.id;
        styledButton.text = styledButton.text.replace(customEmoji.matchedText, '').trim();
      }
      return styledButton;
    })
  );
}

function buttonStyle(button) {
  const callbackData = String(button.callback_data || '');
  const text = String(button.text || '');

  if (/(?:delete|remove|cancel|ban|_off)/i.test(callbackData) || /^(?:❌|🗑|💔|⛔)/u.test(text)) {
    return 'danger';
  }
  if (
    /(?:save|send|confirm|check_subscription|unban)/i.test(callbackData) ||
    /^(?:✅|❤️|💚|🆕|🏆)/u.test(text)
  ) {
    return 'success';
  }
  return 'primary';
}

module.exports = { styledInlineKeyboard, styledReplyKeyboard };
