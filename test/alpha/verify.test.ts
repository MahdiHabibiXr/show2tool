import { it, expect } from 'vitest';
import { verifyFacts } from '../../src/runtime/verify.js';
it('checks independent projected facts rather than status or shape', () => {
  const output = { '/items': [{ id: 'book-1', title: 'Expected' }] };
  expect(verifyFacts(output, [{ pointer: '/~1items/0/id', equals: 'book-1' }])).toEqual({ passed: true, checked: 1 });
  expect(verifyFacts(output, [{ pointer: '/~1items/0/title', equals: 'Wrong' }])).toEqual({ passed: false, checked: 1 });
  expect(verifyFacts({}, [{ pointer: '/missing', equals: 'x' }])).toEqual({ passed: false, checked: 1 });
});
