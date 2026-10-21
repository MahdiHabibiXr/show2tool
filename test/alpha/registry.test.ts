import { it, expect } from 'vitest';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { ReviewStore } from '../../src/approval/review.js';
it('lists reviewed tools and blocks changed or unreviewed workflows', async () => {
  const review = new ReviewStore();
  const registry = new WorkflowRegistry(review);
  const manifest = { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', schemaVersion: 1, inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  expect(() => registry.register(manifest, { origin: 'https://example.com' })).toThrow('REVIEW_REQUIRED');
  await review.review(manifest, { interactive: true, ask: async () => 'review catalog' });
  registry.register(manifest, { origin: 'https://example.com' });
  expect(registry.list()).toEqual([expect.objectContaining({ id: 'catalog', effect: 'read', inputs: {} })]);
  await expect(registry.run('missing', {})).rejects.toThrow('REVIEW_REQUIRED');
});
it('does not expand the human browser scope when registering a workflow', async () => {
  const review = new ReviewStore();
  const registry = new WorkflowRegistry(review);
  const manifest = { id: 'other', origin: 'https://example.com', method: 'GET', path: '/private', effect: 'read', schemaVersion: 1, inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  await review.review(manifest, { interactive: true, ask: async () => 'review other' });
  expect(() => registry.register(manifest, { origin: 'https://example.com', paths: ['/catalog'] })).toThrow('REVIEW_REQUIRED');
});
it('enforces approved field names in addition to path scope', async () => {
  const review = new ReviewStore();
  const registry = new WorkflowRegistry(review);
  const manifest = { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', schemaVersion: 1, inputs: {}, query: { account: { source: 'literal', value: 'private' } }, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  await review.review(manifest, { interactive: true, ask: async () => 'review catalog' });
  expect(() => registry.register(manifest, { origin: 'https://example.com', paths: ['/catalog'], queryKeys: ['term'], bodyKeys: [] })).toThrow('REVIEW_REQUIRED');
});
