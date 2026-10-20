import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { fixtureJson } from '../../spike/replay.js';
import { registerFixture, unregisterFixture } from '../../spike/fixture/registry.js';

it('applies response budget to gzip-decoded data', async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
    res.end(gzipSync(JSON.stringify({ value: 'x'.repeat(100000) })));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  registerFixture(origin);
  try { await expect(fixtureJson(origin, '/api/tasks', { bearer: 'synthetic' })).rejects.toThrow('body budget'); }
  finally { unregisterFixture(origin); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('reports stalled response body as a sanitized transport timeout', async () => {
  const server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"value":');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  registerFixture(origin);
  try { await expect(fixtureJson(origin, '/api/tasks', { bearer: 'synthetic' })).rejects.toThrow('transport outcome unknown'); }
  finally { unregisterFixture(origin); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
