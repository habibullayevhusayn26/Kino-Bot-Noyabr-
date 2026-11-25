const messages = require('../messages/uz');

function createRateLimitMiddleware({
  windowMs = 1000,
  maxUpdates = 5,
  adminMaxUpdates = 10,
  maxTrackedUsers = 10000,
  message = messages.rateLimited,
  isAdmin = () => false,
  now = Date.now
} = {}) {
  const buckets = new Map();

  return async (ctx, next) => {
    const telegramId = Number(ctx.from?.id);
    if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return next();

    const currentTime = now();
    let bucket = buckets.get(telegramId);
    if (!bucket || currentTime - bucket.startedAt >= windowMs) {
      bucket = { startedAt: currentTime, count: 0, warned: false };
    }
    bucket.count += 1;
    buckets.delete(telegramId);
    buckets.set(telegramId, bucket);

    while (buckets.size > maxTrackedUsers) {
      buckets.delete(buckets.keys().next().value);
    }

    const limit = isAdmin(ctx) ? adminMaxUpdates : maxUpdates;
    if (bucket.count <= limit) return next();
    if (bucket.warned) return;

    bucket.warned = true;
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery(message, { show_alert: true });
    }
    if (ctx.chat?.type === 'private') return ctx.reply(message);
  };
}

module.exports = { createRateLimitMiddleware };
