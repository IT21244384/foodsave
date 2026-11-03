// F2 – FR2.4 charity claims and FR2.6 impact dashboard (Abisheak S).
const { useDatabase, makeUser, makeRestaurant, makeListing, api, point } = require('./helpers');
const Charity = require('../src/models/Charity');
const SurplusListing = require('../src/models/SurplusListing');
const DonationClaim = require('../src/models/DonationClaim');

useDatabase();

let regNo = 0;
async function makeCharity(status = 'approved', extra = {}) {
  const owner = await makeUser('charity');
  regNo += 1;
  const charity = await Charity.create({
    owner: owner.user._id, name: `Charity ${regNo}`, regNo: `NGO/${regNo}`, address: '5 Hospital Road', area: 'Malabe', contactPerson: 'Malini', phone: '0112456781',
    location: point(6.908, 79.975), status, document: { originalName: 'c.pdf', storedName: 'c.pdf', mimeType: 'application/pdf', size: 10 }, ...extra,
  });
  return { ...owner, charity };
}
const donation = (restaurant, o = {}) => makeListing(restaurant, { offerType: 'donate', price: 0, quantity: 10, available: 10, ...o });
const claim = (listing, auth, quantity = 1) => api().post(`/api/listings/${listing.id}/claims`).set(auth).send({ quantity });
const collect = (auth, code) => api().post('/api/handover/collect').set(auth).send({ code });

describe('FR2.4 charity claims', () => {
  let restaurant; let staff;
  beforeEach(async () => { ({ restaurant, auth: staff } = await makeRestaurant()); });

  test('TC-F2-22 an approved charity claims part of a donation and gets a code', async () => {
    const listing = await donation(restaurant);
    const { auth } = await makeCharity();
    const res = await claim(listing, auth, 4);
    expect(res.status).toBe(201);
    expect(res.body.pickupCode).toMatch(/^DN-\d{4}$/);
    expect((await SurplusListing.findById(listing.id)).available).toBe(6);
  });

  test('TC-F2-23 claiming everything marks the listing reserved', async () => {
    const listing = await donation(restaurant, { quantity: 3, available: 3 });
    const { auth } = await makeCharity();
    await claim(listing, auth, 3);
    expect((await SurplusListing.findById(listing.id)).status).toBe('reserved');
  });

  test('TC-F2-24 a pending or rejected charity cannot claim', async () => {
    const listing = await donation(restaurant);
    expect((await claim(listing, (await makeCharity('pending')).auth)).status).toBe(403);
    expect((await claim(listing, (await makeCharity('rejected')).auth)).status).toBe(403);
  });

  test('TC-F2-25 a sale listing cannot be claimed', async () => {
    const listing = await makeListing(restaurant);
    const res = await claim(listing, (await makeCharity()).auth);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/for sale/);
  });

  test('TC-F2-26 the daily fair-share limit is enforced with a clear message', async () => {
    const listing = await donation(restaurant, { quantity: 30, available: 30 });
    const { auth } = await makeCharity('approved', { dailyClaimLimit: 5 });
    expect((await claim(listing, auth, 4)).status).toBe(201);
    const res = await claim(listing, auth, 2);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1 left today/);
  });

  test('TC-F2-27 a cancelled claim returns the packs and frees the limit', async () => {
    const listing = await donation(restaurant, { quantity: 5, available: 5 });
    const { auth } = await makeCharity('approved', { dailyClaimLimit: 5 });
    const c = await claim(listing, auth, 5);
    const res = await api().post(`/api/claims/${c.body.id}/cancel`).set(auth);
    expect(res.body.status).toBe('cancelled');
    expect(await SurplusListing.findById(listing.id)).toMatchObject({ available: 5, status: 'active' });
    expect((await claim(listing, auth, 5)).status).toBe(201);
  });

  test('TC-F2-28 history shows only the charity’s own claims and today’s usage', async () => {
    const listing = await donation(restaurant);
    const a = await makeCharity();
    const b = await makeCharity();
    await claim(listing, a.auth, 2);
    await claim(listing, b.auth, 3);
    const res = await api().get('/api/claims/mine').set(a.auth);
    expect(res.body.claims).toHaveLength(1);
    expect(res.body.today).toEqual({ used: 2, limit: 20, left: 18 });
  });

  test('TC-F2-29 stock lock: 20 charities claiming 5 packs at once take exactly 5', async () => {
    const listing = await donation(restaurant, { quantity: 5, available: 5 });
    const charities = await Promise.all(Array.from({ length: 20 }, () => makeCharity()));
    const results = await Promise.all(charities.map((c) => claim(listing, c.auth, 1)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(15);
    expect((await SurplusListing.findById(listing.id)).available).toBe(0);
  });

  test('TC-F2-30 a claim is handed over at the restaurant with its DN code', async () => {
    const listing = await donation(restaurant, { quantity: 2, available: 2 });
    const { body } = await claim(listing, (await makeCharity()).auth, 2);
    const res = await collect(staff, body.pickupCode);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('claim');
    expect((await DonationClaim.findById(body.id)).status).toBe('collected');
  });

  test('TC-SEC-23 customers cannot claim and charities cannot cancel others’ claims', async () => {
    const listing = await donation(restaurant);
    expect((await claim(listing, (await makeUser('customer')).auth)).status).toBe(403);
    const a = await makeCharity();
    const b = await makeCharity();
    const c = await claim(listing, a.auth);
    expect((await api().post(`/api/claims/${c.body.id}/cancel`).set(b.auth)).status).toBe(404);
  });
});

