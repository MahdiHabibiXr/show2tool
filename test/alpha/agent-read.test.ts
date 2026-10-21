import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBroker, callBroker } from '../../src/broker/server.js';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { compileTool } from '../../src/workflow/candidate.js';
it('agent discovers and invokes a reviewed compiled tool over IPC without approval capability', async () => {
  const server = createServer((req, res) => { const term = new URL(req.url!, 'http://local').searchParams.get('term'); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ results: [term] })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-agent-read-'));
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews);
  const demos = ['one', 'two'].map((value, index) => ({ inputs: { search: value }, request: { id: String(index), method: 'GET', path: '/library', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: value } } }));
  const manifest = compileTool(demos, { id: 'find_books', origin, path: '/library', method: 'GET', effect: 'read', inputs: { search: { type: 'string', maxLength: 50 } }, projection: ['/results'] });
  await reviews.review(manifest, { interactive: true, ask: async () => 'review find_books' });
  registry.register(manifest, { origin, addresses: ['127.0.0.1'] });
  const broker = await startBroker(dir, registry);
  try {
    expect(await callBroker(dir, { command: 'tools' })).toMatchObject({ ok: true, data: { tools: [expect.objectContaining({ id: 'find_books' })] } });
    expect(await callBroker(dir, { command: 'run', id: 'find_books', inputs: { search: 'unseen' } })).toMatchObject({ ok: true, data: { '/results': ['unseen'] } });
    expect(await callBroker(dir, { command: 'approve' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  } finally { await broker.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
it('does not disconnect a valid read before its runtime deadline', async () => {
  const server = createServer((_, res) => { setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end('{"items":["ready"]}'); }, 5500); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-slow-read-'));
  const reviews = new ReviewStore(); const registry = new WorkflowRegistry(reviews);
  const manifest = { id: 'slow_read', origin, method: 'GET', path: '/slow', effect: 'read', schemaVersion: 1, inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  await reviews.review(manifest, { interactive: true, ask: async () => 'review slow_read' });
  registry.register(manifest, { origin, addresses: ['127.0.0.1'] });
  const broker = await startBroker(dir, registry);
  try { expect(await callBroker(dir, { command: 'run', id: 'slow_read', inputs: {} })).toMatchObject({ ok: true, data: { '/items': ['ready'] } }); }
  finally { await broker.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
