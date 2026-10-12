// Demo data for development, demos and manual testing. All names are fictional sample data.
// Every demo account uses the password in DEMO_PASSWORD (also listed in README.md).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('../config');
const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const Charity = require('../models/Charity');
const SurplusListing = require('../models/SurplusListing');
const Reservation = require('../models/Reservation');
const DonationClaim = require('../models/DonationClaim');

const DEMO_PASSWORD = 'Demo@1234';
const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });
const at = (minutesFromNow) => new Date(Date.now() + minutesFromNow * 60000);

// A tiny valid PDF used as the "registration certificate" for seeded charities.
const PLACEHOLDER_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
  '4 0 obj<</Length 66>>stream\nBT /F1 14 Tf 20 60 Td (Sample registration certificate) Tj ET\nendstream endobj\n' +
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
);

const RESTAURANTS = [
  { key: 'greenleaf', owner: ['Dilan Fernando', 'dilan@greenleaf.lk'], name: 'Green Leaf Café', area: 'Malabe', address: '12 New Kandy Road, Malabe', phone: '0112345671', businessRegNo: 'PV-10231', loc: [6.9061, 79.9696], status: 'approved' },
  { key: 'lanka', owner: ['Ruwan Silva', 'ruwan@lankarice.lk'], name: 'Lanka Rice & Curry', area: 'Malabe', address: '44 Kaduwela Road, Malabe', phone: '0112345672', businessRegNo: 'PV-10544', loc: [6.9118, 79.9663], status: 'approved' },
  { key: 'spice', owner: ['Fathima Rizwan', 'fathima@spiceroute.lk'], name: 'Spice Route Kitchen', area: 'Kaduwela', address: '3 Main Street, Kaduwela', phone: '0112345673', businessRegNo: 'PV-11802', loc: [6.9305, 79.984], status: 'approved' },
  { key: 'bake', owner: ['Kasun Perera', 'kasun@bakehouse.lk'], name: 'Bake House', area: 'Battaramulla', address: '87 Pannipitiya Road, Battaramulla', phone: '0112345674', businessRegNo: 'PV-09977', loc: [6.899, 79.933], status: 'approved' },
  { key: 'seabreeze', owner: ['Anjali Mendis', 'anjali@seabreeze.lk'], name: 'Sea Breeze Hotel', area: 'Kollupitiya', address: '210 Galle Road, Colombo 03', phone: '0112345675', businessRegNo: 'PV-07411', loc: [6.911, 79.851], status: 'approved' },
  { key: 'newtaste', owner: ['Tharindu Jayasuriya', 'tharindu@newtaste.lk'], name: 'New Taste Bistro', area: 'Kaduwela', address: '9 Temple Road, Kaduwela', phone: '0112345676', businessRegNo: 'PV-12950', loc: [6.933, 79.99], status: 'pending' },
];

const CHARITIES = [
  { owner: ['Malini Fernando', 'sahana@charity.lk'], name: 'Sahana Elders’ Home', regNo: 'NGO/WP/1187', area: 'Malabe', address: '5 Hospital Road, Malabe', contactPerson: 'Malini Fernando', phone: '0112456781', loc: [6.908, 79.975], status: 'approved' },
  { owner: ['Suresh Perera', 'littlestars@charity.lk'], name: 'Little Stars Children’s Home', regNo: 'NGO/WP/0954', area: 'Kaduwela', address: '21 Lake Road, Kaduwela', contactPerson: 'Suresh Perera', phone: '0112456782', loc: [6.929, 79.98], status: 'approved' },
  { owner: ['Rohan Jayasinghe', 'hope@charity.lk'], name: 'Hope Community Kitchen', regNo: 'NGO/WP/2213', area: 'Battaramulla', address: '14 Station Road, Battaramulla', contactPerson: 'Rohan Jayasinghe', phone: '0112456783', loc: [6.901, 79.92], status: 'pending' },
  { owner: ['Thanuja Nadarajah', 'myws@charity.lk'], name: 'Malabe Youth Welfare Society', regNo: 'CBO/MAL/077', area: 'Malabe', address: '2 Pittugala Road, Malabe', contactPerson: 'Thanuja Nadarajah', phone: '0112456784', loc: [6.917, 79.96], status: 'pending' },
];

