const mongoose = require('mongoose');

const broadcastJobSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'main' },
    status: { type: String, enum: ['idle', 'running', 'completed'], default: 'idle' },
    mediaType: { type: String, default: '' },
    media: { type: String, default: '' },
    caption: { type: String, default: '' },
    captionEntities: { type: [mongoose.Schema.Types.Mixed], default: [] },
    buttons: { type: [mongoose.Schema.Types.Mixed], default: [] },
    startedBy: { type: Number, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastTelegramId: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    blocked: { type: Number, default: 0 },
    runs: { type: Number, default: 0 }
  },
  {
    versionKey: false,
    collection: 'broadcast_jobs'
  }
);

module.exports = mongoose.models.BroadcastJob || mongoose.model('BroadcastJob', broadcastJobSchema);
