// Measures the performance targets in the requirements: search under 2 seconds with 1,000 active
// listings, and no overselling under concurrent requests. Run: npm run perf --prefix server
process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { connect, disconnect } = require('../../src/db');
const { createApp } = require('../../src/app');
const { signToken } = require('../../src/middleware/auth');
const User = require('../../src/models/User');
const Restaurant = require('../../src/models/Restaurant');
const SurplusListing = require('../../src/models/SurplusListing');

const LISTINGS = 1000;
const at = (min) => new Date(Date.now() + min * 60000);
const stats = (ms) => {
  const s = [...ms].sort((a, b) => a - b);
  const pick = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10;
  return { requests: s.length, p50: pick(0.5), p95: pick(0.95), max: pick(1) };
};

async function timed(fn) {
  const t = performance.now();
  const res = await fn();
  return { ms: performance.now() - t, res };
}

async function main() {
  await connect('');
  await Promise.all([Restaurant, SurplusListing].map((M) => M.syncIndexes()));
  const owner = await User.create({ name: 'Perf Owner', email: 'perf@test.lk', role: 'restaurant', passwordHash: await bcrypt.hash('Passw0rd!', 4) });
  const restaurant = await Restaurant.create({ owner: owner._id, name: 'Perf Café', address: '1 Perf Road', area: 'Malabe', phone: '0112345671', businessRegNo: 'PV-1', location: { type: 'Point', coordinates: [79.9696, 6.9061] }, status: 'approved' });
  // Spread the listings over roughly 20 km around Malabe.
  await SurplusListing.insertMany(Array.from({ length: LISTINGS }, (_, i) => ({
    restaurant: restaurant._id, item: `Listing ${i}`, category: 'Cooked', dietTags: i % 2 ? ['Veg'] : ['Non-veg'], quantity: 10, available: 10, originalPrice: 500, price: 200,
    offerType: i % 5 ? 'sale' : 'donate', pickupFrom: at(10), pickupTo: at(60), safeUntil: at(120 + (i % 200)), hygieneDeclared: true, status: 'active',
    location: { type: 'Point', coordinates: [79.9696 + (((i * 37) % 200) - 100) / 1000, 6.9061 + (((i * 53) % 200) - 100) / 1000] },
  })));

  const server = await new Promise((resolve) => { const s = createApp({ loginLimit: 100000 }).listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const nearby = (q) => () => fetch(`${base}/listings/nearby?lat=6.9147&lng=79.9729&${q}`).then((r) => r.json());
  const run = async (fn, n, parallel = 1) => {
    const ms = [];
    for (let i = 0; i < n; i += parallel) {
      const batch = await Promise.all(Array.from({ length: parallel }, () => timed(fn)));
      batch.forEach((b) => ms.push(b.ms));
    }
    return ms;
  };

  await run(nearby('km=10'), 10); // warm up
  const sequential = stats(await run(nearby('km=10'), 200));
  const parallel = stats(await run(nearby('km=10&diet=Veg&maxPrice=300'), 200, 20));

  // 50 customers reserving 10 packs at once, repeated to show the result is stable.
  const customers = await Promise.all(Array.from({ length: 50 }, async (_, i) => signToken(await User.create({ name: `C${i}`, email: `c${i}@test.lk`, role: 'customer', passwordHash: 'x'.repeat(60) }))));
  const rounds = [];
  for (let r = 0; r < 5; r += 1) {
    const l = await SurplusListing.create({ restaurant: restaurant._id, item: `Race ${r}`, category: 'Cooked', quantity: 10, available: 10, originalPrice: 500, price: 200, offerType: 'sale', pickupFrom: at(10), pickupTo: at(60), safeUntil: at(120), hygieneDeclared: true, location: restaurant.location });
    const t = performance.now();
    const codes = await Promise.all(customers.map((token) => fetch(`${base}/listings/${l.id}/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{"quantity":1}' }).then((x) => x.status)));
    const left = (await SurplusListing.findById(l.id)).available;
    rounds.push({ ok: codes.filter((c) => c === 201).length, refused: codes.filter((c) => c === 409).length, left, ms: Math.round(performance.now() - t) });
  }

  const out = { when: new Date().toISOString(), node: process.version, activeListings: LISTINGS, resultsPerSearch: (await nearby('km=10')()).length, searchSequentialMs: sequential, searchParallel20Ms: parallel, stockLockRounds: rounds };
  const dir = path.join(__dirname, '..', '..', '..', 'docs', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'performance.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  server.close();
  await disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
