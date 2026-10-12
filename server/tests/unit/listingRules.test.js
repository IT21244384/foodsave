// Unit tests for FR1.3 listing rules (F1 – Janahan R). No database needed.
const { checkListingRules } = require('../../src/validation/listingRules');

const now = new Date('2026-10-12T20:40:00+05:30');
const t = (min) => new Date(now.getTime() + min * 60000);
const valid = { category: 'Cooked', offerType: 'sale', originalPrice: 650, price: 250, pickupFrom: t(20), pickupTo: t(80), safeUntil: t(170), hygieneDeclared: true };

describe('checkListingRules (FR1.3)', () => {
  test('TC-F1-01 a valid listing has no errors', () => {
    expect(checkListingRules(valid, now)).toEqual({});
  });
  test('TC-F1-02 pickup end before pickup start is rejected', () => {
    expect(checkListingRules({ ...valid, pickupTo: t(10) }, now).pickupTo).toMatch(/after pickup start/);
  });
  test('TC-F1-03 a pickup window that has already ended is rejected', () => {
    expect(checkListingRules({ ...valid, pickupFrom: t(-60), pickupTo: t(-5), safeUntil: t(30) }, now).pickupTo).toMatch(/already ended/);
  });
  test('TC-F1-04 safe-until must be after the pickup window', () => {
    expect(checkListingRules({ ...valid, safeUntil: t(80) }, now).safeUntil).toMatch(/after the pickup window/);
  });
  test('TC-F1-05 cooked food cannot be held for more than 6 hours', () => {
    expect(checkListingRules({ ...valid, safeUntil: t(6 * 60 + 1) }, now).safeUntil).toMatch(/at most 6 hours/);
  });
  test('TC-F1-06 exactly 6 hours is allowed (boundary)', () => {
    expect(checkListingRules({ ...valid, safeUntil: t(6 * 60) }, now)).toEqual({});
  });
  test('TC-F1-07 packaged food is not limited to 6 hours', () => {
    expect(checkListingRules({ ...valid, category: 'Packaged', safeUntil: t(24 * 60) }, now)).toEqual({});
  });
  test('TC-F1-08 discounted price must be lower than the original', () => {
    expect(checkListingRules({ ...valid, price: 650 }, now).price).toMatch(/lower than the original/);
  });
  test('TC-F1-09 a sale needs a price above zero', () => {
    expect(checkListingRules({ ...valid, price: 0 }, now).price).toMatch(/Enter a discounted price/);
  });
  test('TC-F1-10 a donation does not need a price', () => {
    expect(checkListingRules({ ...valid, offerType: 'donate', price: 0 }, now)).toEqual({});
  });
  test('TC-F1-11 the hygiene declaration is required', () => {
    expect(checkListingRules({ ...valid, hygieneDeclared: false }, now).hygieneDeclared).toMatch(/hygiene declaration/);
  });
  test('TC-F1-12 several problems are all reported together', () => {
    const errors = checkListingRules({ ...valid, price: 900, hygieneDeclared: false }, now);
    expect(Object.keys(errors).sort()).toEqual(['hygieneDeclared', 'price']);
  });
});
