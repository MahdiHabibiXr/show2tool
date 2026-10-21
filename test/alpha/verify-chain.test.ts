import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewStore, manifestHash } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { handle } from '../../src/app/handlers.js';
it('verifies final chain facts and binds evidence to the complete step definitions', async () => {
  const server = createServer((_request, response) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ id: 'a3' })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-verify-chain-'));
  const manifest = { schemaVersion: 1, id: 'detail', origin, method: 'GET', path: '/tasks/{id}', effect: 'read', inputs: { id: { type: 'string', maxLength: 20 } }, query: {}, body: {}, projection: ['/id'], provenance: ['a', 'b'] };
  const reviews = new ReviewStore(); const registry = new WorkflowRegistry(reviews);
  await reviews.review(manifest, { interactive: true, ask: async () => 'review detail' });
  registry.register(manifest, { origin, addresses: ['127.0.0.1'] });
  const steps = [{ id: 'detail', manifestDigest: manifestHash(manifest), inputs: { id: { source: 'input', name: 'task' } } }];
  try {
    const first = await handle({ command: 'verify_chain', inputs: { task: 'a3' }, steps, expected: { '/id': 'a3' } }, registry, undefined, dir);
    expect(first).toMatchObject({ ok: true, data: { status: 'passed', chainDigest: expect.stringMatching(/^[a-f0-9]{64}$/), manifestDigest: manifestHash(manifest) } });
    const changed = await handle({ command: 'verify_chain', inputs: { task: 'a3' }, steps: [{ ...steps[0], inputs: { id: { source: 'literal', value: 'a3' } } }], expected: { '/id': 'wrong' } }, registry, undefined, dir);
    expect(changed).toMatchObject({ ok: true, data: { status: 'failed' } });
    const reports = await Promise.all((await readdir(join(dir, 'verification'))).map(async name => JSON.parse(await readFile(join(dir, 'verification', name), 'utf8'))));
    expect(new Set(reports.map(report => report.chainDigest)).size).toBe(2);
    expect(JSON.stringify(reports)).not.toContain('"task":"a3"');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
