const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const Charity = require('../models/Charity');
const Restaurant = require('../models/Restaurant');
const SurplusListing = require('../models/SurplusListing');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');

// Administrator verification: restaurants (FR1.1, F1) and charities (FR2.1, F2).
const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const STATUS = ['pending', 'approved', 'rejected', 'all'];
const listFilter = (q) => (STATUS.includes(q) && q !== 'all' ? { status: q } : {});

async function review(Model, id, adminId, { decision, reason }) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Not found.');
  const doc = await Model.findById(id);
  if (!doc) throw new HttpError(404, 'Not found.');
  Object.assign(doc, { status: decision, rejectionReason: decision === 'rejected' ? reason : undefined, reviewedBy: adminId, reviewedAt: new Date() });
  await doc.save();
  return doc;
}

router.get('/summary', asyncHandler(async (_req, res) => {
  const [pendingCharities, approvedCharities, pendingRestaurants, approvedRestaurants, activeListings] = await Promise.all([
    Charity.countDocuments({ status: 'pending' }), Charity.countDocuments({ status: 'approved' }),
    Restaurant.countDocuments({ status: 'pending' }), Restaurant.countDocuments({ status: 'approved' }),
    SurplusListing.countDocuments({ status: 'active', safeUntil: { $gt: new Date() } }),
  ]);
  res.json({ pendingCharities, approvedCharities, pendingRestaurants, approvedRestaurants, activeListings });
}));

router.get('/charities', asyncHandler(async (req, res) => {
  res.json(await Charity.find(listFilter(req.query.status)).sort({ status: 1, createdAt: -1 }).populate('owner', 'name email'));
}));

router.patch('/charities/:id/review', validate(schemas.review), asyncHandler(async (req, res) => {
  res.json(await review(Charity, req.params.id, req.user.id, req.valid));
}));

// Registration certificates are only ever served to administrators.
router.get('/charities/:id/document', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Not found.');
  const charity = await Charity.findById(req.params.id);
  if (!charity) throw new HttpError(404, 'Not found.');
  const file = path.join(config.uploadDir, path.basename(charity.document.storedName));
  if (!fs.existsSync(file)) throw new HttpError(404, 'The document file is missing.');
  res.type(charity.document.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${charity.document.originalName.replace(/[^\w.-]/g, '_')}"`);
  res.sendFile(file);
}));

router.get('/restaurants', asyncHandler(async (req, res) => {
  res.json(await Restaurant.find(listFilter(req.query.status)).sort({ status: 1, createdAt: -1 }).populate('owner', 'name email'));
}));

router.patch('/restaurants/:id/review', validate(schemas.review), asyncHandler(async (req, res) => {
  res.json(await review(Restaurant, req.params.id, req.user.id, req.valid));
}));

module.exports = router;
