const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member']);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function checkChannelMembership(
  telegram,
  telegramId,
  channel,
  { maxAttempts = 3, retryDelayMs = 500, wait = delay } = {}
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const member = await telegram.getChatMember(channel.chatId, telegramId);
      const isMember =
        MEMBER_STATUSES.has(member.status) ||
        (member.status === 'restricted' && member.is_member === true);
      if (isMember || attempt === maxAttempts) {
        return { channel, isMember, failure: null };
      }
      await wait(retryDelayMs);
    } catch (error) {
      return { channel, isMember: false, failure: error };
    }
  }

  return { channel, isMember: false, failure: null };
}

async function checkRequiredChannelMembership(telegram, telegramId, channels, options = {}) {
  const results = await Promise.all(
    channels.map((channel) => checkChannelMembership(telegram, telegramId, channel, options))
  );
  const missingChannels = results.filter((result) => !result.isMember).map(({ channel }) => channel);
  const failures = results
    .filter((result) => result.failure)
    .map(({ channel, failure }) => ({ channel, error: failure }));

  return {
    subscribed: missingChannels.length === 0,
    missingChannels,
    failures
  };
}

module.exports = { checkRequiredChannelMembership, checkChannelMembership };
