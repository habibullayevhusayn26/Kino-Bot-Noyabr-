const { Movie, RetroGame } = require('../models');

async function findRetroGameByCode(code) {
  if (!/^\d+$/.test(String(code))) return null;
  return RetroGame.findOne({ code: Number(code) }).lean();
}

async function listLatestRetroGames(limit = 10) {
  return RetroGame.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 10, 1), 10))
    .lean();
}

async function isRetroGameCodeAvailable(code) {
  const numericCode = Number(code);
  if (!Number.isSafeInteger(numericCode) || numericCode <= 0) return false;
  const [movie, game] = await Promise.all([
    Movie.findOne({ code: numericCode }).select({ _id: 1 }).lean(),
    RetroGame.findOne({ code: numericCode }).select({ _id: 1 }).lean()
  ]);
  return !movie && !game;
}

async function createRetroGame(gameData) {
  const code = Number(gameData.code);
  if (!(await isRetroGameCodeAvailable(code))) {
    const error = new Error('Retro game code is already used');
    error.code = 11000;
    throw error;
  }
  return RetroGame.create({
    code,
    title: String(gameData.title || '').trim(),
    date: String(gameData.date || '').trim(),
    fileId: gameData.fileId,
    mediaType: gameData.mediaType,
    addedBy: gameData.addedBy
  });
}

async function incrementRetroGameViews(gameId) {
  return RetroGame.updateOne({ _id: gameId }, { $inc: { views: 1 } });
}

module.exports = {
  findRetroGameByCode,
  listLatestRetroGames,
  isRetroGameCodeAvailable,
  createRetroGame,
  incrementRetroGameViews
};
