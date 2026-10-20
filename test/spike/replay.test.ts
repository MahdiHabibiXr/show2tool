import { it, expect } from 'vitest';
import { startFixture } from '../../spike/fixture/server.js';
import { replayRead } from '../../spike/replay.js';

const auth = { bearer: 'FIXTURE_BEARER_CANARY_A' };
it('replays unseen query and paginated results against independent truth', async () => {
  const app = await startFixture();
  try {
    const contract = { origin: app.origin, path: '/api/tasks' as const, queryInput: 'query' as const, expectedTenant: 'A' };
    expect(await replayRead(contract, { query: 'gamma' }, auth)).toEqual([{ id: 'a3', tenant: 'A', title: 'gamma', version: 1 }]);
    expect(await replayRead(contract, { query: '' }, auth)).toHaveLength(3);
    expect(await replayRead(contract, { query: 'missing' }, auth)).toEqual([]);
    expect(await replayRead(contract, { query: 'alpha' }, { cookie: 'session=FIXTURE_COOKIE_CANARY_A' })).toEqual([{ id: 'a1', tenant: 'A', title: 'alpha', version: 1 }]);
  } finally { await app.close(); }
});
it.each(['wrong-tenant', 'ignore-filter', 'login-html', 'repeat-cursor'] as const)('rejects semantic/contract failure: %s', async fault => {
  const app = await startFixture();
  try {
    app.setFault(fault);
    await expect(replayRead({ origin: app.origin, path: '/api/tasks', queryInput: 'query', expectedTenant: 'A' }, { query: 'gamma' }, auth)).rejects.toThrow({ 'wrong-tenant': 'tenant mismatch', 'ignore-filter': 'filter mismatch', 'login-html': 'not-json', 'repeat-cursor': 'repeated cursor' }[fault]);
  } finally { await app.close(); }
});
it('rejects expired auth without switching mode or exposing credentials', async () => {
  const app = await startFixture();
  try {
    app.expire();
    await expect(replayRead({ origin: app.origin, path: '/api/tasks', queryInput: 'query', expectedTenant: 'A' }, { query: 'gamma' }, auth)).rejects.toThrow('http:401');
  } finally { await app.close(); }
});
it('resolves a fresh search result id before retrieving detail', async () => {
  const app = await startFixture();
  try {
    const { replayDetail } = await import('../../spike/replay.js');
    expect(await replayDetail({ origin: app.origin, path: '/api/tasks', queryInput: 'query', expectedTenant: 'A' }, { query: 'beta' }, auth)).toEqual({ id: 'a2', tenant: 'A', title: 'beta', version: 1 });
    await expect(replayDetail({ origin: app.origin, path: '/api/tasks', queryInput: 'query', expectedTenant: 'A' }, { query: '' }, auth)).rejects.toThrow('exactly one result required');
  } finally { await app.close(); }
});
it('does not send credentials to a different loopback service', async () => {
  const { createServer } = await import('node:http');
  const { fixtureJson } = await import('../../spike/replay.js');
  let received = false;
  const server = createServer((_, res) => { received = true; res.setHeader('content-type', 'application/json'); res.end('{}'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    await expect(fixtureJson(`http://127.0.0.1:${address.port}`, '/api/tasks', auth)).rejects.toThrow('unregistered fixture');
    expect(received).toBe(false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('sanitizes malformed JSON errors rather than echoing response secrets', async () => {
  const { createServer } = await import('node:http');
  const { fixtureJson } = await import('../../spike/replay.js');
  const { registerFixture, unregisterFixture } = await import('../../spike/fixture/registry.js');
  const server = createServer((_, res) => { res.setHeader('content-type', 'application/json'); res.end('SECRET_CANARY'); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  registerFixture(origin);
  try { await expect(fixtureJson(origin, '/api/tasks', auth)).rejects.toThrow('invalid-json'); }
  finally { unregisterFixture(origin); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('aborts oversized responses instead of treating partial JSON as success', async () => {
  const { createServer } = await import('node:http');
  const { fixtureJson } = await import('../../spike/replay.js');
  const { registerFixture, unregisterFixture } = await import('../../spike/fixture/registry.js');
  const server = createServer((_, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({value:'x'.repeat(70000)})); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  registerFixture(origin);
  try { await expect(fixtureJson(origin, '/api/tasks', auth)).rejects.toThrow('body budget'); }
  finally { unregisterFixture(origin); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('rejects excessively nested JSON before exposing it to consumers', async () => {
  const { createServer } = await import('node:http');
  const { fixtureJson } = await import('../../spike/replay.js');
  const { registerFixture, unregisterFixture } = await import('../../spike/fixture/registry.js');
  const server = createServer((_, res) => { res.setHeader('content-type', 'application/json'); res.end('['.repeat(100) + '0' + ']'.repeat(100)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  registerFixture(origin);
  try { await expect(fixtureJson(origin, '/api/tasks', auth)).rejects.toThrow('json depth budget'); }
  finally { unregisterFixture(origin); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
