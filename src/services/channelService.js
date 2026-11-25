const { BotConfig, Channel } = require('../models');
const messages = require('../messages/uz');

async function verifyAdminChannel(
  telegram,
  telegramId,
  channelInput,
  { allowGroups = true, createInviteLink = true } = {}
) {
  const chat = await telegram.getChat(channelInput);
  const allowedTypes = allowGroups ? ['channel', 'group', 'supergroup'] : ['channel'];
  if (!allowedTypes.includes(chat.type)) throw new Error(messages.channelNotChannel);

  const userMember = await telegram.getChatMember(chat.id, telegramId);
  if (!['creator', 'administrator'].includes(userMember.status)) {
    throw new Error(messages.channelAdminRequired);
  }
  const botInfo = await telegram.getMe();
  const botMember = await telegram.getChatMember(chat.id, botInfo.id);
  if (!['creator', 'administrator'].includes(botMember.status)) {
    throw new Error(messages.channelBotAdminRequired);
  }

  let inviteLink = chat.username ? `https://t.me/${chat.username}` : '';
  if (!inviteLink && createInviteLink) {
    try {
      const invite = await telegram.createChatInviteLink(chat.id, { name: 'MovieBot obunasi' });
      inviteLink = invite.invite_link;
    } catch (error) {
      if (chat.type === 'group' && telegram.exportChatInviteLink) {
        try {
          inviteLink = await telegram.exportChatInviteLink(chat.id);
        } catch (fallbackError) {
          throw new Error(
            messages.channelInviteLinkFailed.replace(
              '{error}',
              fallbackError.response?.description || fallbackError.message
            )
          );
        }
      } else {
        throw new Error(
          messages.channelInviteLinkFailed.replace(
            '{error}',
            error.response?.description || error.message
          )
        );
      }
    }
  }
  return {
    chatId: chat.id,
    title: chat.title || channelInput,
    username: chat.username ? `@${chat.username}` : '',
    inviteLink
  };
}

async function migrateLegacyRequiredChannels() {
  const config = await BotConfig.findOne({ configKey: 'main_config' })
    .select({ channels: 1 })
    .lean();
  const legacyChannels = config?.channels || [];

  for (const legacyChannel of legacyChannels) {
    const chatId = Number(legacyChannel.id || legacyChannel.chatId);
    if (!Number.isSafeInteger(chatId) || chatId >= 0) {
      throw new Error('Legacy required-channel settings contain an invalid channel ID.');
    }
    await Channel.updateOne(
      { chatId },
      {
        $setOnInsert: {
          chatId,
          username: legacyChannel.username || '',
          title: legacyChannel.title || '',
          inviteLink: legacyChannel.inviteLink || '',
          isRequired: true,
          active: true
        }
      },
      { upsert: true }
    );
  }

  if (config && legacyChannels.length) {
    await BotConfig.updateOne({ _id: config._id }, { $set: { channels: [] } });
  }
  return legacyChannels.length;
}

async function listRequiredChannels() {
  return Channel.find({ isRequired: true, active: true }).sort({ createdAt: 1 }).lean();
}

async function addRequiredChannel(channel, addedBy) {
  return Channel.findOneAndUpdate(
    { chatId: Number(channel.chatId) },
    {
      $set: {
        username: String(channel.username || ''),
        title: String(channel.title || ''),
        inviteLink: String(channel.inviteLink || ''),
        isRequired: true,
        active: true,
        addedBy: Number(addedBy)
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean();
}

async function removeRequiredChannel(chatId) {
  const result = await Channel.deleteOne({ chatId: Number(chatId), isRequired: true });
  return result.deletedCount === 1;
}

async function clearRequiredChannels() {
  const result = await Channel.deleteMany({ isRequired: true });
  return result.deletedCount;
}

module.exports = {
  verifyAdminChannel,
  migrateLegacyRequiredChannels,
  listRequiredChannels,
  addRequiredChannel,
  removeRequiredChannel,
  clearRequiredChannels
};
