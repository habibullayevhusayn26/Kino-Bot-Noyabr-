const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema(
  {
    code: { type: Number, required: true, unique: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    titleNormalized: { type: String, required: true, trim: true },
    titleNgrams: { type: [String], default: [] },
    genre: { type: String, required: true, trim: true, maxlength: 80 },
    year: { type: Number, required: true, min: 1888 },
    language: { type: String, required: true, trim: true, maxlength: 40 },
    quality: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, default: '', maxlength: 4000 },
    fileId: { type: String, required: true },
    mediaType: { type: String, enum: ['video', 'document'], default: 'video', required: true },
    views: { type: Number, default: 0, min: 0 },
    addedBy: { type: Number, default: null }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'movies'
  }
);

movieSchema.index(
  { title: 'text' },
  { default_language: 'none', language_override: 'searchLanguage' }
);
movieSchema.index({ titleNormalized: 1 });
movieSchema.index({ titleNgrams: 1 });
movieSchema.index({ genre: 1, createdAt: -1 });
movieSchema.index({ createdAt: -1 });
movieSchema.index({ views: -1, createdAt: -1 });

module.exports = mongoose.models.Movie || mongoose.model('Movie', movieSchema);
