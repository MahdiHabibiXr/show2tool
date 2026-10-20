import { it, expect } from 'vitest';
import { inspectRecording } from '../../spike/inspect.js';
it('groups endpoints without returning approved private scalar values', () => {
  const report = inspectRecording([
    { id: 'request:0', method: 'GET', path: '/api/tasks', queryKeys: ['q'], status: 200, shape: { items: ['object'] }, approvedQuery: { q: 'PRIVATE' } },
    { id: 'request:1', method: 'GET', path: '/api/tasks', queryKeys: ['q'], status: 0, shape: null, omittedReason: 'incomplete' },
  ]);
  expect(report).toEqual({ complete: false, requestCount: 2, endpoints: [{ method: 'GET', path: '/api/tasks', count: 2, queryKeys: ['q'], incomplete: 1, statuses: [0, 200] }] });
  expect(JSON.stringify(report)).not.toContain('PRIVATE');
});
it('rejects malformed recording without echoing its contents', () => {
  expect(() => inspectRecording({ secret: 'CANARY' })).toThrow('invalid recording');
  expect(() => inspectRecording([{ method: 'GET', path: '\u001b[2J', queryKeys: [], status: 200 }])).toThrow('invalid recording');
});
it('does not infer complete evidence from an empty recording', () => {
  expect(inspectRecording([]).complete).toBe(false);
});
