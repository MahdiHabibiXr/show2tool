import { it, expect } from 'vitest';
import { exportBundle, importBundle } from '../../src/workflow/bundle.js';
it('roundtrips versioned workflow definitions without portable execution grants', () => {
  const manifest = { schemaVersion: 1, id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  const bundle = exportBundle([manifest]);
  expect(importBundle(bundle)).toEqual([manifest]);
  expect(JSON.stringify(bundle)).not.toContain('approved');
  expect(() => importBundle({ ...bundle, approved: true })).toThrow();
  const changed = structuredClone(bundle); changed.tools[0].path = '/other';
  expect(() => importBundle(changed)).toThrow('BUNDLE_CHANGED');
});
