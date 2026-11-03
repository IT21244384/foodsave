const crypto = require('crypto');
const SurplusListing = require('../models/SurplusListing');
const Reservation = require('../models/Reservation');
const DonationClaim = require('../models/DonationClaim');
const Charity = require('../models/Charity');
const Notification = require('../models/Notification');
const { HttpError } = require('../middleware/errors');

// A "hold" is a reservation (F2 – FR2.3) or a donation claim (F2 – FR2.4) on a listing.
const OPEN = { reservation: 'reserved', claim: 'claimed' };
const MODEL = { reservation: Reservation, claim: DonationClaim };

// FR2.5 stock lock: the availability check and the decrement happen in ONE atomic database
// operation, so two people can never both take the last pack.
async function lockPacks(listingId, quantity, offerType, now = new Date()) {
  const locked = await SurplusListing.findOneAndUpdate(
    { _id: listingId, status: 'active', offerType, available: { $gte: quantity }, pickupTo: { $gt: now }, safeUntil: { $gt: now } },
    { $inc: { available: -quantity } },
    { new: true }
  );
  if (!locked) {
    const fresh = await SurplusListing.findById(listingId);
    const left = fresh ? fresh.available : 0;
    throw new HttpError(409, left > 0
      ? `Only ${left} pack${left === 1 ? '' : 's'} left — someone took some just before you. Nothing was charged.`
      : 'Sorry, the last pack was just taken by someone else.', { quantity: `${left} left.` });
  }
  if (locked.available === 0) await SurplusListing.updateOne({ _id: locked._id, available: 0, status: 'active' }, { status: 'reserved' });
  return locked;
}

async function releasePacks(listingId, quantity) {
  await SurplusListing.updateOne({ _id: listingId }, { $inc: { available: quantity } });
  await SurplusListing.updateOne({ _id: listingId, status: 'reserved', available: { $gt: 0 } }, { status: 'active' });
}

// Creates the hold with a fresh pickup code. If that fails, the packs go back so stock stays correct.
async function createHold(kind, fields, listingId) {
  const prefix = kind === 'claim' ? 'DN' : 'FS';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await MODEL[kind].create({ ...fields, listing: listingId, pickupCode: `${prefix}-${crypto.randomInt(1000, 10000)}` });
    } catch (err) {
      if (err.code !== 11000) { await releasePacks(listingId, fields.quantity); throw err; }
    }
  }
  await releasePacks(listingId, fields.quantity);
  throw new HttpError(500, 'Could not create a pickup code. Please try again.');
}

// Closes every open hold on a listing and tells the people affected (FR1.4 expiry, FR1.2 withdraw).
async function closeOpenHolds(listing, status, reason, title) {
  const [reservations, claims] = await Promise.all([
    Reservation.find({ listing: listing._id, status: OPEN.reservation }),
    DonationClaim.find({ listing: listing._id, status: OPEN.claim }).populate('charity', 'owner'),
  ]);
  const closed = { status, closedReason: reason };
  await Promise.all([
    Reservation.updateMany({ listing: listing._id, status: OPEN.reservation }, closed),
    DonationClaim.updateMany({ listing: listing._id, status: OPEN.claim }, closed),
  ]);
  const notices = [
    ...reservations.map((r) => ({ user: r.customer, code: r.pickupCode })),
    ...claims.filter((c) => c.charity).map((c) => ({ user: c.charity.owner, code: c.pickupCode })),
  ].map(({ user, code }) => ({ user, title, body: `${listing.item} (code ${code}): ${reason}` }));
  if (notices.length) await Notification.insertMany(notices);
  return notices.length;
}

// Once every pack of a listing has been taken and handed over, the listing itself is Collected.
async function settleListing(listingId) {
  const listing = await SurplusListing.findById(listingId);
  if (!listing || listing.available > 0 || !['active', 'reserved'].includes(listing.status)) return;
  const [open, openClaims] = await Promise.all([
    Reservation.exists({ listing: listingId, status: OPEN.reservation }),
    DonationClaim.exists({ listing: listingId, status: OPEN.claim }),
  ]);
  if (!open && !openClaims) await SurplusListing.updateOne({ _id: listingId, status: listing.status }, { status: 'collected' });
}

async function ownerOfCharity(charityId) {
  const charity = await Charity.findById(charityId).select('owner');
  return charity && charity.owner;
}

module.exports = { OPEN, MODEL, lockPacks, releasePacks, createHold, closeOpenHolds, settleListing, ownerOfCharity };
