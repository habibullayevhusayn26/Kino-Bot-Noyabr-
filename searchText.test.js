const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createNgrams,
  editDistance,
  normalizeSearchText,
  scoreTitleMatch
} = require('./src/utils/searchText');

test('normalizes punctuation and case for Uzbek title search', () => {
  assert.equal(normalizeSearchText("Qasoskorlar: Yakuniy o'yin"), 'qasoskorlar yakuniy o yin');
});

test('creates unique indexed n-grams from normalized text', () => {
  assert.deepEqual(createNgrams('aaaa'), ['aaa']);
});

test('fuzzy title ranking favors a near-matching title token', () => {
  assert.ok(scoreTitleMatch('qasoskorla', 'qasoskorlar yakuniy oyun') > 0.8);
  assert.equal(editDistance('kino', 'kino'), 0);
});
