const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' });
}

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

// Role-based access control: requireRole('admin'), requireRole('restaurant'), ...
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to do this.' });

module.exports = { signToken, requireAuth, requireRole };
