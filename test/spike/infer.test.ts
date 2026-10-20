import { it, expect } from 'vitest';
import { infer } from '../../spike/infer.js';
it('maps varying query with evidence from both demonstrations', () => {
  expect(infer([
    { inputs: { query: 'alpha' }, approvedSlots: { q: 'alpha' } },
    { inputs: { query: 'beta' }, approvedSlots: { q: 'beta' } },
  ])).toEqual({ bindings: [{ slot: 'q', input: 'query', evidence: ['demo:0', 'demo:1'] }], unresolved: [] });
});
it('blocks ambiguous mappings instead of selecting the first', () => {
  const result = infer([
    { inputs: { query: 'alpha', title: 'alpha' }, approvedSlots: { q: 'alpha' } },
    { inputs: { query: 'beta', title: 'beta' }, approvedSlots: { q: 'beta' } },
  ]);
  expect(result.bindings).toEqual([]);
  expect(result.unresolved).toEqual(['q']);
});
it('does not treat unchanged values as generalized inputs', () => {
  expect(infer([
    { inputs: { query: 'alpha' }, approvedSlots: { q: 'alpha' } },
    { inputs: { query: 'alpha' }, approvedSlots: { q: 'alpha' } },
  ]).unresolved).toEqual(['q']);
});
