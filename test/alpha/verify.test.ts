import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handle } from '../../src/app/handlers.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { ReviewStore, manifestHash } from '../../src/approval/review.js';

it('checks independent expectations and saves digest-bound evidence without response values', async () => {
  let requests = 0;
  const server = createServer((_req, res) => { requests++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ items: [{ id: 'book_3', title: 'PRIVATE_RESPONSE' }], empty: [] })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-verify-'));
  const manifest = { schemaVersion: 1, id: 'catalog', origin, method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items', '/empty'], provenance: ['a', 'b'] };
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews);
  const { startBroker, callBroker } = await import('../../src/broker/server.js');
  const broker = await startBroker(dir, registry);
  const verify = (expected: unknown) => callBroker(dir, { command: 'verify', id: 'catalog', inputs: {}, expected });
  try {
    expect(await verify({ '/items/0/id': 'book_3' })).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
    expect(requests).toBe(0);
    await reviews.review(manifest, { interactive: true, ask: async () => 'review catalog' });
    registry.register(manifest, { origin, addresses: ['127.0.0.1'] });
    for (const expected of [{}, { '/items/0/id': { injected: true } }, { '/items/__proto__/x': 'x' }]) {
      expect(await verify(expected)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
    expect(requests).toBe(0);
    const passed = await verify({ '/items/0/id': 'book_3', '/empty/length': 0 });
    expect(passed).toMatchObject({ ok: true, data: { status: 'passed', manifestDigest: manifestHash(manifest), assertions: [{ pointer: '/items/0/id', passed: true }, { pointer: '/empty/length', passed: true }] } });
    const failed = await verify({ '/items/0/id': 'PRIVATE_EXPECTATION', '/missing': null });
    expect(failed).toMatchObject({ ok: true, data: { status: 'failed', assertions: [{ pointer: '/items/0/id', passed: false }, { pointer: '/missing', passed: false }] } });
    const files = await readdir(join(dir, 'verification'));
    expect(files).toHaveLength(2);
    for (const file of files) {
      const text = await readFile(join(dir, 'verification', file), 'utf8');
      expect(text).not.toContain('PRIVATE_RESPONSE');
      expect(text).not.toContain('PRIVATE_EXPECTATION');
      expect(JSON.parse(text)).toMatchObject({ schemaVersion: 1, manifestDigest: manifestHash(manifest), caseDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    }
    expect(requests).toBe(2);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    expect(await verify({ '/items/0/id': 'book_3' })).toMatchObject({ ok: false, error: { code: 'EXECUTION_FAILED' } });
    expect(await readdir(join(dir, 'verification'))).toHaveLength(2);
  } finally {
    await broker.close();
    if (server.listening) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    await rm(dir, { recursive: true, force: true });
  }
});
