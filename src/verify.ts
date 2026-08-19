// Trust-minimization helpers — prove an API answer against chain data instead of trusting the server.
//
// The verification chain for a name:
//   1. proof.nameId must equal blake2b-256(canonical name)           ← checked here (pure)
//   2. expectedScriptPublicKey must equal 'aa20' + blake2b-256(redeem) + '87'   ← checked here (pure)
//   3. proof.outpoint must be an UNSPENT UTXO carrying exactly that scriptPublicKey — check against
//      any Kaspa node you trust (getUtxosByAddresses / getUtxosByOutpoint over wRPC). That last step
//      needs a node connection and is deliberately left to the caller; steps 1-2 already pin the
//      server to a redeem it cannot forge for a different name.
//
// This module is the only part of the SDK with a dependency (@noble/hashes for blake2b). Importing
// just the client/normalizer pulls in nothing.
import { blake2b } from '@noble/hashes/blake2b';
import { normalizeName } from './normalize.ts';
import type { NameProof } from './types.ts';

const hex = (u8: Uint8Array) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));

export const blake2b256 = (data: Uint8Array): Uint8Array => blake2b(data, { dkLen: 32 });

/** blake2b-256 of a canonical name — the ACTIVE nameId committed in covenant state. */
export function nameIdOf(input: string): string {
  const n = normalizeName(input);
  if (!n.ok) throw new Error(`invalid name: ${n.error}`);
  return hex(blake2b256(new TextEncoder().encode(n.name)));
}

export type ProofCheck = { ok: true } | { ok: false; error: string };

/** Pure checks (steps 1-2 above) of a /v1/names/{name}/proof response. A passing result means the
 *  redeem script the server handed you provably encodes THIS name; finish with the node UTXO check. */
export function verifyProof(name: string, proof: NameProof): ProofCheck {
  const n = normalizeName(name);
  if (!n.ok) return { ok: false, error: `invalid name: ${n.error}` };
  if (proof.name !== n.name) return { ok: false, error: `proof is for '${proof.name}', not '${n.name}'` };
  if (nameIdOf(n.name) !== proof.nameId.toLowerCase()) return { ok: false, error: 'nameId does not match blake2b-256(name)' };
  if (!proof.redeemHex || !proof.expectedScriptPublicKey) return { ok: false, error: 'proof has no live redeem (name released?)' };
  const spk = 'aa20' + hex(blake2b256(unhex(proof.redeemHex))) + '87';
  if (spk !== proof.expectedScriptPublicKey.toLowerCase()) return { ok: false, error: 'redeem does not hash to expectedScriptPublicKey' };
  if (!proof.redeemHex.toLowerCase().includes(proof.nameId.toLowerCase())) {
    return { ok: false, error: 'redeem does not commit to the nameId' };
  }
  return { ok: true };
}
