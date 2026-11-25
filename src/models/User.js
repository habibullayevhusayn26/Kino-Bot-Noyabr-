const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, unique: true, required: true },
    name: { type: String, default: '' },
    username: { type: String, default: '' },
    languageCode: { type: String, default: '' },
    nickname: { type: String, default: '' },
    blocked: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now, index: true },
    lastActiveAt: { type: Date, default: Date.now, index: true }
  },
  {
    versionKey: false,
    collection: 'users'
  }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
