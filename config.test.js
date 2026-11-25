const assert = require('node:assert/strict');
const test = require('node:test');
const { parseAdminId } = require('./src/config');

test('parseAdminId accepts one positive Telegram ID', () => {
  assert.equal(parseAdminId('789'), 789);
});

test('parseAdminId treats an empty setting as missing', () => {
  assert.equal(parseAdminId(''), null);
});

test('parseAdminId rejects malformed and unsafe IDs', () => {
  assert.throws(() => parseAdminId('123,456'), /ADMIN_TG_ID/);
  assert.throws(() => parseAdminId('9007199254740992'), /valid Telegram ID/);
});
