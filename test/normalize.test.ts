// Proves this package's normalize() matches the on-chain adjudication key over the published
// vector corpus. If this test fails after a vectors update, the NORMALIZER is wrong — never
// "fix" a vector to make it pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeName, tierOf } from '../src/normalize.ts';

const vectors = JSON.parse(readFileSync(new URL('../vectors/normalization.json', import.meta.url), 'utf8'));

test('normalization vectors', () => {
  assert.ok(vectors.cases.length >= 30, 'corpus unexpectedly small');
  for (const { input, canonical } of vectors.cases) {
    const r = normalizeName(input);
    if (canonical === null) {
      assert.equal(r.ok, false, `${JSON.stringify(input)} must be rejected`);
    } else {
      assert.ok(r.ok, `${JSON.stringify(input)} must be accepted`);
      assert.equal(r.ok && r.name, canonical, `${JSON.stringify(input)} must normalize to ${JSON.stringify(canonical)}`);
    }
  }
});

test('tier vectors', () => {
  for (const { name, tier } of vectors.tiers) assert.equal(tierOf(name), tier);
});

test('idempotence', () => {
  for (const { canonical } of vectors.cases) {
    if (canonical === null) continue;
    const again = normalizeName(canonical);
    assert.ok(again.ok && again.name === canonical);
  }
});

test('non-string input', () => {
  assert.equal(normalizeName(42 as unknown).ok, false);
  assert.equal(normalizeName(null as unknown).ok, false);
});
