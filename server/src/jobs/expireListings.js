const cron = require('node-cron');
const SurplusListing = require('../models/SurplusListing');
const Reservation = require('../models/Reservation');
const DonationClaim = require('../models/DonationClaim');

// F1 – FR1.4 (Janahan R): listings past their safe-until time are expired automatically, so
// nothing unsafe stays on offer. Packs that were reserved or claimed but never collected are
// marked as no-shows.
async function expireListings(now = new Date()) {
  const due = await SurplusListing.find({ status: { $in: ['active', 'reserved'] }, safeUntil: { $lte: now } }, { _id: 1 }).lean();
  if (due.length === 0) return { listings: 0, noShows: 0 };
  const ids = due.map((l) => l._id);

  // Re-check status and time in the update, so a listing withdrawn or edited after the read is left alone.
  const expired = await SurplusListing.updateMany(
    { _id: { $in: ids }, status: { $in: ['active', 'reserved'] }, safeUntil: { $lte: now } },
    { status: 'expired' }
  );
  const expiredIds = (await SurplusListing.find({ _id: { $in: ids }, status: 'expired' }, { _id: 1 }).lean()).map((l) => l._id);
  const [reservations, claims] = await Promise.all([
    Reservation.updateMany({ listing: { $in: expiredIds }, status: 'reserved' }, { status: 'no-show' }),
    DonationClaim.updateMany({ listing: { $in: expiredIds }, status: 'claimed' }, { status: 'no-show' }),
  ]);
  return { listings: expired.modifiedCount, noShows: reservations.modifiedCount + claims.modifiedCount };
}

async function runOnce(log) {
  try {
    const result = await expireListings();
    if (result.listings) log(`Auto-expiry: ${result.listings} listing(s) expired, ${result.noShows} booking(s) marked no-show.`);
  } catch (err) {
    log(`Auto-expiry failed: ${err.message}`);
  }
}

// Runs every minute (and once straight away at start-up). Not started by the tests,
// which call expireListings() directly.
function startExpiryJob({ schedule = '* * * * *', log = console.log } = {}) {
  runOnce(log);
  return cron.schedule(schedule, () => runOnce(log), { name: 'expire-listings', noOverlap: true });
}

module.exports = { expireListings, startExpiryJob };
