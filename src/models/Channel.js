const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema(
  {
    chatId: { type: Number, required: true, unique: true },
    username: { type: String, default: '' },
    title: { type: String, default: '' },
    inviteLink: { type: String, default: '' },
    isRequired: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    addedBy: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
  },
  {
    versionKey: false,
    collection: 'channels'
  }
);

module.exports = mongoose.models.Channel || mongoose.model('Channel', channelSchema);
