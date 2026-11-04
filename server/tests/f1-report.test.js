// F1 report – portions, kg saved and cost recovered by month (Janahan R).
const { useDatabase, makeUser, makeRestaurant, makeListing, api } = require('./helpers');
const Charity = require('../src/models/Charity');
const Reservation = require('../src/models/Reservation');
const DonationClaim = require('../src/models/DonationClaim');
const { monthKeys } = require('../src/reports/restaurantReport');

useDatabase();

let codes = 0;
const code = () => `FS-${String((codes += 1)).padStart(4, '0')}`;
const DAY = 24 * 3600 * 1000;

async function reserve(listing, customer, quantity, status, collectedAt) {
  return Reservation.create({ listing: listing._id, customer: customer._id, quantity, pickupCode: code(), status, collectedAt });
}

async function makeCharity() {
  const { user } = await makeUser('charity');
  return Charity.create({
    owner: user._id, name: 'Sahana Elders’ Home', regNo: `NGO/${codes}`, address: '5 Hospital Road, Malabe', area: 'Malabe',
    contactPerson: 'Malini', phone: '0112456781', location: { type: 'Point', coordinates: [79.975, 6.908] }, status: 'approved',
    document: { originalName: 'c.pdf', storedName: 'c.pdf', mimeType: 'application/pdf', size: 10 },
  });
}

const report = (auth, query = '') => api().get(`/api/restaurants/me/report${query}`).set(auth);

describe('F1 monthly report', () => {
  test('TC-F1-38 sums collected portions, kg and money for the current month', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const { user } = await makeUser('customer');
    const rice = await makeListing(restaurant, { price: 250, packWeightKg: 0.45 });
    const buns = await makeListing(restaurant, { item: 'Fish buns', price: 200, packWeightKg: 0.3 });
    const gift = await makeListing(restaurant, { item: 'Dhal curry', offerType: 'donate', price: 0, packWeightKg: 0.5 });
    const now = new Date();
    await reserve(rice, user, 2, 'collected', now);
    await reserve(buns, user, 1, 'collected', now);
    const charity = await makeCharity();
    await DonationClaim.create({ listing: gift._id, charity: charity._id, quantity: 6, pickupCode: code(), status: 'collected', collectedAt: now });

    const res = await report(auth);
    expect(res.status).toBe(200);
    expect(res.body.months).toHaveLength(6);
    const current = res.body.months[5];
    expect(current).toMatchObject({ portionsSold: 3, portionsDonated: 6, kgSaved: 4.2, costRecovered: 700 });
    expect(res.body.totals).toEqual({ portionsSold: 3, portionsDonated: 6, kgSaved: 4.2, costRecovered: 700 });
  });

  test('TC-F1-39 reserved, cancelled and no-show bookings are not counted', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const { user } = await makeUser('customer');
    const listing = await makeListing(restaurant);
    await reserve(listing, user, 2, 'reserved');
    await reserve(listing, user, 2, 'cancelled');
    await reserve(listing, user, 1, 'no-show');
    expect((await report(auth)).body.totals).toEqual({ portionsSold: 0, portionsDonated: 0, kgSaved: 0, costRecovered: 0 });
  });

  test('TC-F1-40 earlier months are grouped separately and empty months are zero', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const { user } = await makeUser('customer');
    const listing = await makeListing(restaurant, { price: 100 });
    await reserve(listing, user, 2, 'collected', new Date(Date.now() - 62 * DAY)); // about two months ago
    await reserve(listing, user, 1, 'collected', new Date(Date.now() - 400 * DAY)); // outside the range

    const res = await report(auth, '?months=4');
    expect(res.body.months.map((m) => m.month)).toEqual(monthKeys(4));
    expect(res.body.months.map((m) => m.portionsSold).reduce((a, b) => a + b)).toBe(2);
    expect(res.body.months[3].portionsSold).toBe(0);
    expect(res.body.totals.costRecovered).toBe(200);
  });

  test('TC-F1-41 a restaurant only sees its own figures', async () => {
    const a = await makeRestaurant();
    const b = await makeRestaurant('approved', { name: 'Bake House' });
    const { user } = await makeUser('customer');
    await reserve(await makeListing(b.restaurant), user, 2, 'collected', new Date());
    expect((await report(a.auth)).body.totals.portionsSold).toBe(0);
    expect((await report(b.auth)).body.totals.portionsSold).toBe(2);
  });

  test('TC-F1-42 the months parameter is validated', async () => {
    const { auth } = await makeRestaurant();
    for (const bad of ['0', '13', 'abc', '2.5']) {
      const res = await report(auth, `?months=${bad}`);
      expect(res.status).toBe(400);
      expect(res.body.fields).toHaveProperty('months');
    }
    expect((await report(auth, '?months=12')).body.months).toHaveLength(12);
  });

  test('TC-SEC-22 only restaurants can read a restaurant report', async () => {
    const { auth } = await makeUser('customer');
    expect((await report(auth)).status).toBe(403);
    expect((await api().get('/api/restaurants/me/report')).status).toBe(401);
  });
});

describe('monthKeys (Sri Lanka time)', () => {
  test('TC-F1-43 lists months oldest first across a year boundary', () => {
    expect(monthKeys(3, new Date('2026-02-10T12:00:00+05:30'))).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  test('TC-F1-44 uses Sri Lanka time at the month boundary', () => {
    // 31 May 20:00 UTC is already 1 June 01:30 in Sri Lanka.
    expect(monthKeys(1, new Date('2026-05-31T20:00:00Z'))).toEqual(['2026-06']);
    expect(monthKeys(1, new Date('2026-05-31T18:00:00Z'))).toEqual(['2026-05']);
  });
});
