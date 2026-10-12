// F2 – FR2.1 charity registration and admin verification (Abisheak S).
const fs = require('fs');
const path = require('path');
const { useDatabase, makeUser, api } = require('./helpers');
const Charity = require('../src/models/Charity');
const config = require('../src/config');

useDatabase();

const PDF = Buffer.from('%PDF-1.4\n%test certificate\n%%EOF\n');
const fields = {
  name: 'Malini Fernando', email: 'sahana@charity.lk', password: 'Sahana123', orgName: 'Sahana Elders’ Home', regNo: 'ngo/wp/1187',
  address: '5 Hospital Road, Malabe', area: 'Malabe', contactPerson: 'Malini Fernando', phone: '0112456781', lat: '6.908', lng: '79.975',
};

function registerCharity(overrides = {}, file = { buf: PDF, name: 'certificate.pdf', type: 'application/pdf' }) {
  const req = api().post('/api/charities/register');
  Object.entries({ ...fields, ...overrides }).forEach(([k, v]) => req.field(k, v));
  if (file) req.attach('document', file.buf, { filename: file.name, contentType: file.type });
  return req;
}

describe('FR2.1 charity registration', () => {
  test('TC-F2-07 a charity registers with its certificate and is pending', async () => {
    const res = await registerCharity();
    expect(res.status).toBe(201);
    expect(res.body.profile).toMatchObject({ status: 'pending', regNo: 'NGO/WP/1187' });
    expect(res.body.profile.document.storedName).toBeUndefined(); // internal file name is not exposed
    const saved = await Charity.findOne({ regNo: 'NGO/WP/1187' });
    expect(fs.existsSync(path.join(config.uploadDir, saved.document.storedName))).toBe(true);
  });

  test('TC-F2-08 the certificate is required', async () => {
    const res = await registerCharity({}, null);
    expect(res.status).toBe(400);
    expect(res.body.fields.document).toMatch(/registration certificate/);
  });

  test('TC-SEC-13 only PDF, JPG or PNG files are accepted', async () => {
    const res = await registerCharity({}, { buf: Buffer.from('MZ fake program'), name: 'certificate.exe', type: 'application/x-msdownload' });
    expect(res.status).toBe(400);
    expect(res.body.fields.document).toMatch(/PDF, JPG or PNG/);
  });

  test('TC-SEC-14 files over 5 MB are rejected', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 0x20);
    const res = await registerCharity({}, { buf: big, name: 'big.pdf', type: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 MB/);
  });

  test('TC-F2-09 a registration number can only be used once', async () => {
    await registerCharity();
    const res = await registerCharity({ email: 'other@charity.lk', regNo: 'NGO/WP/1187' });
    expect(res.status).toBe(409);
  });

  test('TC-F2-10 invalid fields are reported and the upload is discarded', async () => {
    const before = fs.existsSync(config.uploadDir) ? fs.readdirSync(config.uploadDir).length : 0;
    const res = await registerCharity({ phone: '12', lat: 'north' });
    expect(res.status).toBe(400);
    expect(res.body.fields).toEqual(expect.objectContaining({ phone: expect.any(String), lat: expect.any(String) }));
    await new Promise((r) => setTimeout(r, 50));
    expect(fs.readdirSync(config.uploadDir).length).toBe(before);
  });
});

describe('FR2.1 admin verification', () => {
  let charityId; let charityAuth;
  beforeEach(async () => {
    const res = await registerCharity();
    charityId = res.body.profile.id;
    charityAuth = { Authorization: `Bearer ${res.body.token}` };
  });

  test('TC-F2-11 an admin sees pending charities and approves one', async () => {
    const { auth } = await makeUser('admin');
    const list = await api().get('/api/admin/charities?status=pending').set(auth);
    expect(list.body.map((c) => c.name)).toEqual(['Sahana Elders’ Home']);
    const res = await api().patch(`/api/admin/charities/${charityId}/review`).set(auth).send({ decision: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect((await api().get('/api/charities/me').set(charityAuth)).body.status).toBe('approved');
  });

  test('TC-F2-12 rejecting needs a reason, which the charity can see', async () => {
    const { auth } = await makeUser('admin');
    expect((await api().patch(`/api/admin/charities/${charityId}/review`).set(auth).send({ decision: 'rejected' })).status).toBe(400);
    const res = await api().patch(`/api/admin/charities/${charityId}/review`).set(auth).send({ decision: 'rejected', reason: 'Certificate is unreadable.' });
    expect(res.body).toMatchObject({ status: 'rejected', rejectionReason: 'Certificate is unreadable.' });
  });

  test('TC-SEC-15 only admins can download a certificate', async () => {
    const { auth } = await makeUser('admin');
    const ok = await api().get(`/api/admin/charities/${charityId}/document`).set(auth);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/application\/pdf/);
    expect((await api().get(`/api/admin/charities/${charityId}/document`).set(charityAuth)).status).toBe(403);
    expect((await api().get(`/api/admin/charities/${charityId}/document`)).status).toBe(401);
  });

  test('TC-SEC-16 a charity cannot approve itself', async () => {
    const res = await api().patch(`/api/admin/charities/${charityId}/review`).set(charityAuth).send({ decision: 'approved' });
    expect(res.status).toBe(403);
  });
});
