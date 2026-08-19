# Integrating `.kaspa` names into a wallet

This guide is for wallet and app developers adding KNS name display and resolution. The reference
consumer is this repo's SDK (`npm i @kronsdk/kaspa-names`), but everything here is implementable directly
against the HTTP API — the SDK is a convenience, not a requirement.

## What KNS is (one paragraph)

KNS registers `.kaspa` names as covenant UTXOs on Kaspa L1. Ownership, transfers, escrowed
marketplace sales, and the integrity of each name's resolution records are enforced by Kaspa
consensus — the API below is a deterministic, replayable *view* of chain data, not an authority.
Anyone can recompute who owns a name from the chain plus the published rule; nothing in this guide
requires trusting the API operator (see **Verification**).

## The two integrations that matter

### 1. Forward resolution — names in the send field

When the user types something ending in `.kaspa` (or any valid name) as a payment destination:

```ts
import { KnsClient } from '@kronsdk/kaspa-names';
const kns = new KnsClient();

const r = await kns.resolve(userInput);        // normalizes internally; null = no resolution
if (r) proceedWith(r.address);
```

HTTP: `GET /v1/resolve/{name}` → `{ name, address, covid }`, 404 if unregistered or the owner
published no payout record.

**UX requirements:**
- Show the user the resolved address *and* the canonical display form (`shawn.kaspa`) before they
  confirm a send — never silently substitute.
- Treat a `null` result as "no such name", not an error.
- A name's payout record is mutable by its owner and **cleared on every ownership change** —
  resolve at send time; do not cache resolutions across sessions (in-flight caching ≤ 60 s is fine;
  the server sets `Cache-Control` on hot reads).

### 2. Reverse resolution — names as identity

Wherever you display an address (account header, tx history, contacts), you can show its primary
name instead:

```ts
const rev = await kns.reverse(address);        // null = no primary name set
label = rev ? rev.display : shorten(address);
```

HTTP: `GET /v1/reverse/{address}` → `{ address, name, display, covid }`, 404 if none.

**The safety rule is already enforced server-side:** an address's primary name only exists when the
name's owner explicitly opted in (`primary` record) AND the name's `kas` record points back at that
exact address. The two-way binding means a non-null answer is safe to render as the address's
identity. If you want to verify it yourself instead of trusting the server: fetch
`GET /v1/names/{name}/profile` and check `records.kas === address` and `records.primary` is set.

## Normalization — the part you must get exactly right

Canonical names are `a-z 0-9 -`, 1–32 chars, no leading/trailing hyphen. Display input is
normalized: Unicode NFKC → reject non-ASCII → lowercase → strip one `.kaspa` suffix → validate.
**Never auto-repair beyond that** (no trimming, no dedup of hyphens).

This function is adjudication-critical: implementations that disagree on one byte disagree on who
owns a name, and a divergent wallet can resolve user input to the wrong address. Use the SDK's
`normalizeName` (it is byte-parity-gated against the on-chain rule), or if you re-implement (other
languages), validate against [`../vectors/normalization.json`](../vectors/normalization.json) —
every case, especially the Unicode ones (fullwidth forms normalize in; homoglyphs and zero-width
characters must reject).

## Settling — the one temporal caveat

For ~1 hour after a name's registration commit, a hidden earlier commit of the same name could
still reveal and outrank it (commits are blinded hashes — this is the flip side of front-running
protection). `GET /v1/names/{name}` exposes `settled: boolean` and `settledAtBlue`.

- **Display/resolution**: fine to serve immediately; optionally badge unsettled names as
  provisional.
- **Anything financial** (showing a name as receivable identity for large amounts, marketplace
  purchases, escrow): treat `settled: false` as not final. The KNS app itself refuses name
  *purchases* until settled; integrators building buys MUST do the same (`/v1/market/listings`
  exposes `isWinner`; the name detail exposes `settled`).

After settling, ownership is final under a deterministic published rule — no operator discretion.

## Endpoint reference

Base URL: `https://kaspaname.com` (all GET, JSON, CORS `*` — callable directly from extension or
web contexts). Path names are normalized server-side too; invalid names return 400.

| Endpoint | Returns |
|---|---|
| `/v1/resolve/{name}` | forward resolution (404 = none) |
| `/v1/reverse/{address}` | verified primary name (404 = none) |
| `/v1/names/{name}` | ownership, status, `settled`, listing |
| `/v1/names/{name}/profile` | decoded records: `kas`, `url`, `avatar`, `banner`, `bio`, `x`, `tg`, `primary` (+ forward-compatible unknown keys) |
| `/v1/names/{name}/available` | availability + registration fee tier |
| `/v1/addresses/{identifier}/names` | names owned by a **64-hex owner identifier** (from `owner.identifier` — not a `kaspa:` address) |
| `/v1/names/{name}/history` | event log (register/transfer/update/list/…) |
| `/v1/market/listings` · `/sales` · `/stats` | marketplace views |
| `/v1/fees/quote?name=` | registration fee quote |
| `/v1/status` | network, checkpoint, adjudication window |
| `/v1/names/{name}/proof` · `/v1/proof/templates` · `/v1/proof/genesis` | verification bundle (below) |

Sompi amounts are decimal strings — `BigInt(...)` before arithmetic.

## Verification (optional, recommended for high-value flows)

You never have to take the API's word:

1. `GET /v1/names/{name}/proof` → the name's current redeem preimage + outpoint.
2. `verifyProof(name, proof)` from `@kronsdk/kaspa-names/verify` checks offline that the redeem provably
   encodes this exact name (`nameId = blake2b-256(name)`) and hashes to the claimed script
   (`'aa20' + blake2b256(redeem) + '87'`).
3. Ask **any Kaspa node** whether that outpoint is a live UTXO with exactly that scriptPublicKey
   (`getUtxosByAddresses` on the P2SH address over wRPC). If yes, the answer you displayed is
   anchored in consensus, not in this server.

Records integrity is covered the same way: `profile.recordsHash` is committed in covenant state,
and equals `blake2b-256` of the records blob.

## Operational notes

- **Availability**: the service is a single public deployment today; for wallet-grade uptime
  requirements, or to eliminate the view-layer trust entirely, you can run the indexer against your
  own Kaspa node — contact the maintainer.
- **Rate limits**: none currently enforced; be a good citizen (honor `Cache-Control`, batch via
  `namesOf` where sensible).
- **Errors**: 400 = invalid name (message explains), 404 = absence (expected outcome), 5xx = server
  fault — degrade to showing the raw address; never block a send on resolver availability unless
  the user typed a name.
