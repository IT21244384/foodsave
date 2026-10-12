const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Charity = require('../models/Charity');
const { validate } = require('../middleware/validate');
const { signToken, requireAuth } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');

const toPoint = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

async function profileFor(user) {
  if (user.role === 'restaurant') return Restaurant.findOne({ owner: user._id });
  if (user.role === 'charity') return Charity.findOne({ owner: user._id });
  return null;
}

module.exports = function authRoutes({ loginLimit }) {
  const router = express.Router();
  // Slows down password guessing: N failed or successful attempts per 15 minutes per IP.
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: loginLimit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' } });

  // Customers and restaurants register here. Charities use POST /api/charities/register (needs a document upload).
  router.post('/register', validate(schemas.register), asyncHandler(async (req, res) => {
    const { name, email, password, role, phone, restaurant } = req.valid;
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.', { email: 'An account with this email already exists.' });
    const user = await User.create({ name, email, phone, role, passwordHash: await bcrypt.hash(password, 10) });
    let profile = null;
    try {
      if (role === 'restaurant') {
        const { lat, lng, ...rest } = restaurant;
        profile = await Restaurant.create({ ...rest, owner: user._id, location: toPoint(lat, lng) });
      }
    } catch (err) {
      await User.deleteOne({ _id: user._id }); // no orphan users if the profile fails
      throw err;
    }
    res.status(201).json({ token: signToken(user), user, profile });
  }));

  router.post('/login', loginLimiter, validate(schemas.login), asyncHandler(async (req, res) => {
    const { email, password } = req.valid;
    const user = await User.findOne({ email }).select('+passwordHash');
    // Same message for unknown email and wrong password, so accounts cannot be enumerated.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Incorrect email or password.');
    res.json({ token: signToken(user), user, profile: await profileFor(user) });
  }));

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw new HttpError(401, 'Please sign in to continue.');
    res.json({ user, profile: await profileFor(user) });
  }));

  return router;
};
module.exports.toPoint = toPoint;
