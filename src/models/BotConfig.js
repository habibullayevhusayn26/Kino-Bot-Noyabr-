const mongoose = require('mongoose');

const botConfigSchema = new mongoose.Schema(
  {
    configKey: { type: String, default: 'main_config', unique: true },
    channels: { type: Array, default: [] },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    versionKey: false,
    collection: 'botconfigs'
  }
);

module.exports = mongoose.models.BotConfig || mongoose.model('BotConfig', botConfigSchema);
