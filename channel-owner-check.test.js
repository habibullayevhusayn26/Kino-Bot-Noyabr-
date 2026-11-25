const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyAdminChannel } = require('./src/services/channelService');

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
