const { User } = require('../models');

async function registerOrUpdateUser(from) {
  if (!Number.isSafeInteger(from?.id) || from.id <= 0) {
    throw new TypeError('A valid Telegram user ID is required.');
  }

  const now = new Date();
  const firstName = String(from.first_name || '').trim();
  const lastName = String(from.last_name || '').trim();
  const name =
    [firstName, lastName].filter(Boolean).join(' ') || String(from.username || 'foydalanuvchi');

  const result = await User.updateOne(
    { telegramId: from.id },
    {
      $set: {
        name,
        nickname: firstName || name,
        username: String(from.username || ''),
        languageCode: String(from.language_code || ''),
        lastActiveAt: now
      },
      $setOnInsert: {
        telegramId: from.id,
        joinedAt: now,
        blocked: false,
        banned: false
      }
    },
    { upsert: true, runValidators: true }
  );
  const user = await User.findOne({ telegramId: from.id }).lean();
  return { user, isNew: result.upsertedCount === 1 };
}

async function setBlocked(telegramId, blocked = true) {
  return User.updateOne({ telegramId }, { $set: { blocked: Boolean(blocked) } });
}

async function setBanned(telegramId, banned = true) {
  return User.updateOne({ telegramId }, { $set: { banned: Boolean(banned) } });
}

async function findUser(telegramId) {
  return User.findOne({ telegramId }).lean();
}

module.exports = {
  registerOrUpdateUser,
  setBlocked,
  setBanned,
  findUser
};
