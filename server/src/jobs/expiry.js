const cron = require('node-cron');
const SurplusListing = require('../models/SurplusListing');
const { closeOpenHolds } = require('../services/holds');

// F1 – FR1.4 automatic expiry (owned by Janahan R). Every run looks at ALL overdue listings,
// so a missed run is simply caught by the next one.
async function runExpiry(now = new Date()) {
  const overdue = await SurplusListing.find({ status: { $in: ['active', 'reserved'] }, safeUntil: { $lte: now } });
  let notified = 0;
  for (const listing of overdue) {
    const claimed = await SurplusListing.updateOne({ _id: listing._id, status: listing.status }, { status: 'expired' });
    if (claimed.modifiedCount) {
      notified += await closeOpenHolds(listing, 'no-show', 'The food passed its safe-until time before it was collected.', 'Pickup expired');
    }
  }
  return { expired: overdue.length, notified };
}

function startExpiryJob() {
  const run = () => runExpiry().catch((err) => console.error('Expiry job failed:', err.message));
  run();
  return cron.schedule('*/5 * * * *', run);
}

module.exports = { runExpiry, startExpiryJob };
