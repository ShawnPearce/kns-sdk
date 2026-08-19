// KnsClient — a minimal, dependency-free reader for the KNS /v1 API.
//
// Design notes for integrators:
//   - Every name-taking method normalizes its input with the canonical rule first and throws on
//     invalid names — you can pass raw user input ("Shawn.kaspa") directly.
//   - resolve()/reverse() return null for "not registered / no record" (404) rather than throwing,
//     since absence is an expected outcome in a send-field or display path.
//   - No retries and no caching: wallets have their own policies. The server sets Cache-Control
//     (5-10 s on hot reads); honor it if you add an HTTP cache.
//   - The API is a VIEW over chain data. For trust-minimized display you can spot-check any answer
//     against a Kaspa node via proof() + verifyProof() (see verify.ts) — no trust in this server.
import { normalizeName } from './normalize.ts';
import type {
  Availability, FeeQuote, NameDetail, NameProof, OwnedName, Profile,
  ResolveResult, ReverseResult, Status,
} from './types.ts';

export type KnsClientOptions = {
  /** API origin. Default: the public KNS deployment. */
  baseUrl?: string;
  /** Per-request timeout in ms (default 10_000). */
  timeoutMs?: number;
  /** Injectable fetch (tests, custom agents). Default: globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
};

export const DEFAULT_BASE_URL = 'https://kaspaname.com';

export class KnsApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, url: string) {
    super(`KNS API ${status} on ${url}${body && typeof body === 'object' && 'error' in (body as any) ? `: ${(body as any).error}` : ''}`);
    this.name = 'KnsApiError';
    this.status = status;
    this.body = body;
  }
}

export class KnsClient {
  private base: string;
  private timeoutMs: number;
  private f: typeof globalThis.fetch;

  constructor(opts: KnsClientOptions = {}) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.f = opts.fetch ?? globalThis.fetch;
    if (!this.f) throw new Error('no fetch available — pass options.fetch');
  }

  private async get<T>(path: string, missingOk: false): Promise<T>;
  private async get<T>(path: string, missingOk: true): Promise<T | null>;
  private async get<T>(path: string, missingOk: boolean): Promise<T | null> {
    const url = `${this.base}${path}`;
    const res = await this.f(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => null);
    if (res.status === 404 && missingOk) return null;
    if (!res.ok) throw new KnsApiError(res.status, body, url);
    return body as T;
  }

  /** Canonicalize a user-typed name or throw. "Shawn.kaspa" → "shawn". */
  canonical(input: string): string {
    const n = normalizeName(input);
    if (!n.ok) throw new Error(`invalid name: ${n.error}`);
    return n.name;
  }

  /** Forward resolution: name → payout address (the `kas` record). Null if the name is
   *  unregistered or its owner has not published a `kas` record. */
  async resolve(input: string): Promise<ResolveResult | null> {
    return this.get<ResolveResult>(`/v1/resolve/${encodeURIComponent(this.canonical(input))}`, true);
  }

  /** Reverse resolution: kaspa: address → its primary name. Null if none is set.
   *  The server already verifies the two-way binding (the name's `kas` record must point back
   *  at this address), so a non-null answer is safe to display as the address's identity. */
  async reverse(address: string): Promise<ReverseResult | null> {
    return this.get<ReverseResult>(`/v1/reverse/${encodeURIComponent(address)}`, true);
  }

  /** Full decoded record set of a name (url, avatar, socials, …). Null if unregistered. */
  async profile(input: string): Promise<Profile | null> {
    return this.get<Profile>(`/v1/names/${encodeURIComponent(this.canonical(input))}/profile`, true);
  }

  /** Ownership/status detail of a name, including the `settled` flag. Null if unregistered. */
  async name(input: string): Promise<NameDetail | null> {
    return this.get<NameDetail>(`/v1/names/${encodeURIComponent(this.canonical(input))}`, true);
  }

  /** All names owned by an OWNER IDENTIFIER — the 64-hex x-only pubkey / identifier from
   *  NameDetail.owner.identifier, NOT a kaspa: address string. */
  async namesOf(ownerIdentifier: string): Promise<OwnedName[]> {
    if (!/^[0-9a-fA-F]{64}$/.test(ownerIdentifier)) throw new Error('ownerIdentifier must be 64-hex (see NameDetail.owner.identifier)');
    const r = await this.get<{ names: OwnedName[] }>(`/v1/addresses/${ownerIdentifier.toLowerCase()}/names`, false);
    return r.names;
  }

  /** Registration availability + fee for a (possibly raw) name. Never throws on invalid input —
   *  returns { available: false, reason: 'invalid' } so it can drive a search box directly. */
  async available(input: string): Promise<Availability> {
    const n = normalizeName(input);
    if (!n.ok) return { available: false, reason: 'invalid', error: n.error };
    return this.get<Availability>(`/v1/names/${encodeURIComponent(n.name)}/available`, false);
  }

  /** Registration fee quote for a name. */
  async feeQuote(input: string): Promise<FeeQuote> {
    return this.get<FeeQuote>(`/v1/fees/quote?name=${encodeURIComponent(this.canonical(input))}`, false);
  }

  /** Indexer status (network, checkpoint, adjudication window). */
  async status(): Promise<Status> {
    return this.get<Status>('/v1/status', false);
  }

  /** The on-chain proof bundle for a name — verify with verifyProof() and any Kaspa node. */
  async proof(input: string): Promise<NameProof | null> {
    return this.get<NameProof>(`/v1/names/${encodeURIComponent(this.canonical(input))}/proof`, true);
  }
}
