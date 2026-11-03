// F1 – FR1.4 expiry, FR1.5 hand-over, FR1.6 monthly report (Janahan R).
const { useDatabase, makeUser, makeRestaurant, makeListing, api, at } = require('./helpers');
const SurplusListing = require('../src/models/SurplusListing');
const Reservation = require('../src/models/Reservation');
const Notification = require('../src/models/Notification');
const { runExpiry } = require('../src/jobs/expiry');

useDatabase();

const reserve = (listing, auth, quantity = 1) => api().post(`/api/listings/${listing.id}/reservations`).set(auth).send({ quantity });
const collect = (auth, code, opts) => api(opts).post('/api/handover/collect').set(auth).send({ code });

describe('FR1.4 automatic expiry', () => {
  test('TC-F1-24 a listing past its safe-until time becomes Expired and leaves search', async () => {
    const { restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant, { pickupFrom: at(-90), pickupTo: at(-30), safeUntil: at(-1) });
    const result = await runExpiry();
    expect(result.expired).toBe(1);
    expect((await SurplusListing.findById(listing.id)).status).toBe('expired');
  });

  test('TC-F1-25 a listing still inside its safe time is left alone', async () => {
    const { restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant);
    await runExpiry();
    expect((await SurplusListing.findById(listing.id)).status).toBe('active');
  });

  test('TC-F1-26 open reservations become no-shows and the holder is notified', async () => {
    const { restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant);
    const { user, auth } = await makeUser('customer');
    const r = await reserve(listing, auth);
    await SurplusListing.updateOne({ _id: listing.id }, { safeUntil: at(-1) });
    expect((await runExpiry()).notified).toBe(1);
    expect((await Reservation.findById(r.body.id)).status).toBe('no-show');
    const note = await Notification.findOne({ user: user._id });
    expect(note.title).toBe('Pickup expired');
    expect(note.body).toContain(r.body.pickupCode);
  });

  test('TC-F1-27 running the job twice changes nothing more (a missed run is safe)', async () => {
    const { restaurant } = await makeRestaurant();
    await makeListing(restaurant, { pickupFrom: at(-90), pickupTo: at(-30), safeUntil: at(-1) });
    await runExpiry();
    expect(await runExpiry()).toEqual({ expired: 0, notified: 0 });
  });
});

