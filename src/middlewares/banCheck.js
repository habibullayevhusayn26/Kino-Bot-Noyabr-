const messages = require('../messages/uz');

function banCheckMiddleware({ isAdmin, texts = messages }) {
  return async (ctx, next) => {
    if (!ctx.dbUser?.banned || isAdmin(ctx)) return next();

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(texts.banned, { show_alert: true });
    } else if (ctx.chat?.type === 'private') {
      await ctx.reply(texts.banned);
    }
  };
}

module.exports = { banCheckMiddleware };
