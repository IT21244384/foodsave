// F1 – FR1.5 hand-over confirmation at pickup (Janahan R).
const { useDatabase, makeUser, makeRestaurant, makeListing, api, at } = require('./helpers');
const SurplusListing = require('../src/models/SurplusListing');
const Reservation = require('../src/models/Reservation');

useDatabase();

async function setup(listingOverrides = {}) {
  const shop = await makeRestaurant();
  const listing = await makeListing(shop.restaurant, { quantity: 10, available: 7, packWeightKg: 0.45, price: 250, ...listingOverrides });
  const customer = await makeUser('customer', { name: 'Nimal Perera' });
  const reservation = await Reservation.create({ listing: listing._id, customer: customer.user._id, quantity: 2, pickupCode: 'FS-4821' });
  return { ...shop, listing, customer, reservation };
}

const confirm = (auth, code) => api().post('/api/handover/confirm').set(auth).send({ code });

describe('FR1.5 hand-over confirmation', () => {
  test('TC-F1-30 a valid code marks the reservation collected and reports kg saved', async () => {
    const { auth, reservation } = await setup();
    const res = await confirm(auth, 'FS-4821');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'reservation', code: 'FS-4821', quantity: 2, kgSaved: 0.9, amountDue: 500, listingStatus: 'active' });
    const saved = await Reservation.findById(reservation._id);
    expect(saved.status).toBe('collected');
    expect(saved.collectedAt).toBeInstanceOf(Date);
  });

  test('TC-F1-31 codes are accepted in lower case or as just the digits', async () => {
    const { auth } = await setup();
    expect((await confirm(auth, '4821')).body.code).toBe('FS-4821');
  });

  test('TC-F1-32 badly formatted and unknown codes are rejected', async () => {
    const { auth } = await setup();
    const bad = await confirm(auth, 'hello');
    expect(bad.status).toBe(400);
    expect(bad.body.fields.code).toMatch(/FS-1234/);
    expect((await confirm(auth, { $ne: null })).status).toBe(400); // no operator injection
    expect((await confirm(auth, 'FS-9999')).status).toBe(404);
  });

  test('TC-SEC-20 a restaurant cannot confirm another restaurant’s code', async () => {
    const { reservation } = await setup();
    const other = await makeRestaurant('approved', { name: 'Bake House' });
    const res = await confirm(other.auth, 'FS-4821');
    expect(res.status).toBe(404);
    expect((await Reservation.findById(reservation._id)).status).toBe('reserved');
  });

  test('TC-F1-33 the same code cannot be confirmed twice', async () => {
    const { auth } = await setup();
    expect((await confirm(auth, 'FS-4821')).status).toBe(200);
    const again = await confirm(auth, 'FS-4821');
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already collected/);
  });

  test('TC-F1-34 two staff confirming at the same moment only succeed once', async () => {
    const { auth } = await setup();
    const results = await Promise.all([confirm(auth, 'FS-4821'), confirm(auth, 'FS-4821'), confirm(auth, 'FS-4821')]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  test('TC-F1-35 cancelled bookings and food past safe-until cannot be handed over', async () => {
    const { auth, reservation, listing } = await setup();
    await Reservation.updateOne({ _id: reservation._id }, { status: 'cancelled' });
    expect((await confirm(auth, 'FS-4821')).status).toBe(409);

    await Reservation.updateOne({ _id: reservation._id }, { status: 'reserved' });
    await SurplusListing.updateOne({ _id: listing._id }, { safeUntil: at(-1) });
    const late = await confirm(auth, 'FS-4821');
    expect(late.status).toBe(409);
    expect(late.body.error).toMatch(/safe-until/);
  });

  test('TC-F1-36 the listing becomes collected after its last pack is handed over', async () => {
    const { auth, listing, customer } = await setup({ quantity: 3, available: 0, status: 'reserved' });
    await Reservation.create({ listing: listing._id, customer: customer.user._id, quantity: 1, pickupCode: 'FS-4822' });
    expect((await confirm(auth, 'FS-4821')).body.listingStatus).toBe('reserved'); // FS-4822 still to come
    expect((await confirm(auth, 'FS-4822')).body.listingStatus).toBe('collected');
    expect((await SurplusListing.findById(listing._id)).status).toBe('collected');
  });

  test('TC-F1-37 pending pickups list open bookings without revealing codes', async () => {
    const { auth } = await setup();
    const res = await api().get('/api/handover/pending').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ type: 'reservation', name: 'Nimal Perera', quantity: 2, item: 'Vegetable fried rice', kg: 0.9, amountDue: 500 });
    expect(JSON.stringify(res.body)).not.toContain('FS-4821');

    await confirm(auth, 'FS-4821');
    expect((await api().get('/api/handover/pending').set(auth)).body).toHaveLength(0);
  });

  test('TC-SEC-21 only approved restaurants can use hand-over', async () => {
    const pending = await makeRestaurant('pending');
    expect((await api().get('/api/handover/pending').set(pending.auth)).status).toBe(403);
    const customer = await makeUser('customer');
    expect((await confirm(customer.auth, 'FS-4821')).status).toBe(403);
    expect((await api().post('/api/handover/confirm').send({ code: 'FS-4821' })).status).toBe(401);
  });
});
