const express = require('express');
const mongoose = require('mongoose');
const SurplusListing = require('../models/SurplusListing');
const DonationClaim = require('../models/DonationClaim');
const Charity = require('../models/Charity');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../middleware/errors');
const schemas = require('../validation/schemas');
const { lockPacks, releasePacks, createHold } = require('../services/holds');

// F2 – FR2.4 charity donation claims, with the FR2.5 stock lock (owned by Abisheak S).
const router = express.Router();

async function charityOf(userId) {
  const charity = await Charity.findOne({ owner: userId });
  if (!charity) throw new HttpError(404, 'Charity profile not found.');
  return charity;
}

// Packs claimed since midnight. Cancelled claims do not count against the fair-share limit.
async function claimedToday(charityId, now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const rows = await DonationClaim.aggregate([
    { $match: { charity: charityId, status: { $ne: 'cancelled' }, createdAt: { $gte: midnight } } },
    { $group: { _id: null, n: { $sum: '$quantity' } } },
  ]);
  return rows.length ? rows[0].n : 0;
}

const withListing = { path: 'listing', select: 'item category pickupFrom pickupTo safeUntil restaurant', populate: { path: 'restaurant', select: 'name area address phone' } };

router.post('/listings/:id/claims', requireAuth, requireRole('charity'), validate(schemas.claim), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.valid;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Listing not found.');
  const charity = await charityOf(req.user.id);
  if (charity.status !== 'approved') throw new HttpError(403, 'Your charity must be verified by an administrator before it can claim donations.');
  const listing = await SurplusListing.findById(id);
  const now = new Date();
  if (!listing || listing.status === 'withdrawn') throw new HttpError(404, 'Listing not found.');
  if (listing.offerType !== 'donate') throw new HttpError(409, 'This listing is for sale. Only donation listings can be claimed.');
  if (listing.status === 'expired' || listing.safeUntil <= now || listing.pickupTo <= now) throw new HttpError(409, 'This listing is no longer available.');

  const used = await claimedToday(charity._id, now);
  const left = charity.dailyClaimLimit - used;
  if (quantity > left) {
    throw new HttpError(400, `Your daily fair-share limit is ${charity.dailyClaimLimit} packs. You have ${Math.max(left, 0)} left today.`, { quantity: `You can claim ${Math.max(left, 0)} more today.` });
  }
  const locked = await lockPacks(listing._id, quantity, 'donate', now);
  const claim = await createHold('claim', { charity: charity._id, quantity }, locked._id);
  res.status(201).json(await claim.populate(withListing));
}));

router.get('/claims/mine', requireAuth, requireRole('charity'), asyncHandler(async (req, res) => {
  const charity = await charityOf(req.user.id);
  const [claims, used] = await Promise.all([
    DonationClaim.find({ charity: charity._id }).sort({ createdAt: -1 }).limit(100).populate(withListing),
    claimedToday(charity._id),
  ]);
  res.json({ claims, today: { used, limit: charity.dailyClaimLimit, left: Math.max(charity.dailyClaimLimit - used, 0) } });
}));

// Charities may cancel until the pickup window starts; the packs go straight back to search.
router.post('/claims/:id/cancel', requireAuth, requireRole('charity'), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Claim not found.');
  const charity = await charityOf(req.user.id);
  const claim = await DonationClaim.findOne({ _id: req.params.id, charity: charity._id }).populate('listing', 'pickupFrom');
  if (!claim) throw new HttpError(404, 'Claim not found.');
  if (claim.status !== 'claimed') throw new HttpError(409, `This claim is already ${claim.status}.`);
  if (claim.listing && claim.listing.pickupFrom <= new Date()) throw new HttpError(409, 'The pickup window has started, so this claim can no longer be cancelled.');
  const updated = await DonationClaim.findOneAndUpdate({ _id: claim._id, status: 'claimed' }, { status: 'cancelled' }, { new: true });
  if (!updated) throw new HttpError(409, 'This claim was already changed.');
  await releasePacks(claim.listing._id, claim.quantity);
  res.json(updated);
}));

module.exports = router;
