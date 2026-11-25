const messages = require('../messages/uz');

function isExpiredCallbackError(error) {
  const description = String(error.response?.description || '').toLowerCase();
  return (
    error.response?.error_code === 400 &&
    (description.includes('query is too old') || description.includes('query id is invalid'))
  );
}

function errorBoundary({ logger = console, texts = messages, isAdmin = () => false } = {}) {
  return async (ctx, next) => {
    try {
      return await next();
    } catch (error) {
      logger.error(
        {
          err: error,
          updateType: ctx.updateType,
          telegramId: ctx.from?.id
        },
        'Telegram update failed'
      );

      try {
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery(texts.genericError, { show_alert: true });
        } else if (ctx.from?.id && ctx.chat?.type === 'private') {
          await ctx.telegram.sendMessage(ctx.from.id, texts.genericError, {
            protect_content: !isAdmin(ctx)
          });
        }
      } catch (replyError) {
        if (!isExpiredCallbackError(replyError)) {
          logger.error(
            { err: replyError, telegramId: ctx.from?.id },
            'Could not notify user about update failure'
          );
        }
      }
    }
  };
}

module.exports = { errorBoundary, isExpiredCallbackError };
