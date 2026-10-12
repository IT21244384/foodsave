const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { connect, disconnect } = require('../src/db');
const { createApp } = require('../src/app');
const { signToken } = require('../src/middleware/auth');
const User = require('../src/models/User');
const Restaurant = require('../src/models/Restaurant');
const Charity = require('../src/models/Charity');
const SurplusListing = require('../src/models/SurplusListing');

const MALABE = { lat: 6.9147, lng: 79.9729 };
const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
const at = (min) => new Date(Date.now() + min * 60000).toISOString();

function useDatabase() {
  beforeAll(async () => {
    await connect('');
    await Promise.all([Restaurant, Charity, SurplusListing].map((M) => M.syncIndexes()));
  });
  afterEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });
  afterAll(disconnect);
}

let n = 0;
async function makeUser(role, extra = {}) {
  n += 1;
  const user = await User.create({ name: `Test ${role} ${n}`, email: `${role}${n}@test.lk`, role, passwordHash: await bcrypt.hash('Passw0rd!', 4), ...extra });
  return { user, token: signToken(user), auth: { Authorization: `Bearer ${signToken(user)}` } };
}

async function makeRestaurant(status = 'approved', { lat = 6.9061, lng = 79.9696, name = 'Green Leaf Café' } = {}) {
  const owner = await makeUser('restaurant');
  const restaurant = await Restaurant.create({ owner: owner.user._id, name, address: '12 New Kandy Road, Malabe', area: 'Malabe', phone: '0112345671', businessRegNo: `PV-${n}`, location: point(lat, lng), status });
  return { ...owner, restaurant };
}

async function makeListing(restaurant, overrides = {}) {
  return SurplusListing.create({
    restaurant: restaurant._id, location: restaurant.location, item: 'Vegetable fried rice', category: 'Cooked', dietTags: ['Veg'],
    quantity: 10, available: 10, originalPrice: 650, price: 250, offerType: 'sale',
    pickupFrom: at(10), pickupTo: at(60), safeUntil: at(120), hygieneDeclared: true, status: 'active', ...overrides,
  });
}

const validListingBody = (overrides = {}) => ({
  item: 'Vegetable fried rice', category: 'Cooked', dietTags: ['Veg'], quantity: 10, originalPrice: 650, price: 250,
  offerType: 'sale', pickupFrom: at(10), pickupTo: at(60), safeUntil: at(120), hygieneDeclared: true, ...overrides,
});

const api = (opts) => request(createApp(opts));

module.exports = { useDatabase, makeUser, makeRestaurant, makeListing, validListingBody, api, at, point, MALABE };
