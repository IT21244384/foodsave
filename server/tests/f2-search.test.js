// F2 – FR2.2 "near me" search (Abisheak S).
const { useDatabase, makeRestaurant, makeListing, api, at, MALABE } = require('./helpers');

useDatabase();

const search = (params) => api().get('/api/listings/nearby').query({ lat: MALABE.lat, lng: MALABE.lng, ...params });

describe('FR2.2 near-me search', () => {
  let near; let far;
  beforeEach(async () => {
    near = await makeRestaurant('approved', { lat: 6.9061, lng: 79.9696, name: 'Green Leaf Café' }); // ~1 km away
    far = await makeRestaurant('approved', { lat: 6.911, lng: 79.851, name: 'Sea Breeze Hotel' }); // ~13 km away
  });

  test('TC-F2-01 only listings inside the radius are returned, with distance', async () => {
    await makeListing(near.restaurant, { item: 'Vegetable fried rice' });
    await makeListing(far.restaurant, { item: 'Buffet mixed rice' });
    const res = await search({ km: 5 });
    expect(res.status).toBe(200);
    expect(res.body.map((l) => l.item)).toEqual(['Vegetable fried rice']);
    expect(res.body[0].distanceKm).toBeGreaterThan(0.5);
    expect(res.body[0].distanceKm).toBeLessThan(2);
    expect(res.body[0].restaurant.name).toBe('Green Leaf Café');
    expect((await search({ km: 20 })).body).toHaveLength(2);
  });

  test('TC-F2-02 results are sorted by least safe time left', async () => {
    await makeListing(near.restaurant, { item: 'Later', safeUntil: at(200) });
    await makeListing(near.restaurant, { item: 'Soonest', safeUntil: at(70) });
    await makeListing(near.restaurant, { item: 'Middle', safeUntil: at(120) });
    expect((await search()).body.map((l) => l.item)).toEqual(['Soonest', 'Middle', 'Later']);
  });

  test('TC-F2-03 expired, withdrawn and fully reserved listings never appear', async () => {
    await makeListing(near.restaurant, { item: 'Visible' });
    await makeListing(near.restaurant, { item: 'Past safe time', pickupFrom: at(-90), pickupTo: at(-30), safeUntil: at(-1) });
    await makeListing(near.restaurant, { item: 'Withdrawn', status: 'withdrawn' });
    await makeListing(near.restaurant, { item: 'Sold out', available: 0 });
    expect((await search()).body.map((l) => l.item)).toEqual(['Visible']);
  });

  test('TC-F2-04 food type, offer type and maximum price filters', async () => {
    await makeListing(near.restaurant, { item: 'Veg rice', dietTags: ['Veg'], price: 180 });
    await makeListing(near.restaurant, { item: 'Biryani', dietTags: ['Non-veg', 'Halal'], price: 350, originalPrice: 900 });
    await makeListing(near.restaurant, { item: 'Kottu (donation)', dietTags: ['Halal'], offerType: 'donate', price: 0 });
    expect((await search({ diet: 'Halal' })).body.map((l) => l.item).sort()).toEqual(['Biryani', 'Kottu (donation)']);
    expect((await search({ offer: 'donate' })).body.map((l) => l.item)).toEqual(['Kottu (donation)']);
    expect((await search({ maxPrice: 200, offer: 'sale' })).body.map((l) => l.item)).toEqual(['Veg rice']);
  });

  test('TC-F2-05 "time left" filter hides food that is about to expire', async () => {
    await makeListing(near.restaurant, { item: 'Short', pickupTo: at(30), safeUntil: at(45) });
    await makeListing(near.restaurant, { item: 'Long', safeUntil: at(180) });
    expect((await search({ minLeft: 60 })).body.map((l) => l.item)).toEqual(['Long']);
  });

  test('TC-F2-06 invalid coordinates and filters are rejected with messages', async () => {
    const res = await api().get('/api/listings/nearby').query({ lat: 200, lng: 'abc', km: 100, diet: 'Pizza' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['diet', 'km', 'lat', 'lng']);
  });

  test('TC-SEC-12 operator injection in query parameters is rejected', async () => {
    const res = await api().get('/api/listings/nearby?lat=6.9&lng=79.9&diet[$ne]=Veg');
    expect(res.status).toBe(400);
  });
});
