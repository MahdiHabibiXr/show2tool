import { it, expect } from 'vitest';
import { compileTool, materialize } from '../../src/workflow/candidate.js';
import { manifestSchema } from '../../src/contracts/manifest.js';
const demos = [
  { inputs: { searchText: 'alpha' }, request: { id: 'a', method: 'GET', path: '/catalog/search', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: 'alpha' } } },
  { inputs: { searchText: 'beta' }, request: { id: 'b', method: 'GET', path: '/catalog/search', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: 'beta' } } },
];
const specification = { id: 'find_catalog', origin: 'https://example.com', method: 'GET', path: '/catalog/search', effect: 'read', inputs: { searchText: { type: 'string', maxLength: 100 } }, projection: ['/items'] };
it('compiles evidence bindings that actually control a new outgoing request', () => {
  const manifest = compileTool(demos, specification);
  expect(manifest.query).toEqual({ term: { source: 'input', name: 'searchText' } });
  expect(materialize(manifest, { searchText: 'gamma & delta' })).toMatchObject({ method: 'GET', url: 'https://example.com/catalog/search?term=gamma+%26+delta' });
});
it('blocks missing or incomplete evidence', () => {
  expect(() => compileTool([demos[0], { ...demos[1], request: { ...demos[1].request, omittedReason: 'incomplete' } }], specification)).toThrow('INCOMPLETE_EVIDENCE');
});
it('rejects unknown manifest keys and dynamic destinations', () => {
  const manifest = compileTool(demos, specification);
  expect(manifestSchema.safeParse({ ...manifest, javascript: 'run' }).success).toBe(false);
  expect(() => materialize(manifest, { searchText: 'x', origin: 'https://evil.invalid' })).toThrow('INVALID_INPUT');
});
it('does not discard unexplained varying request parameters', () => {
  const different = demos.map((demo, index) => ({ ...demo, request: { ...demo.request, approvedQuery: { ...demo.request.approvedQuery, nonce: String(index) }, queryKeys: ['term', 'nonce'] } }));
  expect(() => compileTool(different, specification)).toThrow('AMBIGUOUS_BINDING');
});
it('does not accept a mutation-shaped GET as an executable read candidate', () => {
  const manifest = compileTool(demos, { ...specification, effect: 'create' });
  expect(() => materialize(manifest, { searchText: 'gamma' })).toThrow('UNSUPPORTED_FEATURE');
});
it('rejects declared inputs without changing evidence instead of silently freezing them', () => {
  const unchanged = [demos[0], { ...demos[0], request: { ...demos[0].request, id: 'b' } }];
  expect(() => compileTool(unchanged, specification)).toThrow('AMBIGUOUS_BINDING');
});
