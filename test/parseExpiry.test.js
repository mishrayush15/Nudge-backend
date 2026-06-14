const test = require('node:test');
const assert = require('node:assert/strict');

const { parseExpiryDate } = require('../src/utils/parseExpiry');

test('parses a valid date at UTC midnight', () => {
  const result = parseExpiryDate(
    '15/08/2027',
    new Date('2027-08-10T23:30:00-07:00')
  );

  assert.deepEqual(result, {
    raw: '15/08/2027',
    iso: '2027-08-15T00:00:00.000Z',
    display: '15 August 2027',
    isExpired: false,
    daysUntilExpiry: 4,
  });
});

test('accepts a leap day and rejects impossible dates', () => {
  assert.ok(parseExpiryDate('29/02/2028'));
  assert.equal(parseExpiryDate('29/02/2027'), null);
  assert.equal(parseExpiryDate('31/04/2027'), null);
});

test('normalizes single-digit day and month fields', () => {
  const result = parseExpiryDate('1/2/2027', new Date('2027-02-01T12:00:00Z'));

  assert.equal(result.raw, '01/02/2027');
  assert.equal(result.daysUntilExpiry, 0);
  assert.equal(result.isExpired, false);
});

test('normalizes a month and year to the first day of the month', () => {
  const result = parseExpiryDate('8/2027', new Date('2027-07-31T12:00:00Z'));

  assert.equal(result.raw, '01/08/2027');
  assert.equal(result.iso, '2027-08-01T00:00:00.000Z');
  assert.equal(result.daysUntilExpiry, 1);
});

test('marks only dates before the current calendar day as expired', () => {
  const now = new Date('2027-06-08T20:00:00Z');

  assert.equal(parseExpiryDate('07/06/2027', now).isExpired, true);
  assert.equal(parseExpiryDate('08/06/2027', now).isExpired, false);
  assert.equal(parseExpiryDate('09/06/2027', now).daysUntilExpiry, 1);
});

test('rejects malformed and out-of-range values', () => {
  assert.equal(parseExpiryDate('2027/08'), null);
  assert.equal(parseExpiryDate('01/01/2041'), null);
  assert.equal(parseExpiryDate(null), null);
});
