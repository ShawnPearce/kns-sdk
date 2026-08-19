import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KnsClient, KnsApiError } from '../src/client.ts';

function fakeFetch(handler: (url: string) => { status: number; body: unknown }) {
  const calls: string[] = [];
  const f = (async (url: any) => {
    calls.push(String(url));
    const { status, body } = handler(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as typeof globalThis.fetch;
  return { f, calls };
}

test('resolve normalizes input and hits the right URL', async () => {
  const { f, calls } = fakeFetch(() => ({ status: 200, body: { name: 'shawn', address: 'kaspa:qq0', covid: 'aa' } }));
  const kns = new KnsClient({ fetch: f, baseUrl: 'https://example.test/' });
  const r = await kns.resolve('Shawn.kaspa');
  assert.equal(r?.address, 'kaspa:qq0');
  assert.equal(calls[0], 'https://example.test/v1/resolve/shawn');
});

test('resolve returns null on 404', async () => {
  const { f } = fakeFetch(() => ({ status: 404, body: { error: 'not registered' } }));
  const kns = new KnsClient({ fetch: f });
  assert.equal(await kns.resolve('nobody'), null);
});

test('invalid name throws before any network call', async () => {
  const { f, calls } = fakeFetch(() => ({ status: 200, body: {} }));
  const kns = new KnsClient({ fetch: f });
  await assert.rejects(() => kns.resolve('under_score'), /invalid name/);
  assert.equal(calls.length, 0);
});

test('available() reports invalid input without a network call', async () => {
  const { f, calls } = fakeFetch(() => ({ status: 200, body: {} }));
  const kns = new KnsClient({ fetch: f });
  const a = await kns.available('-bad-');
  assert.deepEqual(a.available, false);
  assert.equal(calls.length, 0);
});

test('non-404 errors throw KnsApiError', async () => {
  const { f } = fakeFetch(() => ({ status: 500, body: { error: 'boom' } }));
  const kns = new KnsClient({ fetch: f });
  await assert.rejects(() => kns.resolve('shawn'), (e: unknown) => e instanceof KnsApiError && e.status === 500);
});

test('namesOf validates the identifier shape', async () => {
  const { f, calls } = fakeFetch(() => ({ status: 200, body: { names: [] } }));
  const kns = new KnsClient({ fetch: f });
  await assert.rejects(() => kns.namesOf('kaspa:qq0'), /64-hex/);
  assert.equal(calls.length, 0);
  assert.deepEqual(await kns.namesOf('A'.repeat(64)), []);
  assert.ok(calls[0].endsWith(`/v1/addresses/${'a'.repeat(64)}/names`));
});

test('reverse URL-encodes the address', async () => {
  const { f, calls } = fakeFetch(() => ({ status: 404, body: {} }));
  const kns = new KnsClient({ fetch: f });
  await kns.reverse('kaspa:qz5enng5');
  assert.ok(calls[0].includes('/v1/reverse/kaspa%3Aqz5enng5'));
});
