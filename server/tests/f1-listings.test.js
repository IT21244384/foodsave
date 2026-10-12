// F1 – Restaurant & Surplus Listing Management (Janahan R): FR1.1–FR1.3, FR1.6 search.
const { useDatabase, makeUser, makeRestaurant, makeListing, validListingBody, api, at } = require('./helpers');
const Restaurant = require('../src/models/Restaurant');

useDatabase();

describe('FR1.1 restaurant verification gate', () => {
  test('TC-F1-13 a pending restaurant cannot post listings', async () => {
    const { auth } = await makeRestaurant('pending');
    const res = await api().post('/api/listings').set(auth).send(validListingBody());
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verified by an administrator/);
  });

  test('TC-F1-14 editing a rejected profile sends it back for review', async () => {
    const { auth, restaurant } = await makeRestaurant('rejected');
    const res = await api().put('/api/restaurants/me').set(auth).send({ name: 'Green Leaf Café', address: '12 New Kandy Road, Malabe', area: 'Malabe', phone: '0112345671', businessRegNo: 'PV-10231', lat: 6.9061, lng: 79.9696 });
    expect(res.status).toBe(200);
    expect((await Restaurant.findById(restaurant._id)).status).toBe('pending');
  });
});

describe('FR1.2 create, update and withdraw listings', () => {
  test('TC-F1-15 an approved restaurant can publish a listing', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const res = await api().post('/api/listings').set(auth).send(validListingBody());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ available: 10, status: 'active' });
    expect(res.body.location.coordinates).toEqual(restaurant.location.coordinates);
  });

  test('TC-F1-16 a donation is always stored with price 0', async () => {
    const { auth } = await makeRestaurant();
    const res = await api().post('/api/listings').set(auth).send(validListingBody({ offerType: 'donate', price: 300 }));
    expect(res.status).toBe(201);
    expect(res.body.price).toBe(0);
  });

  test('TC-F1-17 business-rule errors come back per field (FR1.3)', async () => {
    const { auth } = await makeRestaurant();
    const res = await api().post('/api/listings').set(auth).send(validListingBody({ price: 700, hygieneDeclared: false, safeUntil: at(30) }));
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['hygieneDeclared', 'price', 'safeUntil']);
  });

  test('TC-F1-18 missing and wrongly typed fields are rejected', async () => {
    const { auth } = await makeRestaurant();
    const res = await api().post('/api/listings').set(auth).send({ item: '', category: 'Soup', quantity: 0, offerType: 'swap' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(expect.objectContaining({ item: expect.any(String), category: expect.any(String), quantity: expect.any(String), offerType: expect.any(String) }));
  });

  test('TC-F1-19 a restaurant can update its own active listing', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant);
    const res = await api().put(`/api/listings/${listing.id}`).set(auth).send(validListingBody({ quantity: 12, price: 200 }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ quantity: 12, available: 12, price: 200 });
  });

  test('TC-F1-20 quantity cannot drop below packs already reserved', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant, { quantity: 10, available: 4 }); // 6 already reserved
    const res = await api().put(`/api/listings/${listing.id}`).set(auth).send(validListingBody({ quantity: 5 }));
    expect(res.status).toBe(400);
    expect(res.body.fields.quantity).toMatch(/6 packs are already reserved/);
  });

  test('TC-F1-21 a withdrawn listing disappears from public view', async () => {
    const { auth, restaurant } = await makeRestaurant();
    const listing = await makeListing(restaurant);
    expect((await api().post(`/api/listings/${listing.id}/withdraw`).set(auth)).body.status).toBe('withdrawn');
    expect((await api().get(`/api/listings/${listing.id}`)).status).toBe(404);
  });

  test('TC-SEC-09 a restaurant cannot edit another restaurant’s listing', async () => {
    const owner = await makeRestaurant();
    const other = await makeRestaurant('approved', { name: 'Spice Route Kitchen' });
    const listing = await makeListing(owner.restaurant);
    const res = await api().put(`/api/listings/${listing.id}`).set(other.auth).send(validListingBody());
    expect(res.status).toBe(404);
    expect((await api().post(`/api/listings/${listing.id}/withdraw`).set(other.auth)).status).toBe(404);
  });

  test('TC-SEC-10 customers cannot create listings', async () => {
    const { auth } = await makeUser('customer');
    expect((await api().post('/api/listings').set(auth).send(validListingBody())).status).toBe(403);
  });
});

describe('FR1.6 search own listings', () => {
  test('TC-F1-22 keyword and status filters work', async () => {
    const { auth, restaurant } = await makeRestaurant();
    await makeListing(restaurant, { item: 'Vegetable fried rice' });
    await makeListing(restaurant, { item: 'Chicken kottu', status: 'expired' });
    await makeListing(restaurant, { item: 'Fried noodles' });
    const byWord = await api().get('/api/listings/mine?q=fried').set(auth);
    expect(byWord.body.map((l) => l.item).sort()).toEqual(['Fried noodles', 'Vegetable fried rice']);
    const expired = await api().get('/api/listings/mine?status=expired').set(auth);
    expect(expired.body.map((l) => l.item)).toEqual(['Chicken kottu']);
  });

  test('TC-SEC-11 regex characters in the search box are treated as text', async () => {
    const { auth, restaurant } = await makeRestaurant();
    await makeListing(restaurant);
    const res = await api().get('/api/listings/mine?q=.*').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('TC-F1-23 a restaurant only sees its own listings', async () => {
    const a = await makeRestaurant();
    const b = await makeRestaurant('approved', { name: 'Bake House' });
    await makeListing(a.restaurant);
    await makeListing(b.restaurant, { item: 'Bread loaves' });
    const res = await api().get('/api/listings/mine').set(a.auth);
    expect(res.body.map((l) => l.item)).toEqual(['Vegetable fried rice']);
  });
});
