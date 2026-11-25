const mongoose = require('mongoose');

const movieCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'movie-code' },
    value: { type: Number, default: 0, min: 0 }
  },
  {
    versionKey: false,
    collection: 'movie_counters'
  }
);

module.exports = mongoose.models.MovieCounter || mongoose.model('MovieCounter', movieCounterSchema);
