const assert = require('node:assert/strict');
const test = require('node:test');
const { storeTelegramMedia } = require('./src/services/mediaStorageService');

test('movie media is forwarded to storage and its reusable file_id is returned', async () => {
  const call = [];
  const fileId = await storeTelegramMedia({
    telegram: {
      async forwardMessage(...args) {
        call.push(args);
        return { video: { file_id: 'stored-video-id' } };
      }
    },
    chatId: 10,
    messageId: 20,
    media: { file_id: 'source-video-id' },
    mediaType: 'video',
    storageChannelId: -1001
  });

  assert.deepEqual(call, [[-1001, 10, 20]]);
  assert.equal(fileId, 'stored-video-id');
});

test('movie media cannot be stored before an admin selects a private storage channel', async () => {
  await assert.rejects(
    storeTelegramMedia({
      telegram: {
        forwardMessage() {
          throw new Error('must not forward');
        }
      },
      chatId: 10,
      messageId: 20,
      media: { file_id: 'source-document-id' },
      mediaType: 'document',
      storageChannelId: null
    }),
    /storage channel has not been configured/
  );
});
