const express = require('express');
const Restaurant = require('../models/Restaurant');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');
const { toPoint } = require('./auth');
const { monthRange, currentMonth, restaurantReport } = require('../services/impact');
const { sendImpactPdf } = require('../services/pdf');

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

// F1 – FR1.6 monthly report and PDF.
async function reportFor(userId, query) {
  const profile = await Restaurant.findOne({ owner: userId });
  if (!profile) throw new HttpError(404, 'Restaurant profile not found.');
  const month = query.month || currentMonth();
  return { profile, month, ...(await restaurantReport(profile._id, monthRange(month))) };
}

router.get('/me/report', validate(schemas.reportQuery, 'query'), asyncHandler(async (req, res) => {
  const { profile, ...report } = await reportFor(req.user.id, req.valid);
  res.json(report);
}));

router.get('/me/report.pdf', validate(schemas.reportQuery, 'query'), asyncHandler(async (req, res) => {
  const r = await reportFor(req.user.id, req.valid);
  sendImpactPdf(res, {
    filename: `foodsave-report-${r.month}.pdf`,
    title: `${r.profile.name} monthly report`,
    subtitle: r.month,
    totals: r.totals,
    tables: [
      { heading: 'Listings this month', head: ['Measure', 'Value'], rows: [['Listings posted', r.listings.posted], ['Packs offered', r.listings.packsOffered], ['Packs not collected', r.listings.packsUncollected]] },
      { heading: 'Meals saved by week', head: ['Week', 'Meals saved'], rows: r.byWeek.map((x) => [x.label, x.meals]) },
      { heading: 'Top items', head: ['Item', 'Meals saved'], rows: r.topItems.map((x) => [x.name, x.meals]) },
    ],
  });
}));

module.exports = router;
