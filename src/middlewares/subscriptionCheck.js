const messages = require('../messages/uz');
const { checkRequiredChannelMembership } = require('../services/subscriptionService');

const membershipCache = new Map();
const MEMBERSHIP_CACHE_MS = 30 * 1000;
const maxMembershipCacheEntries = 5000;

function membershipCacheKey(telegramId, channels) {
  return `${telegramId}:${channels
    .map((channel) => String(channel.chatId))
    .sort()
    .join(',')}`;
}

function getCachedMembership(key) {
  const cached = membershipCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    membershipCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedMembership(key, value) {
  while (membershipCache.size >= maxMembershipCacheEntries) {
    membershipCache.delete(membershipCache.keys().next().value);
  }
  membershipCache.set(key, { value, expiresAt: Date.now() + MEMBERSHIP_CACHE_MS });
}

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

    const cacheKey = membershipCacheKey(ctx.from.id, channels);
    const cached = getCachedMembership(cacheKey);
    if (cached) {
      if (cached.subscribed) return next();
      const text = cached.failures.length
        ? texts.subscriptionCheckFailed
        : texts.subscriptionRequired;
      return ctx.reply(text, { reply_markup: buildKeyboard(cached.missingChannels) });
    }

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
    setCachedMembership(cacheKey, result);
    if (result.subscribed) return next();

    const text = result.failures.length
      ? texts.subscriptionCheckFailed
      : texts.subscriptionRequired;
    return ctx.reply(text, { reply_markup: buildKeyboard(result.missingChannels) });
  };
}

module.exports = { subscriptionCheckMiddleware };
