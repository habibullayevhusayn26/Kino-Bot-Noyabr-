const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);

async function checkRequiredChannelMembership(telegram, telegramId, channels) {
  const missingChannels = [];
  const failures = [];

  for (const channel of channels) {
    try {
      const member = await telegram.getChatMember(channel.chatId, telegramId);
      const isMember =
        MEMBER_STATUSES.has(member.status) ||
        (member.status === 'restricted' && member.is_member === true);
      if (!isMember) missingChannels.push(channel);
    } catch (error) {
      missingChannels.push(channel);
      failures.push({ channel, error });
    }
  }

  return {
    subscribed: missingChannels.length === 0,
    missingChannels,
    failures
  };
}

module.exports = { checkRequiredChannelMembership };