// [restaurantKey, item, category, dietTags, qty, originalPrice, price, offerType, pickupFrom, pickupTo, safeUntil (minutes from now), status]
const LISTINGS = [
  ['greenleaf', 'Vegetable fried rice', 'Cooked', ['Veg'], 10, 650, 250, 'sale', 20, 80, 170, 'active'],
  ['greenleaf', 'Chicken kottu', 'Cooked', ['Non-veg', 'Halal'], 5, 900, 0, 'donate', 20, 110, 199, 'active'],
  ['greenleaf', 'Fish buns (pack of 4)', 'Bakery', ['Non-veg'], 8, 480, 200, 'sale', -10, 50, 140, 'active'],
  ['greenleaf', 'Dhal curry and rice', 'Cooked', ['Veg'], 6, 450, 150, 'sale', -130, -70, -40, 'expired'],
  ['greenleaf', 'Vegetable noodles', 'Cooked', ['Veg'], 12, 600, 220, 'sale', -300, -240, -200, 'withdrawn'],
  ['lanka', 'Rice and curry (veg)', 'Cooked', ['Veg'], 20, 500, 180, 'sale', 20, 80, 140, 'active'],
  ['spice', 'Egg rotti', 'Cooked', ['Non-veg'], 6, 300, 120, 'sale', 5, 35, 80, 'active'],
  ['spice', 'Chicken biryani', 'Cooked', ['Non-veg', 'Halal'], 12, 900, 350, 'sale', 50, 110, 199, 'active'],
  ['bake', 'Assorted pastries box', 'Bakery', ['Veg', 'Contains nuts'], 15, 1200, 0, 'donate', 5, 65, 199, 'active'],
  ['bake', 'Bread loaves (sealed)', 'Packaged', ['Veg'], 10, 220, 90, 'sale', 5, 50, 900, 'active'],
  ['seabreeze', 'Buffet mixed rice', 'Cooked', ['Non-veg'], 30, 1500, 0, 'donate', 80, 140, 199, 'active'],
];

async function seed() {
  await Promise.all([User, Restaurant, Charity, SurplusListing, Reservation, DonationClaim].map((M) => M.deleteMany({})));
  await Promise.all([Restaurant, Charity, SurplusListing].map((M) => M.syncIndexes()));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const admin = await User.create({ name: 'FoodSave Admin', email: 'admin@foodsave.lk', role: 'admin', passwordHash });
  await User.create({ name: 'Nimal Perera', email: 'nimal@example.com', role: 'customer', phone: '0771234567', passwordHash });
  await User.create({ name: 'Ayesha Rahman', email: 'ayesha@example.com', role: 'customer', phone: '0771234568', passwordHash });

  const restaurants = {};
  for (const r of RESTAURANTS) {
    const owner = await User.create({ name: r.owner[0], email: r.owner[1], role: 'restaurant', passwordHash });
    const reviewed = r.status === 'approved' ? { reviewedBy: admin._id, reviewedAt: new Date() } : {};
    restaurants[r.key] = await Restaurant.create({ owner: owner._id, name: r.name, area: r.area, address: r.address, phone: r.phone, businessRegNo: r.businessRegNo, location: point(...r.loc), status: r.status, ...reviewed });
  }

  fs.mkdirSync(config.uploadDir, { recursive: true });
  for (const c of CHARITIES) {
    const owner = await User.create({ name: c.owner[0], email: c.owner[1], role: 'charity', phone: c.phone, passwordHash });
    const storedName = `seed-${c.regNo.replace(/\W/g, '-')}.pdf`;
    fs.writeFileSync(path.join(config.uploadDir, storedName), PLACEHOLDER_PDF);
    const reviewed = c.status === 'approved' ? { reviewedBy: admin._id, reviewedAt: new Date() } : {};
    await Charity.create({
      owner: owner._id, name: c.name, regNo: c.regNo, area: c.area, address: c.address, contactPerson: c.contactPerson, phone: c.phone,
      location: point(...c.loc), status: c.status, ...reviewed,
      document: { originalName: 'registration-certificate.pdf', storedName, mimeType: 'application/pdf', size: PLACEHOLDER_PDF.length },
    });
  }

  const listings = {};
  for (const [key, item, category, dietTags, qty, originalPrice, price, offerType, from, to, safe, status] of LISTINGS) {
    const r = restaurants[key];
    listings[item] = await SurplusListing.create({
      restaurant: r._id, location: r.location, item, category, dietTags, quantity: qty, available: qty, originalPrice, price, offerType,
      pickupFrom: at(from), pickupTo: at(to), safeUntil: at(safe), hygieneDeclared: true, status,
    });
  }

  // A few existing reservations (FR2.3); available stock is reduced to match.
  const customers = Object.fromEntries((await User.find({ role: 'customer' })).map((u) => [u.email, u]));
  for (const [item, email, quantity, pickupCode] of [
    ['Vegetable fried rice', 'nimal@example.com', 2, 'FS-4821'],
    ['Egg rotti', 'ayesha@example.com', 2, 'FS-3307'],
    ['Egg rotti', 'nimal@example.com', 1, 'FS-3310'],
    ['Fish buns (pack of 4)', 'ayesha@example.com', 2, 'FS-2290'],
  ]) {
    const listing = listings[item];
    await Reservation.create({ listing: listing._id, customer: customers[email]._id, quantity, pickupCode });
    await SurplusListing.updateOne({ _id: listing._id }, { $inc: { available: -quantity } });
  }
}

module.exports = { seed, DEMO_PASSWORD };

// `npm run seed` loads demo data into the database in MONGODB_URI.
if (require.main === module) {
  const { connect, disconnect } = require('../db');
  (async () => {
    if (!config.mongoUri) throw new Error('Set MONGODB_URI in server/.env first (npm run dev uses an in-memory database and seeds itself).');
    await connect(config.mongoUri);
    await seed();
    console.log('Demo data loaded.');
    await disconnect();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
