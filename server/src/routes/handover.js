const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const SurplusListing = require('../models/SurplusListing');
const Restaurant = require('../models/Restaurant');
const Reservation = require('../models/Reservation');
const DonationClaim = require('../models/DonationClaim');
const Notification = require('../models/Notification');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');
const { OPEN, MODEL, settleListing, ownerOfCharity } = require('../services/holds');

// F1 – FR1.5 hand-over at the restaurant counter (owned by Janahan R).
async function ownRestaurant(userId) {
  const restaurant = await Restaurant.findOne({ owner: userId });
  if (!restaurant) throw new HttpError(404, 'Restaurant profile not found.');
  return restaurant;
}

const row = (kind) => (h) => ({
  id: h.id,
  kind,
  code: h.pickupCode,
  quantity: h.quantity,
  status: h.status,
  closedReason: h.closedReason,
  collectedAt: h.collectedAt,
  // Contact details are shared with the restaurant only once there is a booking (privacy requirement).
  person: kind === 'claim' ? h.charity?.name : h.customer?.name,
  phone: kind === 'claim' ? h.charity?.phone : h.customer?.phone,
  listing: { id: h.listing.id, item: h.listing.item, price: h.listing.price, pickupFrom: h.listing.pickupFrom, pickupTo: h.listing.pickupTo, safeUntil: h.listing.safeUntil },
  amount: kind === 'claim' ? 0 : h.listing.price * h.quantity,
});

module.exports = function handoverRoutes({ codeLimit }) {
  const router = express.Router();
  router.use(requireAuth, requireRole('restaurant'));
  // Slows down guessing: only rejected codes count towards the limit.
  const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: codeLimit, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many wrong codes. Please wait 15 minutes and try again.' } });

  router.get('/', asyncHandler(async (req, res) => {
    const restaurant = await ownRestaurant(req.user.id);
    const recent = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const listings = await SurplusListing.find({ restaurant: restaurant._id, pickupTo: { $gte: recent } }).select('_id');
    const ids = listings.map((l) => l._id);
    const [reservations, claims] = await Promise.all([
      Reservation.find({ listing: { $in: ids } }).populate('listing').populate('customer', 'name phone'),
      DonationClaim.find({ listing: { $in: ids } }).populate('listing').populate('charity', 'name phone'),
    ]);
    const rows = [...reservations.map(row('reservation')), ...claims.map(row('claim'))]
      .sort((a, b) => new Date(a.listing.pickupFrom) - new Date(b.listing.pickupFrom));
    res.json(rows);
  }));

  router.post('/collect', codeLimiter, validate(schemas.pickupCode), asyncHandler(async (req, res) => {
    const restaurant = await ownRestaurant(req.user.id);
    const { code } = req.valid;
    const kind = code.startsWith('DN') ? 'claim' : 'reservation';
    const Model = MODEL[kind];
    const open = OPEN[kind];
    const found = (await Model.find({ pickupCode: code }).populate('listing')).filter((h) => h.listing && h.listing.restaurant.equals(restaurant._id));
    if (!found.length) throw new HttpError(404, 'That code does not match any pickup at your restaurant.', { code: 'Check the code and try again.' });
    const hold = found.find((h) => h.status === open);
    if (!hold) throw new HttpError(409, `This code has already been used or closed (${found[0].status}).`, { code: 'Each code can be used once.' });
    if (hold.listing.safeUntil <= new Date()) throw new HttpError(409, 'This food has passed its safe-until time and must not be handed over.', { code: 'Past safe-until time.' });
    // Atomic, so a double tap or two staff members cannot both confirm the same code.
    const done = await Model.findOneAndUpdate({ _id: hold._id, status: open }, { status: 'collected', collectedAt: new Date() }, { new: true });
    if (!done) throw new HttpError(409, 'This code has already been used or closed (collected).', { code: 'Each code can be used once.' });
    await settleListing(hold.listing._id);
    await done.populate([{ path: 'listing' }, { path: kind === 'claim' ? 'charity' : 'customer', select: 'name phone' }]);
    res.json(row(kind)(done));
  }));

  // Staff may mark a no-show once the pickup window is over; the expiry job catches any they miss.
  router.post('/:kind/:id/no-show', asyncHandler(async (req, res) => {
    const { kind, id } = req.params;
    if (!Object.hasOwn(MODEL, kind) || !mongoose.isValidObjectId(id)) throw new HttpError(404, 'Pickup not found.');
    const restaurant = await ownRestaurant(req.user.id);
    const hold = await MODEL[kind].findById(id).populate('listing');
    if (!hold || !hold.listing || !hold.listing.restaurant.equals(restaurant._id)) throw new HttpError(404, 'Pickup not found.');
    if (hold.listing.pickupTo > new Date()) throw new HttpError(409, 'You can mark a no-show only after the pickup window has ended.');
    const reason = 'The restaurant marked this pickup as not collected.';
    const done = await MODEL[kind].findOneAndUpdate({ _id: id, status: OPEN[kind] }, { status: 'no-show', closedReason: reason }, { new: true });
    if (!done) throw new HttpError(409, `This pickup is already ${hold.status}.`);
    const user = kind === 'claim' ? await ownerOfCharity(hold.charity) : hold.customer;
    if (user) await Notification.create({ user, title: 'Pickup missed', body: `${hold.listing.item} (code ${hold.pickupCode}): ${reason}` });
    res.json({ id: done.id, status: done.status });
  }));

  return router;
};
