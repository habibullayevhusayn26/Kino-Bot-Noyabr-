const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getRetryAfterSeconds,
  isMessageNotModified,
  isPollingConflict,
  isExpiredCallbackError,
  retryAfterLimit
} = require('./src/utils/telegramErrors');

test('Telegram 429 retry_after is respected before retrying an operation', async () => {
  let calls = 0;
  const waits = [];
  const result = await retryAfterLimit(
    async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error('rate limited');
        error.response = { error_code: 429, parameters: { retry_after: 2 } };
        throw error;
      }
      return 'sent';
    },
    { sleep: async (milliseconds) => waits.push(milliseconds) }
  );

  assert.equal(result, 'sent');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 2000]);
});

test('Telegram error helpers recognize not-modified and ignore unrelated retry values', () => {
  assert.equal(
    isMessageNotModified({
      response: { error_code: 400, description: 'Bad Request: message is not modified' }
    }),
    true
  );
  assert.equal(
    getRetryAfterSeconds({
      response: { error_code: 500, parameters: { retry_after: 1 } }
    }),
    null
  );
});

test('Telegram polling conflict is recognized without matching other 409 errors', () => {
  assert.equal(
    isPollingConflict({
      response: {
        error_code: 409,
        description: 'Conflict: terminated by other getUpdates request'
      }
    }),
    true
  );
  assert.equal(
    isPollingConflict({
      response: { error_code: 409, description: 'Conflict: webhook is active' }
    }),
    false
  );
});

test('expired Telegram callbacks are recognized and do not become visible errors', () => {
  assert.equal(
    isExpiredCallbackError({
      response: { error_code: 400, description: 'Bad Request: query is too old and response timeout expired' }
    }),
    true
  );
  assert.equal(
    isExpiredCallbackError({
      response: { error_code: 400, description: 'Bad Request: query ID is invalid' }
    }),
    true
  );
});