describe('FR2.6 impact dashboard', () => {
  async function scenario() {
    const malabe = await makeRestaurant('approved', { name: 'Malabe Café' });
    const kaduwela = await makeRestaurant('approved', { name: 'Kaduwela Kitchen' });
    await kaduwela.restaurant.updateOne({ area: 'Kaduwela' });
    const sale = await makeListing(malabe.restaurant, { originalPrice: 500, price: 200, category: 'Bakery' });
    const gift = await donation(kaduwela.restaurant, { originalPrice: 600, category: 'Cooked' });
    const customer = await makeUser('customer');
    const charity = await makeCharity();
    const r = await api().post(`/api/listings/${sale.id}/reservations`).set(customer.auth).send({ quantity: 2 });
    const c = await claim(gift, charity.auth, 5);
    await collect(malabe.auth, r.body.pickupCode);
    await collect(kaduwela.auth, c.body.pickupCode);
    await claim(gift, (await makeCharity()).auth, 1); // open claim, must not be counted
    return { charity };
  }

  test('TC-F2-31 dashboard totals match the reservation and claim records', async () => {
    const { charity } = await scenario();
    const res = await api().get('/api/admin/impact').set((await makeUser('admin')).auth);
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ meals: 7, soldPacks: 2, donatedPacks: 5, kg: 2.6, costRecovered: 400, customerSavings: 600, donationValue: 3000 });
    expect(res.body.topRestaurants[0]).toEqual({ name: 'Kaduwela Kitchen', meals: 5 });
    expect(res.body.perCharity).toEqual([{ name: charity.charity.name, meals: 5 }]);
    expect(res.body.byWeek.reduce((n, w) => n + w.meals, 0)).toBe(7);
  });

  test('TC-F2-32 the area filter narrows every figure', async () => {
    await scenario();
    const res = await api().get('/api/admin/impact').query({ area: 'Kaduwela' }).set((await makeUser('admin')).auth);
    expect(res.body.totals.meals).toBe(5);
    expect(res.body.topRestaurants).toHaveLength(1);
  });

  test('TC-F2-33 a month with no collections shows zeros', async () => {
    await scenario();
    const res = await api().get('/api/admin/impact').query({ month: '2020-01' }).set((await makeUser('admin')).auth);
    expect(res.body.totals.meals).toBe(0);
    expect(res.body.topRestaurants).toEqual([]);
  });

  test('TC-F2-34 the monthly report downloads as a PDF', async () => {
    await scenario();
    const res = await api().get('/api/admin/impact/report.pdf').set((await makeUser('admin')).auth).buffer(true).parse((r, cb) => { const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => cb(null, Buffer.concat(b))); });
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  test('TC-SEC-24 only administrators can see platform impact', async () => {
    expect((await api().get('/api/admin/impact').set((await makeUser('customer')).auth)).status).toBe(403);
    expect((await api().get('/api/admin/impact/report.pdf')).status).toBe(401);
  });

  test('TC-SEC-25 notifications are private to their owner', async () => {
    const { auth: a } = await makeUser('customer');
    const { user: u, auth: b } = await makeUser('customer');
    await require('../src/models/Notification').create({ user: u._id, title: 'Hi', body: 'Secret' });
    expect((await api().get('/api/notifications').set(a)).body.items).toHaveLength(0);
    const mine = await api().get('/api/notifications').set(b);
    expect(mine.body).toMatchObject({ unread: 1 });
    await api().post('/api/notifications/read-all').set(b);
    expect((await api().get('/api/notifications').set(b)).body.unread).toBe(0);
  });
});
