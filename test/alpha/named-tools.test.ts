import { it, expect } from 'vitest';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { handle } from '../../src/app/handlers.js';
it('binds named tool discovery to the reviewed manifest and rejects stale contracts', async () => {
  const manifest = { schemaVersion: 1, id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: { search: { type: 'string', maxLength: 20 } }, query: { term: { source: 'input', name: 'search' } }, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews);
  await reviews.review(manifest, { interactive: true, ask: async () => 'review catalog' });
  registry.register(manifest, { origin: manifest.origin });
  const listed = await handle({ command: 'tools' }, registry);
  expect(listed).toMatchObject({ ok: true, data: { tools: [{ id: 'catalog', manifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/), inputs: manifest.inputs }] } });
  if (!listed.ok) throw new Error('listing failed');
  const digest = (listed.data as { tools: { manifestDigest: string }[] }).tools[0].manifestDigest;
  const changed = { ...manifest, path: '/other' };
  await reviews.review(changed, { interactive: true, ask: async () => 'review catalog' });
  registry.register(changed, { origin: manifest.origin });
  expect(await handle({ command: 'run', id: 'catalog', inputs: { search: 'x' }, manifestDigest: digest }, registry)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
});
