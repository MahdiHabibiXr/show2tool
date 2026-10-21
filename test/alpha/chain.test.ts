import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { ReviewStore, manifestHash } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { handle } from '../../src/app/handlers.js';
it('resolves bounded read dependencies only from reviewed projected fields', async () => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!); response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.url!.startsWith('/search') ? { items: [{ id: 'a3' }], privateId: 'secret' } : { id: 'a3', title: 'gamma' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const reviews = new ReviewStore(); const registry = new WorkflowRegistry(reviews);
  const common = { schemaVersion: 1, origin, method: 'GET', effect: 'read', body: {}, provenance: ['a', 'b'] };
  const search = { ...common, id: 'search', path: '/search', inputs: { q: { type: 'string', maxLength: 50 } }, query: { q: { source: 'input', name: 'q' } }, projection: ['/items'] };
  const detail = { ...common, id: 'detail', path: '/tasks/{id}', inputs: { id: { type: 'string', maxLength: 50 } }, query: {}, projection: ['/id', '/title'] };
  for (const manifest of [search, detail]) { await reviews.review(manifest, { interactive: true, ask: async () => `review ${manifest.id}` }); registry.register(manifest, { origin, addresses: ['127.0.0.1'], paths: ['/search', '/tasks/{id}'] }); }
  const steps = [
    { id: 'search', manifestDigest: manifestHash(search), inputs: { q: { source: 'input', name: 'query' } } },
    { id: 'detail', manifestDigest: manifestHash(detail), inputs: { id: { source: 'step', step: 0, projection: '/items', pointer: '/0/id' } } },
  ];
  try {
    expect(await handle({ command: 'run_chain', inputs: { query: 'gamma' }, steps }, registry)).toMatchObject({ ok: true, data: { '/id': 'a3', '/title': 'gamma' } });
    expect(requests).toEqual(['/search?q=gamma', '/tasks/a3']);
    requests.length = 0;
    expect(await handle({ command: 'run_chain', inputs: { query: 'gamma' }, steps: [steps[0], { ...steps[1], inputs: { id: { source: 'step', step: 0, projection: '/privateId', pointer: '' } } }] }, registry)).toMatchObject({ ok: false });
    expect(requests).toEqual(['/search?q=gamma']);
    requests.length = 0;
    expect(await handle({ command: 'run_chain', inputs: { query: 'gamma' }, steps: [steps[0], { ...steps[1], manifestDigest: '0'.repeat(64) }] }, registry)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
    expect(requests).toEqual([]);
    expect(await handle({ command: 'run_chain', inputs: { query: 'gamma' }, steps: [steps[0], { ...steps[1], inputs: { id: { source: 'step', step: 1, projection: '/items', pointer: '/0/id' } } }] }, registry)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(requests).toEqual([]);
    const paged = { ...search, projection: ['/items'], pagination: { cursorQuery: 'cursor', itemsPointer: '/items', nextPointer: '/next', maxPages: 5 } };
    await reviews.review(paged, { interactive: true, ask: async () => 'review search' });
    registry.register(paged, { origin, addresses: ['127.0.0.1'] });
    expect(await handle({ command: 'run_chain', inputs: { query: 'gamma' }, steps: [{ ...steps[0], manifestDigest: manifestHash(paged) }] }, registry)).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_FEATURE' } });
    expect(requests).toEqual([]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
