const mongoose = require('mongoose');

const genreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80, unique: true }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'genres'
  }
);

genreSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.models.Genre || mongoose.model('Genre', genreSchema);
