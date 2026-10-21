import { it, expect } from 'vitest';
import { manifestSchema } from '../../src/contracts/manifest.js';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
const base = { schemaVersion: 1, id: 'detail', origin: 'https://example.com', method: 'GET', path: '/api/tasks/a1', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/id'], provenance: ['a', 'b'] };
it('rejects undeclared template inputs at the manifest boundary', () => {
  expect(manifestSchema.safeParse({ ...base, path: '/api/tasks/{taskId}' }).success).toBe(false);
});
it('allows fixed narrower contracts under a template scope but never widens a fixed scope', async () => {
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews);
  await reviews.review(base, { interactive: true, ask: async () => 'review detail' });
  expect(() => registry.register(base, { origin: base.origin, paths: ['/api/tasks/{taskId}'] })).not.toThrow();
  const broader = { ...base, path: '/api/tasks/{id}', inputs: { id: { type: 'string', maxLength: 20 } } };
  await reviews.review(broader, { interactive: true, ask: async () => 'review detail' });
  expect(() => registry.register(broader, { origin: base.origin, paths: ['/api/tasks/a1'] })).toThrow('REVIEW_REQUIRED');
});
