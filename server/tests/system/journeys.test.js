// Integration and system tests: whole journeys across F1 and F2, through the public API only.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { useDatabase, makeUser, api, at, MALABE } = require('../helpers');
const { runExpiry } = require('../../src/jobs/expiry');

useDatabase();

const uniq = (() => { let i = 0; return () => { i += 1; return i; }; })();
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const search = (q = {}) => api().get('/api/listings/nearby').query({ lat: MALABE.lat, lng: MALABE.lng, ...q });

async function registerRestaurant() {
  const n = uniq();
  const res = await api().post('/api/auth/register').send({
    role: 'restaurant', name: 'Sys Owner', email: `owner${n}@sys.lk`, password: 'Passw0rd!',
    restaurant: { name: `System Café ${n}`, address: '1 Test Road, Malabe', area: 'Malabe', phone: '0112223334', businessRegNo: `PV-S${n}`, lat: 6.9061, lng: 79.9696 },
  });
  expect(res.status).toBe(201);
  return { auth: bearer(res.body.token), id: res.body.profile.id };
}

async function registerCharity() {
  const n = uniq();
  const doc = path.join(os.tmpdir(), `foodsave-cert-${n}.pdf`);
  fs.writeFileSync(doc, '%PDF-1.4 test certificate');
  const res = await api().post('/api/charities/register')
    .field({ name: 'Sys Coordinator', email: `charity${n}@sys.lk`, password: 'Passw0rd!', orgName: `System Home ${n}`, regNo: `NGO/S/${n}`, address: '2 Test Road, Malabe', area: 'Malabe', contactPerson: 'Sys Coordinator', phone: '0112223335', lat: '6.908', lng: '79.975' })
    .attach('document', doc, { contentType: 'application/pdf' });
  fs.unlinkSync(doc);
  expect(res.status).toBe(201);
  return { auth: bearer(res.body.token), id: res.body.profile.id };
}

const body = (o = {}) => ({ item: 'Vegetable fried rice', category: 'Cooked', dietTags: ['Veg'], quantity: 4, originalPrice: 650, price: 250, offerType: 'sale', pickupFrom: at(10), pickupTo: at(60), safeUntil: at(120), hygieneDeclared: true, ...o });

