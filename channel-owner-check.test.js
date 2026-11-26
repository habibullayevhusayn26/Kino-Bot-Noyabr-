const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyAdminChannel, approveChannelJoinRequest } = require('./src/services/channelService');
const { checkRequiredChannelMembership } = require('./src/services/subscriptionService');

test('required channel setup only succeeds when the requesting user and bot are admins', async () => {
  const calls = [];
  const telegram = {
    async getChat(channel) {
      calls.push(['getChat', channel]);
      return { id: -1001234567890, type: 'channel', title: 'Kino', username: 'kino' };
    },
    async getChatMember(chatId, userId) {
      calls.push(['getChatMember', chatId, userId]);
      return { status: userId === 7 ? 'administrator' : 'administrator' };
    },
    async getMe() {
      return { id: 99 };
    }
  };

  const channel = await verifyAdminChannel(telegram, 7, '@kino');
  assert.equal(channel.chatId, -1001234567890);
  assert.equal(channel.username, '@kino');
  assert.equal(channel.inviteLink, 'https://t.me/kino');
  assert.deepEqual(calls[0], ['getChat', '@kino']);
});

test('required channel setup rejects users who are not channel administrators', async () => {
  const telegram = {
    async getChat() {
      return { id: -1001234567890, type: 'channel', title: 'Kino', username: 'kino' };
    },
    async getChatMember(chatId, userId) {
      return { status: userId === 7 ? 'member' : 'administrator' };
    },
    async getMe() {
      return { id: 99 };
    }
  };

  await assert.rejects(verifyAdminChannel(telegram, 7, '@kino'), /administrator yoki ega/);
});

test('required-chat setup accepts a supergroup after user and bot admin checks', async () => {
  const telegram = {
    async getChat(chatId) {
      return { id: chatId, type: 'supergroup', title: 'Kino guruhi', username: 'kino_group' };
    },
    async getChatMember() {
      return { status: 'administrator' };
    },
    async getMe() {
      return { id: 99 };
    }
  };

  const chat = await verifyAdminChannel(telegram, 7, -1001234567890);
  assert.equal(chat.chatId, -1001234567890);
  assert.equal(chat.title, 'Kino guruhi');
  assert.equal(chat.inviteLink, 'https://t.me/kino_group');
});

test('storage channel verification does not create an invite link', async () => {
  let inviteCreated = false;
  const telegram = {
    async getChat(chatId) {
      return { id: chatId, type: 'channel', title: 'Movie storage' };
    },
    async getChatMember() {
      return { status: 'administrator' };
    },
    async getMe() {
      return { id: 99 };
    },
    async createChatInviteLink() {
      inviteCreated = true;
      throw new Error('not needed for storage');
    }
  };

  const chat = await verifyAdminChannel(telegram, 7, -1001234567890, {
    allowGroups: false,
    createInviteLink: false
  });
  assert.equal(chat.inviteLink, '');
  assert.equal(inviteCreated, false);
});

test('chat join request is approved and welcome message is sent', async () => {
  const calls = [];
  const telegram = {
    async approveChatJoinRequest(chatId, userId) {
      calls.push(['approve', chatId, userId]);
    },
    async sendMessage(userId, text, options) {
      calls.push(['message', userId, text, options]);
    }
  };

  const result = await approveChannelJoinRequest(
    telegram,
    {
      chat: { id: -1001234567890 },
      from: { id: 77 }
    },
    {
      welcomeText: 'Kanal tasdiqlandi',
      replyMarkup: { keyboard: [] }
    }
  );

  assert.deepEqual(result, { chatId: -1001234567890, userId: 77 });
  assert.deepEqual(calls[0], ['approve', -1001234567890, 77]);
  assert.equal(calls[1][0], 'message');
  assert.equal(calls[1][1], 77);
  assert.equal(calls[1][2], 'Kanal tasdiqlandi');
  assert.deepEqual(calls[1][3], { parse_mode: 'HTML', reply_markup: { keyboard: [] } });
});

test('join request already approved by Telegram is treated as successful', async () => {
  let welcomeSent = false;
  const telegram = {
    async approveChatJoinRequest() {
      const error = new Error('Bad Request: USER_ALREADY_PARTICIPANT');
      error.response = {
        error_code: 400,
        description: 'Bad Request: USER_ALREADY_PARTICIPANT'
      };
      throw error;
    },
    async sendMessage() {
      welcomeSent = true;
    }
  };

  const result = await approveChannelJoinRequest(
    telegram,
    { chat: { id: -1001234567890 }, from: { id: 77 } },
    { welcomeText: 'Xush kelibsiz' }
  );
  assert.deepEqual(result, { chatId: -1001234567890, userId: 77 });
  assert.equal(welcomeSent, true);
});

test('membership verification retries briefly when Telegram has not updated the join status', async () => {
  let calls = 0;
  let waits = 0;
  const result = await checkRequiredChannelMembership(
    {
      async getChatMember() {
        calls += 1;
        return { status: calls === 1 ? 'left' : 'member' };
      }
    },
    77,
    [{ chatId: -1001234567890 }],
    { wait: async () => waits += 1, retryDelayMs: 1 }
  );

  assert.equal(result.subscribed, true);
  assert.equal(calls, 2);
  assert.equal(waits, 1);
});
