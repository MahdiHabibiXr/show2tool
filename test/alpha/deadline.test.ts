import { it, expect } from 'vitest';
import { ReviewStore, manifestHash } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
it('expires while credentials stall and never dispatches after they eventually resolve', async () => {
  const manifest = { schemaVersion: 1, id: 'slow', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  const reviews = new ReviewStore();
  await reviews.review(manifest, { interactive: true, ask: async () => 'review slow' });
  let release!: (value: Record<string, string>) => void;
  const registry = new WorkflowRegistry(reviews, () => new Promise(resolve => { release = resolve; }));
  registry.register(manifest, { origin: manifest.origin });
  const controller = new AbortController();
  const running = registry.run('slow', {}, manifestHash(manifest), controller.signal);
  await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  await expect(running).rejects.toThrow('BUDGET_EXCEEDED');
  release({});
});
