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
    mediaType === 'video' ? storedMessage.video?.file_id : storedMessage.document?.file_id;
  if (!fileId) throw new Error('Stored Telegram message did not contain reusable media.');
  return fileId;
}

module.exports = { storeTelegramMedia };
