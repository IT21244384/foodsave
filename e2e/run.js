// End-to-end system tests in a real browser (headless Microsoft Edge or Chrome), plus an automated
// accessibility scan with axe-core. Starts its own server with fresh demo data.
//   npm run e2e
// Results go to docs/evidence/e2e-results.json and screenshots to docs/screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const PORT = 4100;
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(ROOT, 'docs', 'screenshots');
const EVIDENCE = path.join(ROOT, 'docs', 'evidence');
const PASSWORD = 'Demo@1234';
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BROWSERS = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const results = [];
const accessibility = [];
const consoleErrors = [];
let page;
let browser;

async function test(id, name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ id, name, status: 'pass', ms: Date.now() - started });
    console.log(`  PASS ${id} ${name}`);
  } catch (err) {
    results.push({ id, name, status: 'fail', ms: Date.now() - started, error: err.message });
    console.log(`  FAIL ${id} ${name}\n       ${err.message}`);
    await page.screenshot({ path: path.join(EVIDENCE, `fail-${id}.png`) }).catch(() => {});
  }
}

const expect = (ok, message) => { if (!ok) throw new Error(message); };
const go = (route) => page.goto(BASE + route, { waitUntil: 'networkidle2' });
const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const text = () => page.evaluate(() => document.body.innerText);

async function waitText(wanted, timeout = 8000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, wanted)
    .catch(() => { throw new Error(`Did not see "${wanted}" on ${page.url()}`); });
}

async function fill(label, value) {
  const ok = await page.evaluate((lab, val) => {
    const l = [...document.querySelectorAll('label.f')].find((x) => x.textContent.trim() === lab);
    const el = l && document.getElementById(l.htmlFor);
    if (!el) return false;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, val);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    return true;
  }, label, String(value));
  expect(ok, `No field labelled "${label}"`);
}

async function click(wanted, selector = 'button, a') {
  const ok = await page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled);
    if (!el) return false;
    el.click();
    return true;
  }, wanted, selector);
  expect(ok, `No clickable "${wanted}" on ${page.url()}`);
}

async function login(email) {
  await page.evaluate(() => localStorage.clear());
  await go('/login');
  await fill('Email', email);
  await fill('Password', PASSWORD);
  await click('Sign in', 'button');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 8000 });
  await page.waitForNetworkIdle({ idleTime: 300 }).catch(() => {});
}

// Runs axe-core against the WCAG 2.1 A and AA rules and records the result.
async function scan(name) {
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
    return { violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') })), passes: res.passes.length };
  });
  accessibility.push({ page: name, ...r });
}

