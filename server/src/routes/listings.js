const express = require('express');
const mongoose = require('mongoose');
const SurplusListing = require('../models/SurplusListing');
const Restaurant = require('../models/Restaurant');
const config = require('../config');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');
const { checkListingRules } = require('../validation/listingRules');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function approvedRestaurantOf(userId) {
  const r = await Restaurant.findOne({ owner: userId });
  if (!r) throw new HttpError(404, 'Restaurant profile not found.');
  if (r.status !== 'approved') throw new HttpError(403, 'Your restaurant must be verified by an administrator before you can post surplus.');
  return r;
}

function applyRules(data) {
  const errors = checkListingRules(data, new Date(), { maxHoldHoursCooked: config.maxHoldHoursCooked });
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the highlighted fields.', errors);
  if (data.offerType === 'donate') data.price = 0;
  return data;
}

async function ownListing(userId, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Listing not found.');
  const restaurant = await Restaurant.findOne({ owner: userId });
  const listing = restaurant && (await SurplusListing.findOne({ _id: id, restaurant: restaurant._id }));
  if (!listing) throw new HttpError(404, 'Listing not found.'); // also hides other restaurants' listings
  return listing;
}

// ---------- F2 – FR2.2: "near me" search (owned by Abisheak S). Public: customers and charities browse it.
router.get('/nearby', validate(schemas.nearbyQuery, 'query'), asyncHandler(async (req, res) => {
  const { lat, lng, km, diet, maxPrice, offer, minLeft } = req.valid;
  const now = new Date();
  const query = {
    status: 'active',
    available: { $gt: 0 },
    pickupTo: { $gt: now },
    safeUntil: { $gt: new Date(now.getTime() + minLeft * 60000) },
  };
  if (diet) query.dietTags = diet;
  if (offer !== 'all') query.offerType = offer;
  if (maxPrice !== undefined) query.$or = [{ offerType: 'donate' }, { price: { $lte: maxPrice } }];

  const results = await SurplusListing.aggregate([
    { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distanceM', maxDistance: km * 1000, query, spherical: true } },
    { $sort: { safeUntil: 1 } }, // least time left first, so food is collected before it expires
    { $limit: 100 },
    { $lookup: { from: 'restaurants', localField: 'restaurant', foreignField: '_id', as: 'restaurant', pipeline: [{ $project: { name: 1, area: 1, address: 1 } }] } },
    { $unwind: '$restaurant' },
    { $project: { __v: 0 } },
  ]);
  res.json(results.map(({ _id, restaurant, distanceM, ...rest }) => ({
    id: _id, ...rest, distanceKm: Math.round(distanceM / 100) / 10,
    restaurant: { id: restaurant._id, name: restaurant.name, area: restaurant.area, address: restaurant.address },
  })));
}));

// ---------- F1 – FR1.2, FR1.3, FR1.6: restaurant's own listings (owned by Janahan R).
router.get('/mine', requireAuth, requireRole('restaurant'), validate(schemas.myListingsQuery, 'query'), asyncHandler(async (req, res) => {
  const { q, status, range } = req.valid;
  const restaurant = await Restaurant.findOne({ owner: req.user.id });
  if (!restaurant) throw new HttpError(404, 'Restaurant profile not found.');
  const filter = { restaurant: restaurant._id };
  if (status !== 'all') filter.status = status;
  if (q) filter.item = { $regex: escapeRegex(q), $options: 'i' };
  if (range !== 'all') {
    const start = new Date();
    if (range === 'today') start.setHours(0, 0, 0, 0);
    if (range === 'week') start.setDate(start.getDate() - 7);
    if (range === 'month') start.setMonth(start.getMonth() - 1);
    filter.createdAt = { $gte: start };
  }
  res.json(await SurplusListing.find(filter).sort({ createdAt: -1 }).limit(200));
}));

router.post('/', requireAuth, requireRole('restaurant'), validate(schemas.listing), asyncHandler(async (req, res) => {
  const restaurant = await approvedRestaurantOf(req.user.id);
  const data = applyRules({ ...req.valid });
  const listing = await SurplusListing.create({ ...data, available: data.quantity, restaurant: restaurant._id, location: restaurant.location });
  res.status(201).json(listing);
}));

router.put('/:id', requireAuth, requireRole('restaurant'), validate(schemas.listing), asyncHandler(async (req, res) => {
  await approvedRestaurantOf(req.user.id);
  const listing = await ownListing(req.user.id, req.params.id);
  if (listing.status !== 'active') throw new HttpError(409, `This listing is ${listing.status} and can no longer be edited.`);
  const data = applyRules({ ...req.valid });
  const taken = listing.quantity - listing.available; // packs already reserved or claimed
  if (data.quantity < taken) throw new HttpError(400, 'Please check the highlighted fields.', { quantity: `${taken} packs are already reserved; quantity cannot be lower than that.` });
  Object.assign(listing, data, { available: data.quantity - taken });
  await listing.save();
  res.json(listing);
}));

router.post('/:id/withdraw', requireAuth, requireRole('restaurant'), asyncHandler(async (req, res) => {
  const listing = await ownListing(req.user.id, req.params.id);
  if (!['active', 'reserved'].includes(listing.status)) throw new HttpError(409, `This listing is already ${listing.status}.`);
  listing.status = 'withdrawn';
  await listing.save();
  res.json(listing);
}));

// Public listing detail (used by the customer listing page).
router.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Listing not found.');
  const listing = await SurplusListing.findById(req.params.id).populate('restaurant', 'name area address phone');
  if (!listing || listing.status === 'withdrawn') throw new HttpError(404, 'Listing not found.');
  res.json(listing);
}));

module.exports = router;
