const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true },
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    createdAt: { type: Date, default: Date.now }
  },
  {
    versionKey: false,
    collection: 'favorites'
  }
);

favoriteSchema.index({ userId: 1, movieId: 1 }, { unique: true });

module.exports = mongoose.models.Favorite || mongoose.model('Favorite', favoriteSchema);
