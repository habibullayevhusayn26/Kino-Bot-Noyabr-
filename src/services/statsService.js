const { User, Movie, BroadcastJob } = require('../models');

async function getStatistics(timezone = 'Asia/Tashkent') {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [
    totalUsers,
    activeToday,
    activeWeek,
    activeMonth,
    totalMovies,
    topMovies,
    newUsersPerDay,
    broadcast
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ lastActiveAt: { $gte: dayAgo } }),
    User.countDocuments({ lastActiveAt: { $gte: weekAgo } }),
    User.countDocuments({ lastActiveAt: { $gte: monthAgo } }),
    Movie.countDocuments(),
    Movie.find()
      .select({ code: 1, title: 1, views: 1, year: 1 })
      .sort({ views: -1, createdAt: -1 })
      .limit(10)
      .lean(),
    User.aggregate([
      { $match: { joinedAt: { $gte: weekAgo } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$joinedAt',
              timezone
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 7 }
    ]),
    BroadcastJob.findById('main').lean()
  ]);

  return {
    totalUsers,
    activeToday,
    activeWeek,
    activeMonth,
    totalMovies,
    topMovies,
    newUsersPerDay,
    broadcast: broadcast || { runs: 0, sent: 0, failed: 0, blocked: 0 }
  };
}

module.exports = { getStatistics };
