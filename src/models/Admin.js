const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, unique: true, required: true },
    username: { type: String, default: '' },
    nickname: { type: String, default: '' },
    permissions: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
  },
  {
    versionKey: false,
    collection: 'botadmins'
  }
);

module.exports = mongoose.models.BotAdmin || mongoose.model('BotAdmin', adminSchema);
