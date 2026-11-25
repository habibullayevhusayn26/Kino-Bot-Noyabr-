require('dotenv').config();
const crypto = require('crypto');

function parseAdminId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) {
    throw new Error('ADMIN_TG_ID must be a positive Telegram ID number.');
  }

  const telegramId = Number(normalized);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error('ADMIN_TG_ID is not a valid Telegram ID.');
  }
  return telegramId;
}

const botToken = process.env.BOT_TOKEN || '';
const adminTelegramId = parseAdminId(process.env.ADMIN_TG_ID);
let mongoUri = process.env.DB_URI || '';
if (mongoUri) {
  const parsedMongoUri = new URL(mongoUri);
  if (!parsedMongoUri.searchParams.has('authSource')) {
    parsedMongoUri.searchParams.set('authSource', 'admin');
  }
  mongoUri = parsedMongoUri.toString();
}

const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim() || '';
const webhookSecret = crypto
  .createHmac('sha256', 'moviebot-webhook-v1')
  .update(botToken)
  .digest('hex');

function validateConfig() {
  const missingSettings = [];
  if (!botToken) missingSettings.push('BOT_TOKEN');
  if (!mongoUri) missingSettings.push('DB_URI');
  if (!adminTelegramId) missingSettings.push('ADMIN_TG_ID');
  if (missingSettings.length) {
    throw new Error(
      `Missing configuration: ${missingSettings.join(', ')}. Update .env before starting the bot.`
    );
  }

  if (renderExternalUrl) {
    let parsedRenderUrl;
    try {
      parsedRenderUrl = new URL(renderExternalUrl);
    } catch {
      throw new Error('RENDER_EXTERNAL_URL must be a valid HTTPS URL.');
    }
    if (parsedRenderUrl.protocol !== 'https:') {
      throw new Error('RENDER_EXTERNAL_URL must be a valid HTTPS URL.');
    }
  }
}

module.exports = {
  botToken,
  mongoUri,
  admin: {
    telegramId: adminTelegramId,
    telegramIds: adminTelegramId ? [adminTelegramId] : []
  },
  renderExternalUrl,
  webhookSecret,
  timezone: process.env.BOT_TIMEZONE || 'Asia/Tashkent',
  validateConfig,
  parseAdminId
};
