const { Movie, MovieCounter, Favorite } = require('../models');
const { createNgrams, normalizeSearchText, scoreTitleMatch } = require('../utils/searchText');

const SEARCH_CANDIDATE_LIMIT = 60;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 25;

async function prepareMovieTextIndex(collection = Movie.collection) {
  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (error.code === 26 || error.codeName === 'NamespaceNotFound') return;
    throw error;
  }

  const legacyTextIndex = indexes.find(
    (index) =>
      index.key?._fts === 'text' &&
      (index.weights?.title || index.name === 'title_text') &&
      index.language_override !== 'searchLanguage'
  );
  if (legacyTextIndex) await collection.dropIndex(legacyTextIndex.name);
}

function normalizePageOptions(options = {}) {
  const page =
    Number.isSafeInteger(Number(options.page)) && Number(options.page) > 0
      ? Number(options.page)
      : 1;
  const requestedSize = Number(options.pageSize);
  const pageSize =
    Number.isSafeInteger(requestedSize) && requestedSize > 0
      ? Math.min(requestedSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

async function getNextMovieCode() {
  const highestMovie = await Movie.findOne().sort({ code: -1 }).select({ code: 1 }).lean();
  const highestCode = highestMovie?.code || 0;

  await MovieCounter.updateOne(
    { _id: 'movie-code' },
    { $max: { value: highestCode } },
    { upsert: true }
  );
  const counter = await MovieCounter.findOneAndUpdate(
    { _id: 'movie-code' },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
  return counter.value;
}

function getSearchFields(title) {
  const titleNormalized = normalizeSearchText(title);
  return {
    titleNormalized,
    titleNgrams: createNgrams(titleNormalized)
  };
}

async function createMovie(movieData) {
  const title = String(movieData.title || '').trim();
  const code = movieData.code == null ? await getNextMovieCode() : Number(movieData.code);
  return Movie.create({
    ...movieData,
    code,
    title,
    ...getSearchFields(title)
  });
}

async function updateMovie(code, updates) {
  const safeUpdates = {};
  for (const field of [
    'title',
    'genre',
    'year',
    'language',
    'quality',
    'description',
    'fileId',
    'mediaType'
  ]) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) safeUpdates[field] = updates[field];
  }
  if (Object.prototype.hasOwnProperty.call(safeUpdates, 'title')) {
    safeUpdates.title = String(safeUpdates.title || '').trim();
    Object.assign(safeUpdates, getSearchFields(safeUpdates.title));
  }
  return Movie.findOneAndUpdate(
    { code: Number(code) },
    { $set: safeUpdates },
    { returnDocument: 'after', runValidators: true }
  ).lean();
}

async function changeMovieCode(currentCode, newCode) {
  return Movie.findOneAndUpdate(
    { code: Number(currentCode) },
    { $set: { code: Number(newCode) } },
    { returnDocument: 'after', runValidators: true }
  ).lean();
}

async function deleteMovie(code) {
  const movie = await Movie.findOneAndDelete({ code: Number(code) }).lean();
  if (movie) await Favorite.deleteMany({ movieId: movie._id });
  return movie;
}

async function findMovieByCode(code) {
  if (!/^\d+$/.test(String(code))) return null;
  return Movie.findOne({ code: Number(code) }).lean();
}

async function findMovieById(id) {
  return Movie.findById(id).lean();
}

async function incrementMovieViews(movieId) {
  return Movie.updateOne({ _id: movieId }, { $inc: { views: 1 } });
}

async function listMovies(query, options = {}) {
  const { page, pageSize, skip } = normalizePageOptions(options);
  const [items, total] = await Promise.all([
    Movie.find(query)
      .sort(options.sort || { createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Movie.countDocuments(query)
  ]);
  return { items, total, page, pageSize, hasMore: skip + items.length < total };
}

async function listNewMovies(options = {}) {
  return listMovies({}, { ...options, sort: { createdAt: -1 } });
}

async function listAllMovies(options = {}) {
  return listMovies({}, { ...options, sort: { code: -1 } });
}

async function listTopMovies(options = {}) {
  return listMovies({}, { ...options, sort: { views: -1, createdAt: -1 } });
}

async function listMoviesByGenre(genre, options = {}) {
  return listMovies({ genre }, { ...options, sort: { createdAt: -1 } });
}

async function listGenres() {
  const genres = await Movie.distinct('genre');
  return genres.sort((left, right) => left.localeCompare(right, 'uz'));
}

async function findRandomMovie() {
  const [movie] = await Movie.aggregate([{ $sample: { size: 1 } }]);
  return movie || null;
}

async function findRelatedMovies(movie, limit = 5) {
  return Movie.find({ genre: movie.genre, _id: { $ne: movie._id } })
    .sort({ views: -1, createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 5, 1), 10))
    .lean();
}

async function searchMovies(query, options = {}) {
  const normalizedQuery = normalizeSearchText(query).slice(0, 100);
  const { page, pageSize, skip } = normalizePageOptions(options);
  if (!normalizedQuery) {
    return { items: [], total: 0, page, pageSize, hasMore: false };
  }

  const candidates = [
    Movie.find({ titleNormalized: { $regex: `^${escapeRegex(normalizedQuery)}` } })
      .select({
        code: 1,
        title: 1,
        titleNormalized: 1,
        year: 1,
        genre: 1,
        views: 1,
        titleNgrams: 1
      })
      .sort({ titleNormalized: 1 })
      .limit(SEARCH_CANDIDATE_LIMIT)
      .lean(),
    Movie.find({ $text: { $search: normalizedQuery } })
      .select({
        code: 1,
        title: 1,
        titleNormalized: 1,
        year: 1,
        genre: 1,
        views: 1,
        titleNgrams: 1,
        score: { $meta: 'textScore' }
      })
      .sort({ score: { $meta: 'textScore' } })
      .limit(SEARCH_CANDIDATE_LIMIT)
      .lean()
  ];
  const queryNgrams = createNgrams(normalizedQuery);
  if (normalizedQuery.length >= 3 && queryNgrams.length) {
    candidates.push(
      Movie.find({ titleNgrams: { $in: queryNgrams } })
        .select({
          code: 1,
          title: 1,
          titleNormalized: 1,
          year: 1,
          genre: 1,
          views: 1,
          titleNgrams: 1
        })
        .limit(SEARCH_CANDIDATE_LIMIT)
        .lean()
    );
  }

  const candidateGroups = await Promise.all(candidates);
  const uniqueCandidates = new Map();
  candidateGroups.flat().forEach((movie) => uniqueCandidates.set(String(movie._id), movie));

  const ranked = [...uniqueCandidates.values()]
    .map((movie) => ({
      ...movie,
      matchScore: scoreTitleMatch(normalizedQuery, movie.titleNormalized)
    }))
    .filter(
      (movie) =>
        movie.titleNormalized.includes(normalizedQuery) ||
        movie.matchScore >= (normalizedQuery.length >= 4 ? 0.55 : 0.7)
    )
    .sort(
      (left, right) =>
        right.matchScore - left.matchScore || left.title.localeCompare(right.title, 'uz')
    );

  const items = ranked.slice(skip, skip + pageSize);
  return {
    items,
    total: ranked.length,
    page,
    pageSize,
    hasMore: skip + items.length < ranked.length
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  prepareMovieTextIndex,
  createMovie,
  updateMovie,
  changeMovieCode,
  deleteMovie,
  findMovieByCode,
  findMovieById,
  incrementMovieViews,
  getNextMovieCode,
  listAllMovies,
  listNewMovies,
  listTopMovies,
  listMoviesByGenre,
  listGenres,
  findRandomMovie,
  findRelatedMovies,
  searchMovies
};
