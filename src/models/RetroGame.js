const mongoose = require('mongoose');

const retroGameSchema = new mongoose.Schema(
  {
    code: { type: Number, required: true, unique: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    date: { type: String, required: true, trim: true, maxlength: 80 },
    fileId: { type: String, required: true },
    mediaType: { type: String, enum: ['video', 'document'], default: 'video', required: true },
    views: { type: Number, default: 0, min: 0 },
    addedBy: { type: Number, default: null }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'retro_games'
  }
);

module.exports = mongoose.models.RetroGame || mongoose.model('RetroGame', retroGameSchema);
