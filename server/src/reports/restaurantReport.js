const SurplusListing = require('../models/SurplusListing');
const Reservation = require('../models/Reservation');
const DonationClaim = require('../models/DonationClaim');

// F1 report (Janahan R): per-restaurant portions, kg saved and cost recovered, by month.
// Months follow Sri Lanka time, so a pickup at 1 a.m. on 1 June counts in June.
const TIMEZONE = 'Asia/Colombo';
const DEFAULT_PACK_KG = 0.4; // same default as SurplusListing.packWeightKg

// The last `count` month keys ("2026-06"), oldest first, ending with the current month in `timeZone`.
function monthKeys(count, now = new Date(), timeZone = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value); // 1–12
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

const monthLabel = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-LK', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const round = (n, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

// Sums collected bookings of one kind per month, joined to their listing for weight and price.
function monthlyTotals(Model, listingIds, since) {
  return Model.aggregate([
    { $match: { listing: { $in: listingIds }, status: 'collected', collectedAt: { $gte: since } } },
    { $lookup: { from: 'surpluslistings', localField: 'listing', foreignField: '_id', as: 'l', pipeline: [{ $project: { price: 1, packWeightKg: 1 } }] } },
    { $unwind: '$l' },
    {
      $group: {
        _id: { $dateToString: { date: '$collectedAt', format: '%Y-%m', timezone: TIMEZONE } },
        portions: { $sum: '$quantity' },
        kg: { $sum: { $multiply: ['$quantity', { $ifNull: ['$l.packWeightKg', DEFAULT_PACK_KG] }] } },
        money: { $sum: { $multiply: ['$quantity', '$l.price'] } },
      },
    },
  ]);
}

async function restaurantReport(restaurantId, { months = 6, now = new Date() } = {}) {
  const keys = monthKeys(months, now);
  // Start a day early to be safe about the time zone; months outside `keys` are dropped below.
  const since = new Date(Date.UTC(Number(keys[0].slice(0, 4)), Number(keys[0].slice(5)) - 1, 1) - 24 * 3600 * 1000);
  const listingIds = (await SurplusListing.find({ restaurant: restaurantId }, { _id: 1 }).lean()).map((l) => l._id);

  const [sold, donated] = await Promise.all([
    monthlyTotals(Reservation, listingIds, since),
    monthlyTotals(DonationClaim, listingIds, since),
  ]);
  const soldBy = new Map(sold.map((r) => [r._id, r]));
  const donatedBy = new Map(donated.map((r) => [r._id, r]));

  const rows = keys.map((month) => {
    const s = soldBy.get(month) || { portions: 0, kg: 0, money: 0 };
    const d = donatedBy.get(month) || { portions: 0, kg: 0 };
    return {
      month, label: monthLabel(month),
      portionsSold: s.portions, portionsDonated: d.portions,
      kgSaved: round(s.kg + d.kg), costRecovered: round(s.money),
    };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return {
    months: rows,
    totals: {
      portionsSold: sum('portionsSold'), portionsDonated: sum('portionsDonated'),
      kgSaved: round(sum('kgSaved')), costRecovered: round(sum('costRecovered')),
    },
    timezone: TIMEZONE,
  };
}

module.exports = { restaurantReport, monthKeys, TIMEZONE };
