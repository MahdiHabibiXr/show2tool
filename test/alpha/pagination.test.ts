import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { executeRead } from '../../src/runtime/execute.js';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';

it('aggregates bounded same-path cursor pages and rejects repeated cursors or incomplete limits', async () => {
  let mode = 'normal';
  const seen: string[] = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://local');
    seen.push(url.pathname + url.search);
    response.setHeader('content-type', 'application/json');
    const cursor = url.searchParams.get('cursor');
    response.end(JSON.stringify({ items: mode === 'overflow' ? Array.from({ length: 101 }, () => ({ id: 'x' })) : [{ id: cursor ? 'second' : 'first' }], next: mode === 'bad-cursor' ? { url: 'https://evil.invalid' } : mode === 'repeat' ? 'again' : cursor ? null : 'page 2&safe=true' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const manifest = { schemaVersion: 1, id: 'pages', origin, method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'], pagination: { cursorQuery: 'cursor', itemsPointer: '/items', nextPointer: '/next', maxPages: 3 } };
  const grant = { origin, addresses: ['127.0.0.1'], paths: ['/catalog'], queryKeys: ['cursor'], bodyKeys: [] };
  try {
    expect(await executeRead(manifest, {}, grant)).toEqual({ '/items': [{ id: 'first' }, { id: 'second' }] });
    expect(seen).toEqual(['/catalog', '/catalog?cursor=page+2%26safe%3Dtrue']);
    seen.length = 0;
    await expect(executeRead({ ...manifest, pagination: { ...manifest.pagination, maxPages: 1 } }, {}, grant)).rejects.toThrow('BUDGET_EXCEEDED');
    expect(seen).toHaveLength(1);
    mode = 'repeat'; seen.length = 0;
    await expect(executeRead(manifest, {}, grant)).rejects.toThrow('CONTRACT_MISMATCH');
    expect(seen).toHaveLength(2);
    mode = 'overflow';
    await expect(executeRead(manifest, {}, grant)).rejects.toThrow('BUDGET_EXCEEDED');
    mode = 'bad-cursor';
    await expect(executeRead(manifest, {}, grant)).rejects.toThrow('CONTRACT_MISMATCH');
    await expect(executeRead({ ...manifest, query: { cursor: { source: 'literal', value: 'initial' } } }, {}, grant)).rejects.toThrow('INVALID_INPUT');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('requires human scope to include the pagination field before registration', async () => {
  const manifest = { schemaVersion: 1, id: 'pages', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'], pagination: { cursorQuery: 'cursor', itemsPointer: '/items', nextPointer: '/next', maxPages: 3 } };
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews);
  expect(await reviews.review(manifest, { interactive: true, ask: async () => 'review pages' })).toBe(true);
  expect(() => registry.register(manifest, { origin: manifest.origin, queryKeys: [] })).toThrow('REVIEW_REQUIRED');
  expect(() => registry.register(manifest, { origin: manifest.origin, queryKeys: ['cursor'] })).not.toThrow();
});
