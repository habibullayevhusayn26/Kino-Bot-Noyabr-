const { retryAfterLimit } = require('../utils/telegramErrors');

async function storeTelegramMedia({
  telegram,
  chatId,
  messageId,
  media,
  mediaType,
  storageChannelId
}) {
  if (!media?.file_id) throw new Error('Telegram media is missing a reusable file_id.');
  if (!Number.isSafeInteger(storageChannelId) || storageChannelId >= 0) {
    throw new Error('A private Telegram storage channel has not been configured.');
  }

  let storedMessage;
  try {
    storedMessage = await retryAfterLimit(() =>
      telegram.forwardMessage(storageChannelId, chatId, messageId)
    );
  } catch (forwardError) {
    const sender = mediaType === 'document' ? 'sendDocument' : 'sendVideo';
    const fallbackSender = sender === 'sendVideo' ? 'sendDocument' : 'sendVideo';
    try {
      storedMessage = await retryAfterLimit(() =>
        telegram[sender](storageChannelId, media.file_id)
      );
    } catch {
      try {
        storedMessage = await retryAfterLimit(() =>
          telegram[fallbackSender](storageChannelId, media.file_id)
        );
      } catch (fallbackError) {
        const telegramDescription =
          fallbackError.response?.description || forwardError.response?.description;
        if (telegramDescription) {
          const error = new Error(`Telegram media storage failed: ${telegramDescription}`);
          error.response = fallbackError.response || forwardError.response;
          throw error;
        }
        throw fallbackError;
      }
    }
  }
  const fileId =
    mediaType === 'video'
      ? storedMessage.video?.file_id || storedMessage.document?.file_id
      : storedMessage.document?.file_id || storedMessage.video?.file_id;
  if (!fileId) throw new Error('Stored Telegram message did not contain reusable media.');
  return fileId;
}

async function sendStoredMedia({ telegram, chatId, fileId, mediaType, options = {} }) {
  if (!fileId) throw new Error('Telegram reusable media file_id is missing.');

  const preferred = mediaType === 'document' ? 'sendDocument' : 'sendVideo';
  const fallback = preferred === 'sendVideo' ? 'sendDocument' : 'sendVideo';

  try {
    return await telegram[preferred](chatId, fileId, options);
  } catch (preferredError) {
    try {
      return await telegram[fallback](chatId, fileId, options);
    } catch (fallbackError) {
      throw fallbackError || preferredError;
    }
  }
}

module.exports = { storeTelegramMedia, sendStoredMedia };