describe('Integration: F1 supply meets F2 demand', () => {
  test('TC-INT-01 a restaurant cannot post until the administrator approves it', async () => {
    const r = await registerRestaurant();
    const admin = await makeUser('admin');
    expect((await api().post('/api/listings').set(r.auth).send(body())).status).toBe(403);
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    expect((await api().post('/api/listings').set(r.auth).send(body())).status).toBe(201);
  });

  test('TC-INT-02 a listing saved in F1 appears in F2 search; a withdrawn one disappears', async () => {
    const r = await registerRestaurant();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const posted = await api().post('/api/listings').set(r.auth).send(body());
    expect((await search()).body.map((l) => l.id)).toContain(posted.body.id);
    await api().post(`/api/listings/${posted.body.id}/withdraw`).set(r.auth);
    expect((await search()).body).toHaveLength(0);
  });

  test('TC-INT-03 an F2 reservation limits how far F1 can lower the quantity', async () => {
    const r = await registerRestaurant();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const { body: l } = await api().post('/api/listings').set(r.auth).send(body());
    const c = await makeUser('customer');
    await api().post(`/api/listings/${l.id}/reservations`).set(c.auth).send({ quantity: 2 });
    const low = await api().put(`/api/listings/${l.id}`).set(r.auth).send(body({ quantity: 1 }));
    expect(low.status).toBe(400);
    expect(low.body.fields.quantity).toMatch(/already reserved/);
    expect((await api().put(`/api/listings/${l.id}`).set(r.auth).send(body({ offerType: 'donate', price: 0 }))).status).toBe(400);
  });

  test('TC-INT-04 expiry (F1) closes a claim (F2) and notifies the charity', async () => {
    const r = await registerRestaurant();
    const ch = await registerCharity();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    await api().patch(`/api/admin/charities/${ch.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const { body: l } = await api().post('/api/listings').set(r.auth).send(body({ offerType: 'donate', price: 0 }));
    const claim = await api().post(`/api/listings/${l.id}/claims`).set(ch.auth).send({ quantity: 2 });
    await runExpiry(new Date(Date.now() + 3 * 3600 * 1000));
    const mine = await api().get('/api/claims/mine').set(ch.auth);
    expect(mine.body.claims[0].status).toBe('no-show');
    const notes = await api().get('/api/notifications').set(ch.auth);
    expect(notes.body.items.map((n) => n.title)).toContain('Pickup expired');
    expect(notes.body.items.find((n) => n.title === 'Pickup expired').body).toContain(claim.body.pickupCode);
  });

  test('TC-INT-05 a charity rejected with a reason is told why and still cannot claim', async () => {
    const r = await registerRestaurant();
    const ch = await registerCharity();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    await api().patch(`/api/admin/charities/${ch.id}/review`).set(admin.auth).send({ decision: 'rejected', reason: 'Certificate has expired.' });
    const { body: l } = await api().post('/api/listings').set(r.auth).send(body({ offerType: 'donate', price: 0 }));
    expect((await api().post(`/api/listings/${l.id}/claims`).set(ch.auth).send({ quantity: 1 })).status).toBe(403);
    const notes = await api().get('/api/notifications').set(ch.auth);
    expect(notes.body.items[0].body).toContain('Certificate has expired.');
  });
});

describe('System: complete user journeys', () => {
  test('TC-SYS-01 sale journey: register, verify, post, search, reserve, collect, report', async () => {
    const r = await registerRestaurant();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const { body: l } = await api().post('/api/listings').set(r.auth).send(body());
    const found = (await search({ diet: 'Veg', km: 3, maxPrice: 300 })).body;
    expect(found[0].id).toBe(l.id);
    const signup = await api().post('/api/auth/register').send({ role: 'customer', name: 'Sys Customer', email: 'cust@sys.lk', password: 'Passw0rd!', phone: '0771112223' });
    const customer = bearer(signup.body.token);
    const { body: resv } = await api().post(`/api/listings/${l.id}/reservations`).set(customer).send({ quantity: 2 });
    expect(resv.pickupCode).toMatch(/^FS-/);
    expect((await api().post('/api/handover/collect').set(r.auth).send({ code: resv.pickupCode })).body.status).toBe('collected');
    expect((await api().get('/api/reservations/mine').set(customer)).body[0].status).toBe('collected');
    const report = await api().get('/api/restaurants/me/report').set(r.auth);
    const impact = await api().get('/api/admin/impact').set(admin.auth);
    expect(report.body.totals.meals).toBe(2);
    expect(report.body.totals.costRecovered).toBe(500);
    expect(impact.body.totals).toMatchObject({ meals: 2, soldPacks: 2, costRecovered: 500 });
  });

  test('TC-SYS-02 donation journey: certificate, verify, claim, hand over, impact', async () => {
    const r = await registerRestaurant();
    const ch = await registerCharity();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const doc = await api().get(`/api/admin/charities/${ch.id}/document`).set(admin.auth);
    expect(doc.status).toBe(200);
    await api().patch(`/api/admin/charities/${ch.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const { body: l } = await api().post('/api/listings').set(r.auth).send(body({ offerType: 'donate', price: 0, quantity: 6 }));
    const { body: claim } = await api().post(`/api/listings/${l.id}/claims`).set(ch.auth).send({ quantity: 6 });
    expect((await search()).body).toHaveLength(0); // fully claimed, so hidden from everyone else
    await api().post('/api/handover/collect').set(r.auth).send({ code: claim.pickupCode });
    expect((await api().get('/api/claims/mine').set(ch.auth)).body.claims[0].status).toBe('collected');
    const listing = (await api().get('/api/listings/mine').set(r.auth)).body[0];
    expect(listing.status).toBe('collected');
    const impact = await api().get('/api/admin/impact').set(admin.auth);
    expect(impact.body.totals).toMatchObject({ meals: 6, donatedPacks: 6, donationValue: 3900 });
    expect(impact.body.perCharity[0].meals).toBe(6);
  });

  test('TC-SYS-03 cancel journey: cancelled packs return to search and another customer gets them', async () => {
    const r = await registerRestaurant();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const { body: l } = await api().post('/api/listings').set(r.auth).send(body({ quantity: 2 }));
    const a = await makeUser('customer');
    const b = await makeUser('customer');
    const first = await api().post(`/api/listings/${l.id}/reservations`).set(a.auth).send({ quantity: 2 });
    expect((await api().post(`/api/listings/${l.id}/reservations`).set(b.auth).send({ quantity: 1 })).status).toBe(409);
    await api().post(`/api/reservations/${first.body.id}/cancel`).set(a.auth);
    expect((await search()).body[0].available).toBe(2);
    expect((await api().post(`/api/listings/${l.id}/reservations`).set(b.auth).send({ quantity: 2 })).status).toBe(201);
  });

  test('TC-SYS-04 expired-food journey: nothing past safe-until can be found, booked or handed over', async () => {
    const r = await registerRestaurant();
    const admin = await makeUser('admin');
    await api().patch(`/api/admin/restaurants/${r.id}/review`).set(admin.auth).send({ decision: 'approved' });
    const { body: l } = await api().post('/api/listings').set(r.auth).send(body());
    const c = await makeUser('customer');
    const { body: resv } = await api().post(`/api/listings/${l.id}/reservations`).set(c.auth).send({ quantity: 1 });
    await runExpiry(new Date(Date.now() + 3 * 3600 * 1000));
    expect((await search()).body).toHaveLength(0);
    const again = await makeUser('customer');
    expect((await api().post(`/api/listings/${l.id}/reservations`).set(again.auth).send({ quantity: 1 })).status).toBe(409);
    expect((await api().post('/api/handover/collect').set(r.auth).send({ code: resv.pickupCode })).status).toBe(409);
    expect((await api().get('/api/admin/impact').set(admin.auth)).body.totals.meals).toBe(0);
  });

  test('TC-SYS-05 demo data loads and the reports show it', async () => {
    const { seed } = require('../../src/seed/seed');
    await seed();
    const login = await api().post('/api/auth/login').send({ email: 'admin@foodsave.lk', password: 'Demo@1234' });
    const month = new Date(Date.now() - 86400000).toISOString().slice(0, 7);
    const impact = await api().get('/api/admin/impact').query({ month }).set(bearer(login.body.token));
    expect(impact.body.totals.meals).toBeGreaterThan(0);
    expect((await search({ km: 10 })).body.length).toBeGreaterThan(3);
  });
});
