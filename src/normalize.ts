// Canonical .kaspa name normalization — THE adjudication key.
//
// This is a byte-for-byte port of the reference implementation
// (services/shared/nameNorm.mjs / web/src/nameNorm.ts in the KRON KNS repo). Two implementations that
// disagree on a single byte disagree on who owns a name — so if you re-implement this in another
// language, you MUST reproduce it exactly and validate against vectors/normalization.json. The KNS
// `verify:sdk` gate proves THIS file matches the on-chain rule over that corpus on every change.
//
// normalize(input):
//   1. Unicode NFKC, then reject if the result is not pure printable ASCII (no Unicode names — homoglyph risk).
//   2. ASCII-lowercase.
//   3. Strip exactly one trailing ".kaspa" suffix if present.
//   4. Validate the canonical form: a-z 0-9 hyphen, no leading/trailing hyphen, length 1..32.
// Never auto-repair beyond case-folding + suffix-stripping.

export const MAX_NAME_LEN = 32;
export const SUFFIX = '.kaspa';

export type NormResult = { ok: true; name: string } | { ok: false; error: string };

export function normalizeName(input: unknown): NormResult {
  if (typeof input !== 'string') return { ok: false, error: 'not a string' };
  let s: string;
  try { s = input.normalize('NFKC'); } catch { return { ok: false, error: 'not normalizable' }; }
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7e || s.charCodeAt(i) < 0x21) {
      return { ok: false, error: 'only printable ASCII allowed (no unicode, no spaces)' };
    }
  }
  s = s.toLowerCase();
  if (s.endsWith(SUFFIX)) s = s.slice(0, -SUFFIX.length);
  if (s.length < 1) return { ok: false, error: 'empty name' };
  if (s.length > MAX_NAME_LEN) return { ok: false, error: `longer than ${MAX_NAME_LEN} characters` };
  if (!/^[a-z0-9-]+$/.test(s)) return { ok: false, error: 'allowed characters: a-z, 0-9, hyphen' };
  if (s.startsWith('-') || s.endsWith('-')) return { ok: false, error: 'no leading/trailing hyphen' };
  return { ok: true, name: s };
}

/** Fee tier (1..5) of a CANONICAL name (pass the `name` from a successful normalizeName). */
export function tierOf(name: string): number {
  const n = name.length;
  return n >= 5 ? 5 : n;
}
