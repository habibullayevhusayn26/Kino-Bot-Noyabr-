const pino = require('pino');

module.exports = pino({
  level: 'info',
  base: { service: 'moviebot' },
  redact: {
    paths: ['req.headers.authorization', 'config.botToken', 'config.mongoUri'],
    censor: '[redacted]'
  }
});
