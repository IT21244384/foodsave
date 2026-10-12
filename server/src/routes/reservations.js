const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const SurplusListing = require('../models/SurplusListing');
const Reservation = require('../models/Reservation');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');

// F2 – FR2.3 customer reservations and FR2.5 stock locking (owned by Abisheak S).
const router = express.Router();
const PER_PERSON_LIMIT = 2;
const reserveBody = z.object({
  quantity: z.coerce.number({ error: 'Choose how many packs.' }).int('Choose a whole number of packs.').min(1, 'Reserve at least 1 pack.').max(PER_PERSON_LIMIT, `You can reserve at most ${PER_PERSON_LIMIT} packs.`),
});

const newCode = () => `FS-${crypto.randomInt(1000, 10000)}`;

router.post('/listings/:id/reservations', requireAuth, requireRole('customer'), validate(reserveBody), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.valid;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Listing not found.');
  const listing = await SurplusListing.findById(id);
  const now = new Date();
  if (!listing || listing.status === 'withdrawn') throw new HttpError(404, 'Listing not found.');
  if (listing.offerType !== 'sale') throw new HttpError(409, 'Donation listings can only be claimed by verified charities.');
  if (listing.status === 'expired' || listing.safeUntil <= now || listing.pickupTo <= now) throw new HttpError(409, 'This listing is no longer available.');

  const already = await Reservation.aggregate([
    { $match: { listing: listing._id, customer: new mongoose.Types.ObjectId(req.user.id), status: 'reserved' } },
    { $group: { _id: null, n: { $sum: '$quantity' } } },
  ]);
  const held = already.length ? already[0].n : 0;
  if (held + quantity > PER_PERSON_LIMIT) {
    throw new HttpError(400, `You already hold ${held} pack${held === 1 ? '' : 's'} of this listing. The limit is ${PER_PERSON_LIMIT} per person.`, { quantity: `You can reserve ${PER_PERSON_LIMIT - held} more.` });
  }

  // FR2.5 stock lock: the availability check and the decrement happen in ONE atomic database
  // operation, so two people can never both take the last pack.
  const locked = await SurplusListing.findOneAndUpdate(
    { _id: listing._id, status: 'active', offerType: 'sale', available: { $gte: quantity }, pickupTo: { $gt: now }, safeUntil: { $gt: now } },
    { $inc: { available: -quantity } },
    { new: true }
  );
  if (!locked) {
    const fresh = await SurplusListing.findById(listing._id);
    const left = fresh ? fresh.available : 0;
    throw new HttpError(409, left > 0
      ? `Only ${left} pack${left === 1 ? '' : 's'} left — someone reserved just before you. Nothing was charged.`
      : 'Sorry, the last pack was just reserved by someone else.', { quantity: `${left} left.` });
  }
  if (locked.available === 0) await SurplusListing.updateOne({ _id: locked._id, available: 0, status: 'active' }, { status: 'reserved' });

  let reservation;
  for (let attempt = 0; attempt < 5 && !reservation; attempt += 1) {
    try {
      reservation = await Reservation.create({ listing: locked._id, customer: req.user.id, quantity, pickupCode: newCode() });
    } catch (err) {
      if (err.code !== 11000) { await releasePacks(locked._id, quantity); throw err; }
    }
  }
  if (!reservation) { await releasePacks(locked._id, quantity); throw new HttpError(500, 'Could not create a pickup code. Please try again.'); }
  res.status(201).json(await reservation.populate({ path: 'listing', select: 'item price pickupFrom pickupTo restaurant', populate: { path: 'restaurant', select: 'name area address' } }));
}));

async function releasePacks(listingId, quantity) {
  await SurplusListing.updateOne({ _id: listingId }, { $inc: { available: quantity } });
  await SurplusListing.updateOne({ _id: listingId, status: 'reserved', available: { $gt: 0 } }, { status: 'active' });
}

router.get('/reservations/mine', requireAuth, requireRole('customer'), asyncHandler(async (req, res) => {
  const list = await Reservation.find({ customer: req.user.id }).sort({ createdAt: -1 }).limit(100)
    .populate({ path: 'listing', select: 'item price pickupFrom pickupTo restaurant', populate: { path: 'restaurant', select: 'name area address' } });
  res.json(list);
}));

// Customers may cancel until the pickup window starts; the packs go straight back to search.
router.post('/reservations/:id/cancel', requireAuth, requireRole('customer'), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Reservation not found.');
  const r = await Reservation.findOne({ _id: req.params.id, customer: req.user.id }).populate('listing', 'pickupFrom');
  if (!r) throw new HttpError(404, 'Reservation not found.');
  if (r.status !== 'reserved') throw new HttpError(409, `This reservation is already ${r.status}.`);
  if (r.listing && r.listing.pickupFrom <= new Date()) throw new HttpError(409, 'The pickup window has started, so this reservation can no longer be cancelled.');
  const updated = await Reservation.findOneAndUpdate({ _id: r._id, status: 'reserved' }, { status: 'cancelled' }, { new: true });
  if (!updated) throw new HttpError(409, 'This reservation was already changed.');
  await releasePacks(r.listing._id, r.quantity);
  res.json(updated);
}));

module.exports = router;
module.exports.PER_PERSON_LIMIT = PER_PERSON_LIMIT;
