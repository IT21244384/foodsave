const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');

// Builds the Express app. Options let tests use a low login rate limit.
function createApp({ loginLimit = config.loginRateLimit } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Default Helmet headers, plus what OpenStreetMap tiles need for the "near me" map:
  // permission to load the images, and a Referer header (required by the OSM tile usage policy).
  app.use(helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org'] },
    },
  }));
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '100kb' }));
  if (config.env === 'development') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth')({ loginLimit }));
  app.use('/api/restaurants', require('./routes/restaurants'));
  app.use('/api', require('./routes/reservations')); // before /api/listings/:id
  app.use('/api/listings', require('./routes/listings'));
  app.use('/api/charities', require('./routes/charities'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', notFound);

  // Serve the built React client in production (npm run build in /client).
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
