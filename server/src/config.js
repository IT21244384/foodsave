const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  // Leave empty to run against an in-memory MongoDB with demo data (handy for demos and tests).
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
  maxUploadBytes: 5 * 1024 * 1024,
  maxHoldHoursCooked: 6,
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT) || 10,
};

if (config.env === 'production' && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('Set JWT_SECRET before running in production.');
}

module.exports = config;
