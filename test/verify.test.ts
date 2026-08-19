import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyProof, nameIdOf, blake2b256 } from '../src/verify.ts';
import type { NameProof } from '../src/types.ts';

const hex = (u8: Uint8Array) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

function proofFor(name: string): NameProof {
  const nameId = nameIdOf(name);
  // a synthetic redeem that embeds the nameId (real redeems commit it in the state region)
  const redeemHex = '6b01' + nameId + '87';
  const spk = 'aa20' + hex(blake2b256(Uint8Array.from(redeemHex.match(/.{2}/g)!, (b) => parseInt(b, 16)))) + '87';
  return {
    name, covid: '00'.repeat(32), outpoint: { transactionId: '11'.repeat(32), index: 0 },
    redeemHex, expectedScriptPublicKey: spk, nameId, settled: true, verify: '',
  };
}

test('valid proof passes', () => {
  assert.deepEqual(verifyProof('shawn', proofFor('shawn')), { ok: true });
  assert.deepEqual(verifyProof('Shawn.kaspa', proofFor('shawn')), { ok: true }); // input normalized
});

test('tampered redeem fails', () => {
  const p = proofFor('shawn');
  p.redeemHex = p.redeemHex!.replace(/87$/, '88');
  assert.equal(verifyProof('shawn', p).ok, false);
});

test('proof for a different name fails', () => {
  assert.equal(verifyProof('shawn', proofFor('mallory')).ok, false);
});

test('spoofed nameId fails', () => {
  const p = proofFor('shawn');
  p.nameId = nameIdOf('mallory');
  assert.equal(verifyProof('shawn', p).ok, false);
});

test('released name (no redeem) fails closed', () => {
  const p = proofFor('shawn');
  p.redeemHex = null; p.expectedScriptPublicKey = null;
  assert.equal(verifyProof('shawn', p).ok, false);
});

test('nameIdOf normalizes first', () => {
  assert.equal(nameIdOf('SHAWN.kaspa'), nameIdOf('shawn'));
});