async function noSideScroll(route, name) {
  await go(route);
  const { w, widest } = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    widest: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > 361 && !e.closest('.table-wrap, .leaflet-container')).map((e) => `${e.tagName}.${e.className}`).slice(0, 4).join(', '),
  }));
  expect(w <= 360, `${name} is ${w}px wide on a 360px screen (${widest})`);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const executablePath = BROWSERS.find((b) => fs.existsSync(b));
  if (!executablePath) throw new Error('No browser found. Set BROWSER_PATH to Edge or Chrome.');

  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodsave-e2e-'));
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, PORT, MONGODB_URI: '', LOGIN_RATE_LIMIT: '1000', UPLOAD_DIR: uploadDir, NODE_ENV: 'test' },
    stdio: process.env.E2E_DEBUG ? 'inherit' : 'ignore',
  });
  try {
    for (let i = 0; ; i += 1) {
      const up = await fetch(`${BASE}/api/health`).then((r) => r.ok).catch((e) => { if (process.env.E2E_DEBUG && i % 20 === 0) console.log(e.cause || e); return false; });
      if (up) break;
      if (i > 240) throw new Error('The server did not start.');
      await sleep(500);
    }

    browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
    page = await browser.newPage();
    page.on('dialog', (d) => d.accept());
    page.on('console', (m) => { if (m.type() === 'error' && !/tile\.openstreetmap|status of 4\d\d/.test(m.text())) consoleErrors.push(m.text()); });
    await go('/');
    await shot('01-home');
    await scan('Home and sign in');

    console.log('Sale journey');
    let reservationCode;
    await test('TC-E2E-01', 'A wrong password shows a clear message', async () => {
      await go('/login');
      await fill('Email', 'nimal@example.com');
      await fill('Password', 'wrong-password');
      await click('Sign in', 'button');
      await waitText('Incorrect email or password');
    });
    await test('TC-E2E-02', 'A customer finds surplus on the map and in the list', async () => {
      await login('nimal@example.com');
      await go('/find');
      await waitText('offers found near');
      await page.waitForSelector('.leaflet-container');
      await sleep(1500);
      await shot('02-find-surplus');
      await scan('Find surplus');
      await fill('Food type', 'Veg');
      await waitText('Rice and curry (veg)');
      await fill('Food type', '');
      await waitText('Chicken biryani');
    });
    await test('TC-E2E-03', 'A customer reserves packs and receives a pickup code', async () => {
      await click('Chicken biryani', 'a.lc');
      await waitText('Reserve and get pickup code');
      await shot('03-listing-detail');
      await scan('Listing detail');
      await click('Reserve and get pickup code', 'button');
      await waitText('Reserved ✓');
      reservationCode = await page.$eval('.code', (el) => el.textContent.trim());
      expect(/^FS-\d{4}$/.test(reservationCode), `Bad code ${reservationCode}`);
      await shot('04-reservation-code');
      await scan('My reservations');
    });
    await test('TC-E2E-04', 'A wrong pickup code is rejected at hand-over', async () => {
      await login('fathima@spiceroute.lk');
      await go('/restaurant/handover');
      await fill('Pickup code', 'FS-0000');
      await click('Confirm collection', 'button');
      await waitText('does not match');
      await fill('Pickup code', 'nonsense');
      await click('Confirm collection', 'button');
      await waitText('Enter a code like');
      await shot('05-handover-error');
    });
    await test('TC-E2E-05', 'The right code confirms collection and appears in the customer history', async () => {
      await fill('Pickup code', reservationCode);
      await click('Confirm collection', 'button');
      await waitText(`${reservationCode} confirmed`);
      await waitText('Recent history');
      await shot('06-handover-success');
      await scan('Hand-over');
      await login('nimal@example.com');
      await go('/reservations');
      await waitText('Collected');
    });

    console.log('Restaurant journey');
    await test('TC-E2E-06', 'Invalid listing input shows field messages and saves nothing', async () => {
      await login('dilan@greenleaf.lk');
      await shot('07-restaurant-dashboard');
      await scan('Restaurant dashboard');
      await go('/restaurant/new');
      await fill('Item name', 'E2E test curry');
      await fill('Original price (Rs)', '300');
      await fill('Discounted price (Rs)', '400');
      await click('Publish listing', 'button');
      await waitText('Discounted price must be lower');
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot('08-post-validation');
      await scan('Post surplus');
    });
    await test('TC-E2E-07', 'A valid listing is published and customers can find it', async () => {
      await fill('Discounted price (Rs)', '120');
      await page.evaluate(() => { const c = [...document.querySelectorAll('label.check input')][0]; if (!c.checked) c.click(); });
      await click('Publish listing', 'button');
      await waitText('E2E test curry');
      await shot('09-my-listings');
      await scan('My listings');
      const found = await page.evaluate(async () => (await fetch('/api/listings/nearby?lat=6.9147&lng=79.9729&km=10')).json());
      expect(found.some((l) => l.item === 'E2E test curry'), 'New listing not in search');
    });
    await test('TC-E2E-08', 'The monthly report shows figures and charts', async () => {
      await go('/restaurant/reports');
      await fill('Month', await page.evaluate(() => { const d = new Date(); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }));
      await waitText('Meals saved by week');
      await page.waitForSelector('.bar');
      await shot('10-monthly-report');
      await scan('Monthly report');
    });

    console.log('Donation journey');
    let claimCode;
    await test('TC-E2E-09', 'A pending charity can browse but is not offered a claim', async () => {
      await login('hope@charity.lk');
      await shot('11-charity-pending');
      await go('/charity/donations');
      await waitText('You can browse, but not claim yet');
    });
    await test('TC-E2E-10', 'An approved charity claims a donation and receives a code', async () => {
      await login('sahana@charity.lk');
      await shot('12-charity-overview');
      await scan('Charity overview');
      await go('/charity/donations');
      await waitText('Donations near you');
      await waitText('Chicken kottu');
      await sleep(1000);
      await shot('13-charity-donations');
      await click('Chicken kottu', 'a.lc');
      await waitText('Claim and get pickup code');
      await shot('14-claim-detail');
      await click('Claim and get pickup code', 'button');
      await waitText('Claimed ✓');
      claimCode = await page.$eval('.code', (el) => el.textContent.trim());
      expect(/^DN-\d{4}$/.test(claimCode), `Bad code ${claimCode}`);
      await shot('15-claim-history');
      await scan('Claim history');
    });
    await test('TC-E2E-11', 'The restaurant hands the claim over with its DN code', async () => {
      await login('dilan@greenleaf.lk');
      await go('/restaurant/handover');
      await waitText(claimCode);
      await fill('Pickup code', claimCode);
      await click('Confirm collection', 'button');
      await waitText('Donation, nothing to pay');
    });

    console.log('Administrator journey');
    await test('TC-E2E-12', 'The administrator approves a charity and the charity is told', async () => {
      await login('admin@foodsave.lk');
      await waitText('Hope Community Kitchen');
      await shot('16-admin-verification');
      await scan('Verification');
      await page.evaluate(() => {
        const row = [...document.querySelectorAll('tr')].find((r) => r.innerText.includes('Hope Community Kitchen'));
        [...row.querySelectorAll('button')].find((b) => b.textContent === 'Approve').click();
      });
      await waitText('Hope Community Kitchen was approved');
      await login('hope@charity.lk');
      await waitText('Verified charity');
      await go('/notifications');
      await waitText('Your FoodSave registration was approved');
      await shot('17-notifications');
      await scan('Notifications');
    });
    await test('TC-E2E-13', 'The impact dashboard shows totals and the PDF downloads', async () => {
      await login('admin@foodsave.lk');
      await go('/admin/impact');
      await fill('Month', await page.evaluate(() => { const d = new Date(); d.setDate(0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }));
      await waitText('Top restaurants');
      await page.waitForSelector('.bar');
      await shot('18-impact-dashboard');
      await scan('Impact dashboard');
      const pdf = await page.evaluate(async () => {
        const res = await fetch('/api/admin/impact/report.pdf', { headers: { Authorization: `Bearer ${localStorage.getItem('foodsave.token')}` } });
        const buf = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, head: String.fromCharCode(...buf.slice(0, 4)) };
      });
      expect(pdf.status === 200 && pdf.head === '%PDF', 'PDF download failed');
      await click('Download PDF', 'button');
      await sleep(300);
    });
    await test('TC-E2E-14', 'A customer is sent away from administrator pages', async () => {
      await login('nimal@example.com');
      await go('/admin/impact');
      expect(new URL(page.url()).pathname === '/find', `Ended on ${page.url()}`);
    });

    console.log('Phone screen');
    await test('TC-E2E-15', 'Customer and charity screens fit a 360 px phone with no sideways scrolling', async () => {
      await page.setViewport({ width: 360, height: 740, isMobile: true, hasTouch: true });
      await login('nimal@example.com');
      await noSideScroll('/find', 'Find surplus');
      await sleep(1000);
      await shot('19-phone-find');
      await noSideScroll('/reservations', 'My reservations');
      await login('sahana@charity.lk');
      await noSideScroll('/charity', 'Charity overview');
      await noSideScroll('/charity/donations', 'Donations');
      await noSideScroll('/charity/claims', 'Claim history');
      await page.setViewport({ width: 1280, height: 800 });
    });
    await test('TC-E2E-16', 'No unexpected errors were logged in the browser console', async () => {
      expect(consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    });
  } finally {
    if (browser) await browser.close();
    server.kill();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const violations = accessibility.reduce((n, a) => n + a.violations.length, 0);
  fs.writeFileSync(path.join(EVIDENCE, 'e2e-results.json'), JSON.stringify({ when: new Date().toISOString(), browser: path.basename(executablePath), passed, failed: results.length - passed, results, accessibility }, null, 2));
  console.log(`\n${passed}/${results.length} passed. Accessibility violations: ${violations} across ${accessibility.length} pages.`);
  accessibility.filter((a) => a.violations.length).forEach((a) => console.log(`  ${a.page}: ${a.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes}) ${v.sample}`).join('; ')}`));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
