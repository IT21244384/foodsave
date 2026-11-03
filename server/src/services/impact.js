const Reservation = require('../models/Reservation');
const DonationClaim = require('../models/DonationClaim');
const SurplusListing = require('../models/SurplusListing');
const Restaurant = require('../models/Restaurant');

// Estimated weight of one pack, used for "kg diverted" (FR1.6, FR2.6). A stated assumption, not a measurement.
const KG_PER_PACK = { Cooked: 0.4, Bakery: 0.3, Packaged: 0.3 };

const currentMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
}

// Every collected pack in the range, from both reservations and claims. Reports count only what
// was really handed over, so their totals always match the hand-over records.
async function collectedHolds({ from, to }) {
  const when = { status: 'collected', collectedAt: { $gte: from, $lt: to } };
  const listing = { path: 'listing', select: 'item category price originalPrice restaurant', populate: { path: 'restaurant', select: 'name area' } };
  const [reservations, claims] = await Promise.all([
    Reservation.find(when).populate(listing),
    DonationClaim.find(when).populate(listing).populate('charity', 'name'),
  ]);
  return [
    ...reservations.map((r) => ({ hold: r, donated: false })),
    ...claims.map((c) => ({ hold: c, donated: true })),
  ].filter(({ hold }) => hold.listing && hold.listing.restaurant);
}

function summarise(rows, from) {
  const totals = { meals: 0, soldPacks: 0, donatedPacks: 0, kg: 0, costRecovered: 0, customerSavings: 0, donationValue: 0 };
  const weeks = Array.from({ length: 5 }, (_, i) => ({ label: `Week ${i + 1}`, meals: 0 }));
  for (const { hold, donated } of rows) {
    const { quantity: q, listing: l } = hold;
    totals.meals += q;
    totals.kg += q * (KG_PER_PACK[l.category] || 0.3);
    if (donated) {
      totals.donatedPacks += q;
      totals.donationValue += q * l.originalPrice;
    } else {
      totals.soldPacks += q;
      totals.costRecovered += q * l.price;
      totals.customerSavings += q * (l.originalPrice - l.price);
    }
    const day = Math.floor((hold.collectedAt - from) / 86400000);
    weeks[Math.min(Math.floor(day / 7), 4)].meals += q;
  }
  totals.kg = Math.round(totals.kg * 10) / 10;
  return { totals, byWeek: weeks };
}

// Adds up meals per name, biggest first.
function rank(rows, nameOf, limit = 10) {
  const sums = new Map();
  for (const r of rows) {
    const name = nameOf(r);
    if (name) sums.set(name, (sums.get(name) || 0) + r.hold.quantity);
  }
  return [...sums].map(([name, meals]) => ({ name, meals })).sort((a, b) => b.meals - a.meals || a.name.localeCompare(b.name)).slice(0, limit);
}

// F2 – FR2.6 platform-wide figures, optionally for one area.
async function platformImpact({ from, to, area }) {
  const all = await collectedHolds({ from, to });
  const rows = area ? all.filter(({ hold }) => hold.listing.restaurant.area === area) : all;
  const areas = await Restaurant.distinct('area', { status: 'approved' });
  return {
    ...summarise(rows, from),
    topRestaurants: rank(rows, (r) => r.hold.listing.restaurant.name),
    perCharity: rank(rows.filter((r) => r.donated), (r) => r.hold.charity && r.hold.charity.name),
    areas: areas.sort(),
  };
}

// F1 – FR1.6 one restaurant's month.
async function restaurantReport(restaurantId, { from, to }) {
  const rows = (await collectedHolds({ from, to })).filter(({ hold }) => hold.listing.restaurant._id.equals(restaurantId));
  const posted = await SurplusListing.find({ restaurant: restaurantId, pickupFrom: { $gte: from, $lt: to }, status: { $ne: 'withdrawn' } }).select('quantity');
  const summary = summarise(rows, from);
  const packsOffered = posted.reduce((n, l) => n + l.quantity, 0);
  return {
    ...summary,
    topItems: rank(rows, (r) => r.hold.listing.item, 5),
    listings: { posted: posted.length, packsOffered, packsUncollected: Math.max(packsOffered - summary.totals.meals, 0) },
  };
}

module.exports = { KG_PER_PACK, currentMonth, monthRange, platformImpact, restaurantReport };
