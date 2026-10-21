import { it, expect } from 'vitest';
import { compileTool, materialize } from '../../src/workflow/candidate.js';
import { assertDestination } from '../../src/runtime/policy.js';
import { scopeSchema } from '../../src/browser/session.js';
it('learns reviewed path segments from two demonstrations and rejects path escape inputs', () => {
  const specification = { id: 'detail', origin: 'https://example.com', method: 'GET', path: '/api/tasks/{taskId}', effect: 'read', inputs: { taskId: { type: 'string', maxLength: 50 } }, projection: ['/id'] };
  const demos = ['a1', 'a2'].map((id, index) => ({ inputs: { taskId: id }, request: { id: String(index), method: 'GET', path: `/api/tasks/${id}`, status: 200, shape: {}, queryKeys: [], approvedQuery: {} } }));
  const manifest = compileTool(demos, specification);
  expect(materialize(manifest, { taskId: 'a3' }).url).toBe('https://example.com/api/tasks/a3');
  for (const taskId of ['..', '.', '../private', 'a/b', 'a%2fb', '?x=1', '', 'https://evil.invalid', '\\private']) expect(() => materialize(manifest, { taskId })).toThrow('INVALID_INPUT');
  const grant = { origin: specification.origin, paths: ['/api/tasks/{taskId}'] };
  expect(() => assertDestination(new URL('https://example.com/api/tasks/a3'), ['8.8.8.8'], grant)).not.toThrow();
  expect(() => assertDestination(new URL('https://example.com/api/tasks/a3/private'), ['8.8.8.8'], grant)).toThrow('REVIEW_REQUIRED');
  expect(() => assertDestination(new URL('https://example.com/api/tasks/a%2fb'), ['8.8.8.8'], grant)).toThrow('REVIEW_REQUIRED');
  expect(scopeSchema.safeParse({ ...grant, queryKeys: [], bodyKeys: [], cookieNames: [] }).success).toBe(true);
});
it('rejects path evidence that does not match the labelled input', () => {
  const specification = { id: 'detail', origin: 'https://example.com', method: 'GET', path: '/api/tasks/{taskId}', effect: 'read', inputs: { taskId: { type: 'string', maxLength: 50 } }, projection: ['/id'] };
  const demos = ['a1', 'a2'].map((id, index) => ({ inputs: { taskId: id }, request: { id: String(index), method: 'GET', path: '/api/tasks/unrelated', status: 200, shape: {}, queryKeys: [] } }));
  expect(() => compileTool(demos, specification)).toThrow('INVALID_INPUT');
});