describe('FR1.5 hand-over', () => {
  let restaurant; let staff; let customer; let listing; let code;
  beforeEach(async () => {
    const r = await makeRestaurant();
    restaurant = r.restaurant; staff = r.auth;
    listing = await makeListing(restaurant, { quantity: 2, available: 2 });
    customer = await makeUser('customer');
    code = (await reserve(listing, customer.auth, 2)).body.pickupCode;
  });

  test('TC-F1-28 staff see the booking with the customer contact', async () => {
    const res = await api().get('/api/handover').set(staff);
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ code, kind: 'reservation', quantity: 2, status: 'reserved', person: customer.user.name, amount: 500 });
  });

  test('TC-F1-29 the right code collects, and the listing becomes Collected', async () => {
    const res = await collect(staff, code);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('collected');
    expect((await SurplusListing.findById(listing.id)).status).toBe('collected');
  });

  test('TC-F1-30 a wrong code is rejected', async () => {
    const res = await collect(staff, 'FS-0000');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/does not match/);
  });

  test('TC-F1-31 a code can be used only once', async () => {
    await collect(staff, code);
    const res = await collect(staff, code);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already been used/);
  });

  test('TC-F1-32 a badly formed code gets a field message', async () => {
    const res = await collect(staff, 'hello');
    expect(res.status).toBe(400);
    expect(res.body.fields.code).toMatch(/FS-4821/);
  });

  test('TC-F1-33 food past its safe-until time cannot be handed over', async () => {
    await SurplusListing.updateOne({ _id: listing.id }, { safeUntil: at(-1) });
    const res = await collect(staff, code);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/safe-until/);
  });

  test('TC-F1-34 no-show is refused during the window and accepted after it', async () => {
    const [row] = (await api().get('/api/handover').set(staff)).body;
    expect((await api().post(`/api/handover/reservation/${row.id}/no-show`).set(staff)).status).toBe(409);
    await SurplusListing.updateOne({ _id: listing.id }, { pickupFrom: at(-60), pickupTo: at(-1) });
    const res = await api().post(`/api/handover/reservation/${row.id}/no-show`).set(staff);
    expect(res.body.status).toBe('no-show');
    expect(await Notification.countDocuments({ user: customer.user._id })).toBe(1);
  });

  test('TC-F1-35 withdrawing a listing cancels bookings and tells the customer', async () => {
    const res = await api().post(`/api/listings/${listing.id}/withdraw`).set(staff);
    expect(res.status).toBe(200);
    const r = await Reservation.findOne({ listing: listing.id });
    expect(r.status).toBe('cancelled');
    expect(r.closedReason).toMatch(/withdrew/);
    expect(await Notification.countDocuments({ user: customer.user._id })).toBe(1);
  });

  test('TC-SEC-20 staff cannot collect another restaurant’s code', async () => {
    const other = await makeRestaurant('approved', { name: 'Other Café' });
    expect((await collect(other.auth, code)).status).toBe(404);
    expect((await Reservation.findOne({ pickupCode: code })).status).toBe('reserved');
  });

  test('TC-SEC-21 only restaurant accounts can use hand-over', async () => {
    expect((await collect(customer.auth, code)).status).toBe(403);
    expect((await api().get('/api/handover')).status).toBe(401);
  });

  test('TC-SEC-22 guessing codes is rate limited', async () => {
    const app = api({ codeLimit: 2 });
    const send = () => app.post('/api/handover/collect').set(staff).send({ code: 'FS-0000' });
    await send(); await send();
    expect((await send()).status).toBe(429);
  });
});

describe('FR1.6 monthly report', () => {
  const thisMonth = () => new Date().toISOString().slice(0, 7);

  test('TC-F1-36 report totals match the collected records', async () => {
    const { restaurant, auth } = await makeRestaurant();
    const sale = await makeListing(restaurant, { category: 'Cooked', originalPrice: 650, price: 250, quantity: 4, available: 4 });
    const buyer = await makeUser('customer');
    const noshow = await makeUser('customer');
    const { body } = await reserve(sale, buyer.auth, 2);
    await reserve(sale, noshow.auth, 1); // never collected, must not be counted
    await collect(auth, body.pickupCode);
    const res = await api().get('/api/restaurants/me/report').query({ month: thisMonth() }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ meals: 2, soldPacks: 2, donatedPacks: 0, kg: 0.8, costRecovered: 500, customerSavings: 800 });
    expect(res.body.listings).toMatchObject({ posted: 1, packsOffered: 4, packsUncollected: 2 });
    expect(res.body.topItems[0]).toEqual({ name: 'Vegetable fried rice', meals: 2 });
  });

  test('TC-F1-37 another restaurant’s collections are not included', async () => {
    const mine = await makeRestaurant();
    const other = await makeRestaurant('approved', { name: 'Other Café' });
    const listing = await makeListing(other.restaurant);
    const { auth } = await makeUser('customer');
    const { body } = await reserve(listing, auth, 2);
    await collect(other.auth, body.pickupCode);
    const res = await api().get('/api/restaurants/me/report').set(mine.auth);
    expect(res.body.totals.meals).toBe(0);
  });

  test('TC-F1-38 the report downloads as a PDF', async () => {
    const { auth } = await makeRestaurant();
    const res = await api().get('/api/restaurants/me/report.pdf').set(auth).buffer(true).parse((r, cb) => { const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => cb(null, Buffer.concat(b))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });

  test('TC-F1-39 an invalid month is rejected', async () => {
    const { auth } = await makeRestaurant();
    expect((await api().get('/api/restaurants/me/report').query({ month: '2026-13' }).set(auth)).status).toBe(400);
  });
});
