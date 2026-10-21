import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../../src/app/handlers.js';
import { ReviewStore, manifestHash } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
it('persists reusable chain definitions without carrying execution permission across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-saved-chain-'));
  const manifest = { schemaVersion: 1, id: 'detail', origin: 'https://example.com', method: 'GET', path: '/tasks/{id}', effect: 'read', inputs: { id: { type: 'string', maxLength: 20 } }, query: {}, body: {}, projection: ['/id'], provenance: ['a', 'b'] };
  const steps = [{ id: 'detail', manifestDigest: manifestHash(manifest), inputs: { id: { source: 'input', name: 'task' } } }];
  const definition = { schemaVersion: 1, id: 'find_detail', inputs: { task: { type: 'string', maxLength: 20 } }, steps };
  const reviews = new ReviewStore(); const registry = new WorkflowRegistry(reviews);
  try {
    const saved = await handle({ command: 'save_chain', definition }, registry, undefined, dir);
    expect(saved).toMatchObject({ ok: true, data: { id: 'find_detail', digest: expect.stringMatching(/^[a-f0-9]{64}$/), permissionGranted: false } });
    if (!saved.ok) throw new Error('save failed');
    const digest = (saved.data as { digest: string }).digest;
    expect(await handle({ command: 'chain', id: 'find_detail', digest }, registry, undefined, dir)).toMatchObject({ ok: true, data: definition });
    const restarted = new WorkflowRegistry(new ReviewStore());
    expect(await handle({ command: 'chains' }, restarted, undefined, dir)).toMatchObject({ ok: true, data: { chains: [{ id: 'find_detail', digest, inputs: definition.inputs }] } });
    expect(await handle({ command: 'run_saved_chain', id: 'find_detail', digest, inputs: { task: 'a3' } }, restarted, undefined, dir)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
    expect(await handle({ command: 'verify_saved_chain', id: 'find_detail', digest, inputs: { task: 'a3' }, expected: { '/id': 'a3' } }, restarted, undefined, dir)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
    expect(await handle({ command: 'save_chain', definition: { ...definition, inputs: {} } }, registry, undefined, dir)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(await handle({ command: 'run_saved_chain', id: 'find_detail', digest, inputs: { task: 'x'.repeat(21) } }, registry, undefined, dir)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
