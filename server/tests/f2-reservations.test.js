// F2 – FR2.3 reservations and FR2.5 stock lock (Abisheak S).
const { useDatabase, makeUser, makeRestaurant, makeListing, api, at, MALABE } = require('./helpers');
const SurplusListing = require('../src/models/SurplusListing');
const Reservation = require('../src/models/Reservation');

useDatabase();

const reserve = (listing, auth, quantity = 1) => api().post(`/api/listings/${listing.id}/reservations`).set(auth).send({ quantity });

describe('FR2.3 reservations', () => {
  let restaurant;
  beforeEach(async () => { ({ restaurant } = await makeRestaurant()); });

  test('TC-F2-13 a customer reserves packs and gets a pickup code', async () => {
    const listing = await makeListing(restaurant, { quantity: 10, available: 10 });
    const { auth } = await makeUser('customer');
    const res = await reserve(listing, auth, 2);
    expect(res.status).toBe(201);
    expect(res.body.pickupCode).toMatch(/^FS-\d{4}$/);
    expect(res.body.listing.restaurant.name).toBe('Green Leaf Café');
    expect((await SurplusListing.findById(listing.id)).available).toBe(8);
  });

  test('TC-F2-14 one person can hold at most 2 packs of a listing', async () => {
    const listing = await makeListing(restaurant);
    const { auth } = await makeUser('customer');
    expect((await reserve(listing, auth, 2)).status).toBe(201);
    const res = await reserve(listing, auth, 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit is 2 per person/);
    expect((await reserve(listing, auth, 3)).status).toBe(400); // validation: max 2 in one request
  });

  test('TC-F2-15 donation listings cannot be bought', async () => {
    const listing = await makeListing(restaurant, { offerType: 'donate', price: 0 });
    const { auth } = await makeUser('customer');
    const res = await reserve(listing, auth);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/verified charities/);
  });

  test('TC-F2-16 food past its safe-until time cannot be reserved', async () => {
    const listing = await makeListing(restaurant, { pickupFrom: at(-90), pickupTo: at(-30), safeUntil: at(-1) });
    const { auth } = await makeUser('customer');
    expect((await reserve(listing, auth)).status).toBe(409);
  });

  test('TC-F2-17 asking for more than is left gives a clear message', async () => {
    const listing = await makeListing(restaurant, { quantity: 6, available: 1 });
    const { auth } = await makeUser('customer');
    const res = await reserve(listing, auth, 2);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Only 1 pack left/);
    expect((await SurplusListing.findById(listing.id)).available).toBe(1); // nothing taken
  });

  test('TC-F2-18 the last pack marks the listing reserved and hides it from search', async () => {
    const listing = await makeListing(restaurant, { quantity: 1, available: 1 });
    const { auth } = await makeUser('customer');
    await reserve(listing, auth);
    expect((await SurplusListing.findById(listing.id)).status).toBe('reserved');
    const search = await api().get('/api/listings/nearby').query({ lat: MALABE.lat, lng: MALABE.lng });
    expect(search.body).toHaveLength(0);
  });

  test('TC-F2-19 cancelling returns the packs and reactivates the listing', async () => {
    const listing = await makeListing(restaurant, { quantity: 2, available: 2 });
    const { auth } = await makeUser('customer');
    const r = await reserve(listing, auth, 2);
    expect((await SurplusListing.findById(listing.id)).status).toBe('reserved');
    const res = await api().post(`/api/reservations/${r.body.id}/cancel`).set(auth);
    expect(res.body.status).toBe('cancelled');
    const after = await SurplusListing.findById(listing.id);
    expect(after).toMatchObject({ available: 2, status: 'active' });
  });

  test('TC-F2-20 a customer sees only their own reservations', async () => {
    const listing = await makeListing(restaurant);
    const a = await makeUser('customer');
    const b = await makeUser('customer');
    await reserve(listing, a.auth);
    await reserve(listing, b.auth, 2);
    const res = await api().get('/api/reservations/mine').set(a.auth);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].quantity).toBe(1);
  });
});

describe('FR2.5 stock lock', () => {
  test('TC-F2-21 50 customers reserving 10 packs at the same moment: exactly 10 succeed', async () => {
    const { restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant, { quantity: 10, available: 10 });
    const customers = await Promise.all(Array.from({ length: 50 }, () => makeUser('customer')));
    const results = await Promise.all(customers.map((c) => reserve(listing, c.auth, 1)));
    const ok = results.filter((r) => r.status === 201).length;
    const refused = results.filter((r) => r.status === 409).length;
    expect(ok).toBe(10);
    expect(refused).toBe(40);
    const after = await SurplusListing.findById(listing.id);
    expect(after.available).toBe(0); // never negative: no overselling
    expect(after.status).toBe('reserved');
    expect(await Reservation.countDocuments({ listing: listing.id, status: 'reserved' })).toBe(10);
  });
});

describe('Reservation security', () => {
  test('TC-SEC-18 only customers can reserve', async () => {
    const { restaurant, auth: restaurantAuth } = await makeRestaurant();
    const listing = await makeListing(restaurant);
    const charity = await makeUser('charity');
    expect((await reserve(listing, restaurantAuth)).status).toBe(403);
    expect((await reserve(listing, charity.auth)).status).toBe(403);
    expect((await api().post(`/api/listings/${listing.id}/reservations`).send({ quantity: 1 })).status).toBe(401);
  });

  test('TC-SEC-19 a customer cannot cancel someone else’s reservation', async () => {
    const { restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant);
    const owner = await makeUser('customer');
    const other = await makeUser('customer');
    const r = await reserve(listing, owner.auth);
    expect((await api().post(`/api/reservations/${r.body.id}/cancel`).set(other.auth)).status).toBe(404);
  });
});
