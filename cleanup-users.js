const config = require('./config');
const mongoose = require('mongoose');
const logger = require('./src/utils/logger');

const mongoUri = config.mongoUri;
const retentionDays = Number(process.argv[2] || 90);

if (!mongoUri) {
  throw new Error('Set DB_URI before running the user cleanup script.');
}
if (!Number.isSafeInteger(retentionDays) || retentionDays < 30) {
  throw new Error('Retention must be a whole number of at least 30 days.');
}

const userSchema = new mongoose.Schema(
  {
    blocked: Boolean,
    lastActiveAt: Date
  },
  {
    collection: 'users',
    strict: false,
    versionKey: false
  }
);
const User = mongoose.model('CleanupUser', userSchema);

async function cleanupUsers() {
  await mongoose.connect(mongoUri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000
  });

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await User.deleteMany({
    $or: [{ blocked: true }, { lastActiveAt: { $lt: cutoff } }]
  });

  logger.info(
    { deletedCount: result.deletedCount, retentionDays },
    'Removed blocked or inactive users'
  );
}

cleanupUsers()
  .catch((error) => {
    logger.error({ err: error }, 'User cleanup failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
