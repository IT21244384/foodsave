// F1 – FR1.4 scheduled auto-expiry (Janahan R).
const { useDatabase, makeUser, makeRestaurant, makeListing, api, at } = require('./helpers');
const SurplusListing = require('../src/models/SurplusListing');
const Reservation = require('../src/models/Reservation');
const { expireListings } = require('../src/jobs/expireListings');

useDatabase();

describe('FR1.4 auto-expiry job', () => {
  test('TC-F1-25 a listing past its safe-until time becomes expired', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const stale = await makeListing(restaurant, { pickupFrom: at(-120), pickupTo: at(-60), safeUntil: at(-1) });
    const soldOut = await makeListing(restaurant, { available: 0, status: 'reserved', pickupFrom: at(-120), pickupTo: at(-60), safeUntil: at(-1) });

    expect(await expireListings()).toMatchObject({ listings: 2 });
    expect((await SurplusListing.findById(stale._id)).status).toBe('expired');
    expect((await SurplusListing.findById(soldOut._id)).status).toBe('expired');
    const mine = await api().get('/api/listings/mine?status=expired').set(auth);
    expect(mine.body).toHaveLength(2);
  });

  test('TC-F1-26 safe listings and already closed listings are left alone', async () => {
    const { restaurant } = await makeRestaurant();
    const fresh = await makeListing(restaurant); // safe for another 2 hours
    const withdrawn = await makeListing(restaurant, { status: 'withdrawn', safeUntil: at(-5), pickupTo: at(-30), pickupFrom: at(-60) });
    const collected = await makeListing(restaurant, { status: 'collected', available: 0, safeUntil: at(-5), pickupTo: at(-30), pickupFrom: at(-60) });

    expect(await expireListings()).toEqual({ listings: 0, noShows: 0 });
    expect((await SurplusListing.findById(fresh._id)).status).toBe('active');
    expect((await SurplusListing.findById(withdrawn._id)).status).toBe('withdrawn');
    expect((await SurplusListing.findById(collected._id)).status).toBe('collected');
  });

  test('TC-F1-27 uncollected reservations on an expired listing become no-shows', async () => {
    const { restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant, { available: 7, pickupFrom: at(-120), pickupTo: at(-60), safeUntil: at(-1) });
    const { user } = await makeUser('customer');
    const open = await Reservation.create({ listing: listing._id, customer: user._id, quantity: 2, pickupCode: 'FS-3001' });
    const done = await Reservation.create({ listing: listing._id, customer: user._id, quantity: 1, pickupCode: 'FS-3002', status: 'collected' });

    expect(await expireListings()).toEqual({ listings: 1, noShows: 1 });
    expect((await Reservation.findById(open._id)).status).toBe('no-show');
    expect((await Reservation.findById(done._id)).status).toBe('collected');
  });

  test('TC-F1-28 the boundary uses the time passed in (runs are repeatable)', async () => {
    const { restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant); // safeUntil in 120 minutes
    expect((await expireListings(new Date(Date.now() + 60 * 60000))).listings).toBe(0);
    expect((await expireListings(new Date(Date.now() + 121 * 60000))).listings).toBe(1);
    expect((await expireListings(new Date(Date.now() + 121 * 60000))).listings).toBe(0); // nothing left to do
    expect((await SurplusListing.findById(listing._id)).status).toBe('expired');
  });
});
