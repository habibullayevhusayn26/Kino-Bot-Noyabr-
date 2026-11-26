const messages = require('../messages/uz');
const { checkRequiredChannelMembership } = require('../services/subscriptionService');

function subscriptionCheckMiddleware({
  isAdmin,
  listChannels,
  buildKeyboard,
  texts = messages,
  checkMembership = checkRequiredChannelMembership,
  logger = console
}) {
  return async (ctx, next) => {
    if (
      !ctx.from ||
      ctx.chat?.type !== 'private' ||
      isAdmin(ctx) ||
      ctx.callbackQuery?.data === 'check_subscription'
    ) {
      return next();
    }

    let channels;
    try {
      channels = await listChannels();
    } catch (error) {
      logger.error({ err: error, telegramId: ctx.from.id }, 'Could not load required channels');
      return ctx.reply(texts.subscriptionCheckFailed);
    }
    if (!channels.length) return next();

    let result;
    try {
      result = await checkMembership(ctx.telegram, ctx.from.id, channels);
    } catch (error) {
      logger.error({ err: error, telegramId: ctx.from.id }, 'Required channel membership check failed');
      return ctx.reply(texts.subscriptionCheckFailed);
    }
    for (const failure of result.failures) {
      logger.error(
        {
          err: failure.error,
          channelId: failure.channel.chatId
        },
        'Required channel membership check failed'
      );
    }
    if (result.subscribed) return next();

    const text = result.failures.length
      ? texts.subscriptionCheckFailed
      : texts.subscriptionRequired;
    return ctx.reply(text, { reply_markup: buildKeyboard(result.missingChannels) });
  };
}

module.exports = { subscriptionCheckMiddleware };
