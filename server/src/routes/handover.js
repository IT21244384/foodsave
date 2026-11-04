const express = require('express');
const { z } = require('zod');
const Restaurant = require('../models/Restaurant');
const SurplusListing = require('../models/SurplusListing');
const Reservation = require('../models/Reservation');
const DonationClaim = require('../models/DonationClaim');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');

// F1 – FR1.5 hand-over confirmation (owned by Janahan R). At the counter, staff type the pickup
// code the customer or charity shows them. That marks the booking collected and records the
// portions and kg of food saved.
const router = express.Router();
router.use(requireAuth, requireRole('restaurant'));

// Accepts "FS-4821", "fs 4821" or just "4821" and normalises it to "FS-4821".
const confirmBody = z.object({
  code: z.string({ error: 'Enter the pickup code.' }).trim()
    .regex(/^(fs[-\s]?)?\d{4}$/i, 'A pickup code looks like FS-1234.')
    .transform((c) => `FS-${c.slice(-4)}`),
});

const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

async function approvedRestaurant(userId) {
  const r = await Restaurant.findOne({ owner: userId });
  if (!r) throw new HttpError(404, 'Restaurant profile not found.');
  if (r.status !== 'approved') throw new HttpError(403, 'Your restaurant must be verified by an administrator first.');
  return r;
}

// Open reservations and donation claims for this restaurant's listings. Codes are not shown:
// staff must get the code from the person collecting.
router.get('/pending', asyncHandler(async (req, res) => {
  const restaurant = await approvedRestaurant(req.user.id);
  const listings = await SurplusListing.find({ restaurant: restaurant._id, status: { $in: ['active', 'reserved'] } }).lean();
  const byId = new Map(listings.map((l) => [String(l._id), l]));
  const ids = listings.map((l) => l._id);
  const [reservations, claims] = await Promise.all([
    Reservation.find({ listing: { $in: ids }, status: 'reserved' }).populate('customer', 'name').lean(),
    DonationClaim.find({ listing: { $in: ids }, status: 'claimed' }).populate('charity', 'name').lean(),
  ]);
  const row = (b, type, name) => {
    const l = byId.get(String(b.listing));
    return {
      id: b._id, type, name, quantity: b.quantity, item: l.item,
      pickupFrom: l.pickupFrom, pickupTo: l.pickupTo, safeUntil: l.safeUntil,
      kg: round(b.quantity * l.packWeightKg), amountDue: type === 'reservation' ? b.quantity * l.price : 0,
      bookedAt: b.createdAt,
    };
  };
  const rows = [
    ...reservations.map((r) => row(r, 'reservation', r.customer ? r.customer.name : 'Customer')),
    ...claims.map((c) => row(c, 'claim', c.charity ? c.charity.name : 'Charity')),
  ].sort((a, b) => a.pickupFrom - b.pickupFrom || a.bookedAt - b.bookedAt);
  res.json(rows);
}));

// Finds a reservation, or failing that a donation claim, with this code on one of the restaurant's
// listings. Another restaurant's code gets the same "not found" as an unknown code.
async function findBooking(code, restaurantId) {
  for (const [Model, type] of [[Reservation, 'reservation'], [DonationClaim, 'claim']]) {
    const booking = await Model.findOne({ pickupCode: code }).populate('listing');
    if (booking && booking.listing && booking.listing.restaurant.equals(restaurantId)) return { booking, type, Model };
  }
  return null;
}

router.post('/confirm', validate(confirmBody), asyncHandler(async (req, res) => {
  const restaurant = await approvedRestaurant(req.user.id);
  const { code } = req.valid;
  const found = await findBooking(code, restaurant._id);
  if (!found) throw new HttpError(404, `No booking with code ${code} was found for your restaurant.`, { code: 'Check the code and try again.' });

  const { booking, type, Model } = found;
  const listing = booking.listing;
  const openStatus = type === 'reservation' ? 'reserved' : 'claimed';
  if (booking.status !== openStatus) {
    throw new HttpError(409, `Code ${code} is already ${booking.status}${booking.collectedAt ? ` (handed over ${booking.collectedAt.toLocaleString('en-LK')})` : ''}.`);
  }
  const now = new Date();
  if (listing.safeUntil <= now) throw new HttpError(409, 'This food is past its safe-until time and must not be handed over.');

  // Status check and update in one operation, so the same code can't be confirmed twice at once.
  const collected = await Model.findOneAndUpdate({ _id: booking._id, status: openStatus }, { status: 'collected', collectedAt: now }, { new: true });
  if (!collected) throw new HttpError(409, `Code ${code} was just confirmed by someone else.`);

  // Once every pack has been taken and none are still waiting for pickup, the listing is done.
  let listingStatus = listing.status;
  if (listing.available === 0) {
    const [openR, openC] = await Promise.all([
      Reservation.exists({ listing: listing._id, status: 'reserved' }),
      DonationClaim.exists({ listing: listing._id, status: 'claimed' }),
    ]);
    if (!openR && !openC) {
      const done = await SurplusListing.findOneAndUpdate({ _id: listing._id, available: 0, status: { $in: ['active', 'reserved'] } }, { status: 'collected' }, { new: true });
      if (done) listingStatus = done.status;
    }
  }

  res.json({
    type, code, item: listing.item, quantity: collected.quantity,
    kgSaved: round(collected.quantity * listing.packWeightKg),
    amountDue: type === 'reservation' ? collected.quantity * listing.price : 0,
    collectedAt: collected.collectedAt, listingStatus,
  });
}));

module.exports = router;
