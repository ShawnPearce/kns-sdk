# kaspa-names

Resolve `.kaspa` names. The read-only SDK for **KNS** ([kaspaname.com](https://kaspaname.com)) — the
covenant-backed name service on Kaspa L1, where ownership, transfers, escrowed sales, and
resolution-record integrity are enforced by Kaspa consensus rather than an operator's database.

Zero-dependency resolution core; one small dependency (`@noble/hashes`) used only if you import the
on-chain proof verifier.

```
npm install @kronsdk/kaspa-names
```

## Quick start

```ts
import { KnsClient } from '@kronsdk/kaspa-names';

const kns = new KnsClient();

// Forward resolution — a send field:
const r = await kns.resolve('Shawn.kaspa');       // input is normalized for you
if (r) sendTo(r.address);                          // null = not registered / no payout record

// Reverse resolution — display an address as an identity:
const rev = await kns.reverse('kaspa:qz5enng5vzgpe4jk9avc2eznuyxkqtsx49hstsrvczm4j36sr0k5ykzjmdvdr');
label.textContent = rev ? rev.display : shorten(address);   // "shawn.kaspa"

// Profiles (url, avatar, socials, …):
const p = await kns.profile('shawn');
```

Full wallet-integration guidance (trust model, settling semantics, caching, verification):
**[docs/WALLET-INTEGRATION.md](docs/WALLET-INTEGRATION.md)**.

## API surface

| Method | Purpose | Not found |
|---|---|---|
| `resolve(name)` | name → payout address (`kas` record) | `null` |
| `reverse(address)` | address → verified primary name | `null` |
| `profile(name)` | full decoded record set | `null` |
| `name(name)` | ownership/status detail incl. `settled` | `null` |
| `namesOf(identifier)` | names owned by a 64-hex owner identifier | `[]` |
| `available(name)` | registration availability + fee | — |
| `feeQuote(name)` | registration fee for a name | throws |
| `proof(name)` | on-chain proof bundle | `null` |
| `status()` | indexer/network status | throws |

Plus pure helpers: `normalizeName`, `tierOf` (subpath `@kronsdk/kaspa-names/normalize`, zero deps) and
`verifyProof`, `nameIdOf` (subpath `@kronsdk/kaspa-names/verify`).

## The one rule you must not break: normalization

`KASPA.kaspa`, `Kaspa`, and `kaspa` all denote the canonical name `kaspa`. The normalization
function that decides this is **adjudication-critical**: two implementations that disagree on a
single byte disagree on *who owns a name* — and a wallet that normalizes differently can resolve a
user's input to the **wrong address**.

- If you use this SDK, you're safe: every name-taking method normalizes internally, and the
  repository that defines the on-chain rule gates this package's normalizer byte-for-byte against
  its canonical corpus on every change.
- If you re-implement in another language, you MUST validate against
  [`vectors/normalization.json`](vectors/normalization.json) — all cases, including the Unicode ones.
  Never hand-edit the vectors; they are generated from the canonical corpus.

## Trust model

The API is a *view* over consensus data — convenient, but not something you have to believe.
Every answer is anchored on-chain: a name's records hash and ownership live in covenant state, and
`proof(name)` returns the redeem preimage + outpoint. `verifyProof()` checks (purely, offline) that
the redeem provably encodes the name you asked about; the final step — that the outpoint is a live
UTXO with exactly that script — can be checked against **any Kaspa node** you trust.

```ts
import { verifyProof } from '@kronsdk/kaspa-names/verify';

const proof = await kns.proof('shawn');
const check = verifyProof('shawn', proof);   // { ok: true } or { ok: false, error }
// then: confirm proof.outpoint holds proof.expectedScriptPublicKey on your own node
```

## Own deployment / other networks

Everything defaults to the public mainnet deployment. Point at your own indexer with
`new KnsClient({ baseUrl: 'https://your-host' })`.

## License

Apache-2.0
