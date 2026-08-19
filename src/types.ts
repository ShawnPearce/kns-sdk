// Response shapes of the KNS /v1 API (read-only, GET, JSON). Field names mirror the server exactly.
// All sompi amounts are decimal strings (int64 range — do BigInt(...) before arithmetic).

/** Owner modes of a name covenant. */
export const IDENTIFIER = { PUBKEY: 0, P2SH: 1, COVENANT_ID: 2, ADDRESS: 3 } as const;

export type Outpoint = { transactionId: string; index: number };

export type NameDetail = {
  name: string;
  display: string;                       // `${name}.kaspa`
  covid: string;                         // covenant id (hex) of the winning lineage
  status: 'pending' | 'active';
  owner: { identifier: string; type: number };   // identifier: 64-hex; type: IDENTIFIER.*
  recordsHash: string;                   // blake2b-256 of the records blob; 64 zeros = none
  outpoint: Outpoint | null;             // current UTXO of the name (null if released)
  bond: string;                          // sompi held in the name UTXO
  genesis: { txid: string; ordinal: number; blueScore: string };
  activate: { txid: string; ordinal: number; blueScore: string } | null;
  /** FALSE while an earlier hidden commit could still outrank this lineage (~1 h after its commit).
   *  Wallets SHOULD surface unsettled names as provisional; marketplaces MUST NOT treat them as final. */
  settled: boolean;
  settledAtBlue: string | null;          // blue score at which the name settles
  listing: { price: string; seller: string; verified: boolean; outpoint: Outpoint } | null;
};

export type ResolveResult = { name: string; address: string; covid: string };

export type ReverseResult = { address: string; name: string; display: string; covid: string };

export type Profile = {
  name: string;
  display: string;
  recordsHash: string;
  /** Decoded records (spec/RECORDS.md). Reserved keys: kas, primary, url, avatar, banner, bio, x, tg.
   *  `primary` is the single byte 0x01 (appears as ""). Unknown keys are forward-compatible. */
  records: Record<string, string>;
};

export type Availability =
  | { available: false; reason: 'invalid'; error: string }
  | { available: false; reason: 'registered'; name: string; settled: boolean }
  | { available: true; name: string; display: string; tier: number; feeSompi: string; note?: string };

export type FeeQuote = {
  name: string;
  tier: number;
  feeSompi: string;
  model: string;
  treasury: string;                      // x-only pubkey the registration fee must pay
  schema: string;                        // covenant source-schema hash
};

export type OwnedName = NameDetail & { isWinner: boolean };

export type Status = {
  network: string;
  halted: unknown;
  checkpoint: { hash: string; daaScore: string; ordinal: number } | null;
  lastBlueScore: string;
  adjudicationWindowW: string;
  schema: { schema: string; silverc: string };
};

export type NameProof = {
  name: string;
  covid: string;
  outpoint: Outpoint;
  redeemHex: string | null;
  expectedScriptPublicKey: string | null;  // 'aa20' + blake2b256(redeem) + '87'
  nameId: string;                           // blake2b-256 of the canonical name
  settled: boolean;
  verify: string;                           // human-readable verification instructions
};
