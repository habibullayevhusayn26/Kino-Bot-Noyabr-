const messages = require('../messages/uz');

const { isExpiredCallbackError } = require('../utils/telegramErrors');

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

      if (ctx.session) {
        ctx.session.step = undefined;
      }
      if (ctx.scene?.current) {
        try {
          await ctx.scene.leave();
        } catch (sceneError) {
          logger.error({ err: sceneError, telegramId: ctx.from?.id }, 'Could not reset scene');
        }
      }

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
