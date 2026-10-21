import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { manifestHash } from '../../src/approval/review.js';
import { SavedChains } from '../../src/app/chains.js';
import { startBroker } from '../../src/broker/server.js';

it('advertises actual input schemas and calls named workflows through the reviewed broker', async () => {
  let requests = 0;
  const http = createServer((request, response) => { requests++; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ items: [new URL(request.url!, 'http://local').searchParams.get('q')] })); });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-named-mcp-'));
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews);
  const manifest = { schemaVersion: 1, id: 'search', origin, method: 'GET', path: '/catalog', effect: 'read', inputs: { query: { type: 'string', maxLength: 20 } }, query: { q: { source: 'input', name: 'query' } }, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  await reviews.review(manifest, { interactive: true, ask: async () => 'review search' });
  registry.register(manifest, { origin, addresses: ['127.0.0.1'] });
  await new SavedChains(dir).save({ schemaVersion: 1, id: 'search_chain', inputs: { query: { type: 'string', maxLength: 20 } }, steps: [{ id: 'search', manifestDigest: manifestHash(manifest), inputs: { query: { source: 'input', name: 'query' } } }] });
  const paged = { ...manifest, id: 'paged', pagination: { cursorQuery: 'cursor', itemsPointer: '/items', nextPointer: '/next', maxPages: 2 } };
  await reviews.review(paged, { interactive: true, ask: async () => 'review paged' });
  registry.register(paged, { origin, addresses: ['127.0.0.1'] });
  await new SavedChains(dir).save({ schemaVersion: 1, id: 'unsupported_chain', inputs: { query: { type: 'string', maxLength: 20 } }, steps: [{ id: 'paged', manifestDigest: manifestHash(paged), inputs: { query: { source: 'input', name: 'query' } } }] });
  const broker = await startBroker(dir, registry);
  const client = new Client({ name: 'named-test', version: '1.0.0' });
  try {
    const module = pathToFileURL(resolve('dist/src/mcp/reviewed.js')).href;
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--input-type=module', '-e', `import { serveReviewed } from ${JSON.stringify(module)}; await serveReviewed(${JSON.stringify(dir)});`], stderr: 'pipe' }));
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).toContain('chain_search_chain');
    expect(tools.tools.map(tool => tool.name)).not.toContain('chain_unsupported_chain');
    expect(tools.tools.find(tool => tool.name === 'workflow_search')).toMatchObject({ name: 'workflow_search', inputSchema: { properties: { query: { type: 'string', maxLength: 20 } }, required: ['query'], additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: true } });
    expect(requests).toBe(0);
    expect((await client.callTool({ name: 'workflow_search', arguments: { query: 'new term' } })).structuredContent).toMatchObject({ ok: true, data: { '/items': ['new term'] } });
    expect(requests).toBe(1);
    expect((await client.callTool({ name: 'chain_search_chain', arguments: { query: 'chain term' } })).structuredContent).toMatchObject({ ok: true, data: { '/items': ['chain term'] } });
    expect(requests).toBe(2);
    const invalid = await client.callTool({ name: 'workflow_search', arguments: { query: 'x'.repeat(21) } });
    expect(invalid.isError).toBe(true);
    expect(requests).toBe(2);
    const changed = { ...manifest, projection: [''] };
    await reviews.review(changed, { interactive: true, ask: async () => 'review search' });
    registry.register(changed, { origin, addresses: ['127.0.0.1'] });
    expect((await client.callTool({ name: 'workflow_search', arguments: { query: 'new term' } })).structuredContent).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
    expect((await client.callTool({ name: 'chain_search_chain', arguments: { query: 'chain term' } })).structuredContent).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
    expect(requests).toBe(2);
  } finally {
    await client.close(); await broker.close(); http.closeAllConnections();
    await new Promise<void>(resolve => http.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
