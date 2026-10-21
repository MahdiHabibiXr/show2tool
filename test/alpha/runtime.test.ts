import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { compileTool } from '../../src/workflow/candidate.js';
import { executeRead } from '../../src/runtime/execute.js';
it('executes a compiled mapping against a differently shaped application', async () => {
  let received = '';
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://local'); received = url.searchParams.get('term') ?? '';
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ results: [{ sku: 'book-7', label: received }], privateField: 'CANARY' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const demos = ['one', 'two'].map((value, index) => ({ inputs: { title: value }, request: { id: String(index), method: 'GET', path: '/library/find', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: value } } }));
    const manifest = compileTool(demos, { id: 'library_search', origin, method: 'GET', path: '/library/find', effect: 'read', inputs: { title: { type: 'string', maxLength: 100 } }, projection: ['/results'] });
    const result = await executeRead(manifest, { title: 'unseen book' }, { origin, addresses: ['127.0.0.1'] });
    expect(received).toBe('unseen book');
    expect(result).toEqual({ '/results': [{ sku: 'book-7', label: 'unseen book' }] });
    expect(JSON.stringify(result)).not.toContain('CANARY');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('rejects mutations from the read runtime', async () => {
  await expect(executeRead({ schemaVersion: 1, effect: 'create' }, {}, { origin: 'https://example.com' })).rejects.toThrow();
});
