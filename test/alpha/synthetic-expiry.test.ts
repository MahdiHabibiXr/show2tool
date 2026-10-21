import { it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerFixture, unregisterFixture } from '../../spike/fixture/registry.js';
import { SyntheticMutations } from '../../spike/mutations.js';
it('does not send after approval expires during asynchronous preflight', async () => {
  let now = 1000; let reads = 0; let effects = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/me') { reads++; if (reads > 1) now = 62000; response.end('{"tenant":"A"}'); }
    else if (request.method === 'POST') { effects++; response.end('{"id":"a1"}'); }
    else response.end('{"id":"a1","title":"new","tenant":"A"}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`; registerFixture(origin);
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-expiry-preflight-'));
  const contract = { schemaVersion: 1, id: 'create', origin, effect: 'create', method: 'POST', path: '/api/tasks', inputs: { title: { type: 'string', maxLength: 50 } }, body: { title: { source: 'input', name: 'title' } }, principal: { path: '/api/me', pointer: '/tenant' }, readBack: { path: '/api/tasks/{createdId}', idSource: '/id', expected: { '/title': { source: 'input', name: 'title' }, '/tenant': { source: 'principal' } } } };
  try {
    const coordinator = new SyntheticMutations(dir, { cookie: 'synthetic=A' });
    const intent = await coordinator.prepare(contract, { title: 'new' });
    await coordinator.approve(intent.id, { interactive: true, ask: async () => `approve ${intent.id}` });
    await expect(coordinator.dispatch(intent.id)).rejects.toThrow('APPROVAL_REQUIRED');
    expect(effects).toBe(0);
  } finally { clock.mockRestore(); unregisterFixture(origin); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
