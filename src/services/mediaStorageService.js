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

  const storedMessage = await telegram.forwardMessage(storageChannelId, chatId, messageId);
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
