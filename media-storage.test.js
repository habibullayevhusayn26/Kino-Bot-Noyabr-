const assert = require('node:assert/strict');
const test = require('node:test');
const { storeTelegramMedia, sendStoredMedia } = require('./src/services/mediaStorageService');

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

test('storage accepts a document result for a video-classified Telegram message', async () => {
  const fileId = await storeTelegramMedia({
    telegram: {
      async forwardMessage() {
        return { document: { file_id: 'stored-document-id' } };
      }
    },
    chatId: 10,
    messageId: 20,
    media: { file_id: 'source-video-id' },
    mediaType: 'video',
    storageChannelId: -1001
  });

  assert.equal(fileId, 'stored-document-id');
});

test('stored media falls back to document delivery when video delivery rejects the file', async () => {
  const calls = [];
  const result = await sendStoredMedia({
    telegram: {
      async sendVideo(...args) {
        calls.push(['sendVideo', ...args]);
        throw new Error('wrong media type');
      },
      async sendDocument(...args) {
        calls.push(['sendDocument', ...args]);
        return { message_id: 55 };
      }
    },
    chatId: 10,
    fileId: 'stored-file-id',
    mediaType: 'video',
    options: { caption: 'Movie' }
  });

  assert.equal(result.message_id, 55);
  assert.deepEqual(calls, [
    ['sendVideo', 10, 'stored-file-id', { caption: 'Movie' }],
    ['sendDocument', 10, 'stored-file-id', { caption: 'Movie' }]
  ]);
});
