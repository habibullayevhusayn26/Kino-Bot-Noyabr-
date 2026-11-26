const assert = require('node:assert/strict');
const test = require('node:test');
const { createRateLimitMiddleware } = require('./src/middlewares');

test('rate limit blocks excess updates once per window and keeps cache bounded', async () => {
  let time = 1000;
  let nextCalls = 0;
  let replies = 0;
  const middleware = createRateLimitMiddleware({
    windowMs: 1000,
    maxUpdates: 2,
    maxTrackedUsers: 1,
    now: () => time
  });
  const ctx = {
    from: { id: 1 },
    chat: { type: 'private' },
    reply: async () => {
      replies += 1;
    }
  };
  const next = async () => {
    nextCalls += 1;
  };

  await middleware(ctx, next);
  await middleware(ctx, next);
  await middleware(ctx, next);
  await middleware(ctx, next);
  assert.equal(nextCalls, 2);
  assert.equal(replies, 1);

  time += 1000;
  await middleware(ctx, next);
  assert.equal(nextCalls, 3);
});

test('registration middleware attaches user data before continuing', async () => {
  const { registrationMiddleware } = require('./src/middlewares');
  let continued = false;
  const middleware = registrationMiddleware(async () => ({
    user: { telegramId: 7, name: 'Ali' },
    isNew: true
  }));
  const ctx = { from: { id: 7 } };

  await middleware(ctx, async () => {
    continued = true;
  });
  assert.equal(ctx.dbUser.name, 'Ali');
  assert.equal(ctx.isNewUser, true);
  assert.equal(continued, true);
});

test('subscription check failures become safe replies instead of update exceptions', async () => {
  const { subscriptionCheckMiddleware } = require('./src/middlewares');
  let replyText;
  const middleware = subscriptionCheckMiddleware({
    isAdmin: () => false,
    listChannels: async () => {
      throw new Error('sensitive database detail');
    },
    buildKeyboard: () => ({ inline_keyboard: [] }),
    texts: { subscriptionCheckFailed: 'Obunani tekshirib bo‘lmadi.' },
    logger: { error() {} }
  });
  const ctx = {
    from: { id: 7 },
    chat: { type: 'private' },
    reply: async (text) => {
      replyText = text;
    }
  };

  await middleware(ctx, async () => {
    throw new Error('next should not run');
  });
  assert.equal(replyText, 'Obunani tekshirib bo‘lmadi.');
});

test('error boundary resets an active step and sends a safe callback response', async () => {
  const { errorBoundary } = require('./src/middlewares');
  let answerText;
  let answerExtra;
  const middleware = errorBoundary({
    logger: { error() {} },
    texts: { genericError: 'Bu amal bajarilmadi.' },
    isAdmin: () => false
  });
  const ctx = {
    updateType: 'callback_query',
    from: { id: 7 },
    chat: { type: 'private' },
    session: { step: 'admin_movie_edit_value' },
    callbackQuery: { data: 'admin:movie:show:1' },
    answerCbQuery: async (text, extra) => {
      answerText = text;
      answerExtra = extra;
    }
  };

  await middleware(ctx, async () => {
    throw new Error('database credential detail');
  });
  assert.equal(ctx.session.step, undefined);
  assert.equal(answerText, 'Bu amal bajarilmadi.');
  assert.equal(answerExtra.show_alert, true);
});
