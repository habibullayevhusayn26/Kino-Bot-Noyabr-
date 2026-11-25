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

async function listRetroGames(options = {}) {
  const page = Math.max(Number(options.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 8, 1), 25);
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    RetroGame.find({})
      .sort({ code: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    RetroGame.countDocuments({})
  ]);
  return { items, total, page, pageSize, hasMore: skip + items.length < total };
}

async function searchRetroGames(query) {
  const cleanQuery = String(query || '').trim();
  if (/^\d+$/.test(cleanQuery)) {
    const game = await findRetroGameByCode(cleanQuery);
    return game ? [game] : [];
  }
  if (!cleanQuery) return [];
  return RetroGame.find({
    title: { $regex: cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  })
    .sort({ code: -1 })
    .limit(25)
    .lean();
}

async function updateRetroGame(code, updates) {
  const safeUpdates = {};
  for (const field of ['title', 'date', 'fileId', 'mediaType']) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) safeUpdates[field] = updates[field];
  }
  return RetroGame.findOneAndUpdate(
    { code: Number(code) },
    { $set: safeUpdates },
    { returnDocument: 'after', runValidators: true }
  ).lean();
}

async function changeRetroGameCode(currentCode, newCode) {
  if (Number(currentCode) !== Number(newCode) && !(await isRetroGameCodeAvailable(newCode))) {
    const error = new Error('Retro game code is already used');
    error.code = 11000;
    throw error;
  }
  return RetroGame.findOneAndUpdate(
    { code: Number(currentCode) },
    { $set: { code: Number(newCode) } },
    { returnDocument: 'after', runValidators: true }
  ).lean();
}

async function deleteRetroGame(code) {
  return RetroGame.findOneAndDelete({ code: Number(code) }).lean();
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
  listRetroGames,
  searchRetroGames,
  isRetroGameCodeAvailable,
  createRetroGame,
  incrementRetroGameViews,
  updateRetroGame,
  changeRetroGameCode,
  deleteRetroGame
};
