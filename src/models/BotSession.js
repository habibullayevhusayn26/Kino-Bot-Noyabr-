const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 }
  },
  {
    versionKey: false,
    collection: 'botsessions'
  }
);

module.exports = mongoose.models.BotSession || mongoose.model('BotSession', sessionSchema);
