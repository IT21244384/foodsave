// Shared: registration, sign-in and role-based access, including basic security tests.
const jwt = require('jsonwebtoken');
const { useDatabase, makeUser, api } = require('./helpers');

useDatabase();

const restaurantBody = {
  role: 'restaurant', name: 'Dilan Fernando', email: 'dilan@greenleaf.lk', password: 'Greenleaf1',
  restaurant: { name: 'Green Leaf Café', address: '12 New Kandy Road, Malabe', area: 'Malabe', phone: '0112345671', businessRegNo: 'PV-10231', lat: 6.9061, lng: 79.9696 },
};

describe('Registration', () => {
  test('TC-AU-01 a customer can register and receives a token', async () => {
    const res = await api().post('/api/auth/register').send({ role: 'customer', name: 'Nimal Perera', email: 'Nimal@Example.com', password: 'Nimal1234' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('nimal@example.com'); // stored lower-case
  });

  test('TC-AU-02 a restaurant registers with a pending profile (FR1.1)', async () => {
    const res = await api().post('/api/auth/register').send(restaurantBody);
    expect(res.status).toBe(201);
    expect(res.body.profile.status).toBe('pending');
    expect(res.body.profile.location.coordinates).toEqual([79.9696, 6.9061]);
  });

  test('TC-AU-03 weak passwords and bad emails get field-level messages', async () => {
    const res = await api().post('/api/auth/register').send({ role: 'customer', name: 'N', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toHaveProperty('email');
    expect(res.body.fields).toHaveProperty('password');
    expect(res.body.fields).toHaveProperty('name');
  });

  test('TC-AU-04 a duplicate email is rejected with 409', async () => {
    await api().post('/api/auth/register').send(restaurantBody);
    const res = await api().post('/api/auth/register').send({ ...restaurantBody, email: 'DILAN@greenleaf.lk' });
    expect(res.status).toBe(409);
    expect(res.body.fields.email).toMatch(/already exists/);
  });

  test('TC-AU-05 nobody can self-register as an administrator', async () => {
    const res = await api().post('/api/auth/register').send({ role: 'admin', name: 'Evil', email: 'evil@x.lk', password: 'Passw0rd1' });
    expect(res.status).toBe(400);
  });
});

describe('Sign-in', () => {
  beforeEach(async () => {
    await api().post('/api/auth/register').send({ role: 'customer', name: 'Nimal Perera', email: 'nimal@example.com', password: 'Nimal1234' });
  });

  test('TC-AU-06 correct credentials sign in', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'nimal@example.com', password: 'Nimal1234' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('customer');
  });

  test('TC-SEC-01 the password hash is never returned', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'nimal@example.com', password: 'Nimal1234' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  test('TC-SEC-02 wrong password and unknown email give the same message', async () => {
    const a = await api().post('/api/auth/login').send({ email: 'nimal@example.com', password: 'Wrong1234' });
    const b = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Wrong1234' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  test('TC-SEC-03 NoSQL injection in the login form is rejected', async () => {
    const res = await api().post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  test('TC-SEC-04 repeated sign-in attempts are rate limited', async () => {
    const app = api({ loginLimit: 3 });
    for (let i = 0; i < 3; i += 1) await app.post('/api/auth/login').send({ email: 'nimal@example.com', password: 'Wrong1234' });
    const res = await app.post('/api/auth/login').send({ email: 'nimal@example.com', password: 'Nimal1234' });
    expect(res.status).toBe(429);
  });
});

describe('Tokens and roles', () => {
  test('TC-SEC-05 protected routes need a token', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401);
  });

  test('TC-SEC-06 a forged token (wrong secret) is rejected', async () => {
    const forged = jwt.sign({ sub: '64b000000000000000000000', role: 'admin' }, 'not-the-secret');
    const res = await api().get('/api/admin/summary').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test('TC-SEC-07 a token with alg "none" is rejected', async () => {
    const unsigned = jwt.sign({ sub: '64b000000000000000000000', role: 'admin' }, '', { algorithm: 'none' });
    expect((await api().get('/api/admin/summary').set('Authorization', `Bearer ${unsigned}`)).status).toBe(401);
  });

  test('TC-SEC-08 a customer cannot open admin routes', async () => {
    const { auth } = await makeUser('customer');
    expect((await api().get('/api/admin/summary').set(auth)).status).toBe(403);
  });

  test('TC-SEC-17 security headers are set, and map tiles are allowed', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/img-src[^;]*tile\.openstreetmap\.org/);
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin'); // OSM requires a Referer
  });

  test('TC-AU-07 /me returns the signed-in user', async () => {
    const { auth, user } = await makeUser('customer');
    const res = await api().get('/api/auth/me').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(String(user._id));
  });
});
