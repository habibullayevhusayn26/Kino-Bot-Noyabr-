const { Favorite } = require('../models');

async function addFavorite(userId, movieId) {
  const result = await Favorite.updateOne(
    { userId: Number(userId), movieId },
    { $setOnInsert: { userId: Number(userId), movieId } },
    { upsert: true, runValidators: true }
  );
  return result.upsertedCount === 1;
}

async function removeFavorite(userId, movieId) {
  const result = await Favorite.deleteOne({ userId: Number(userId), movieId });
  return result.deletedCount === 1;
}

async function isFavorite(userId, movieId) {
  return Boolean(await Favorite.exists({ userId: Number(userId), movieId }));
}

async function listFavorites(userId, options = {}) {
  const page =
    Number.isSafeInteger(Number(options.page)) && Number(options.page) > 0
      ? Number(options.page)
      : 1;
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 10, 1), 25);
  const query = { userId: Number(userId) };
  const [items, total] = await Promise.all([
    Favorite.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .populate({ path: 'movieId', select: 'code title year genre views' })
      .lean(),
    Favorite.countDocuments(query)
  ]);
  const favorites = items.filter((favorite) => favorite.movieId);
  return {
    items: favorites,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total
  };
}

module.exports = {
  addFavorite,
  removeFavorite,
  isFavorite,
  listFavorites
};
