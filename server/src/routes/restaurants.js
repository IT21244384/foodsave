const express = require('express');
const Restaurant = require('../models/Restaurant');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');
const { toPoint } = require('./auth');

// F1 – FR1.1: restaurant profile (owned by Janahan R).
const router = express.Router();
router.use(requireAuth, requireRole('restaurant'));

router.get('/me', asyncHandler(async (req, res) => {
  const profile = await Restaurant.findOne({ owner: req.user.id });
  if (!profile) throw new HttpError(404, 'Restaurant profile not found.');
  res.json(profile);
}));

// Editing a rejected profile sends it back for review; an approved profile stays approved.
router.put('/me', validate(schemas.restaurantProfile), asyncHandler(async (req, res) => {
  const { lat, lng, ...rest } = req.valid;
  const profile = await Restaurant.findOne({ owner: req.user.id });
  if (!profile) throw new HttpError(404, 'Restaurant profile not found.');
  Object.assign(profile, rest, { location: toPoint(lat, lng) });
  if (profile.status === 'rejected') Object.assign(profile, { status: 'pending', rejectionReason: undefined });
  await profile.save();
  res.json(profile);
}));

module.exports = router;
