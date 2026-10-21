import { it, expect } from 'vitest';
import { mutationSchema, prepareMutation } from '../../src/contracts/mutation.js';
const create = { schemaVersion: 1, id: 'create_task', origin: 'https://example.com', effect: 'create', method: 'POST', path: '/tasks', inputs: { title: { type: 'string', maxLength: 100 } }, body: { title: { source: 'input', name: 'title' } }, principal: { path: '/me', pointer: '/tenant' }, csrf: { path: '/csrf', pointer: '/token', header: 'x-csrf-token' }, readBack: { path: '/tasks/{createdId}', idSource: '/id', expected: { '/title': { source: 'input', name: 'title' }, '/tenant': { source: 'principal' } } } };
it('resolves a bounded create proposal without making a request', () => {
  expect(prepareMutation(create, { title: 'new title' }, { principal: 'tenant_A' })).toMatchObject({ principal: 'tenant_A', method: 'POST', url: 'https://example.com/tasks', body: { title: 'new title' }, manifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(() => prepareMutation(create, { title: 'x'.repeat(101) }, { principal: 'tenant_A' })).toThrow();
});
it('requires a server precondition for updates and explicit independently checkable read-back', () => {
  const update = { ...create, id: 'update_task', effect: 'update', method: 'PATCH', path: '/tasks/{taskId}', inputs: { ...create.inputs, taskId: { type: 'string', maxLength: 50 } }, precondition: { path: '/tasks/{taskId}', pointer: '/version', header: 'if-match' }, readBack: { path: '/tasks/{taskId}', expected: create.readBack.expected } };
  expect(mutationSchema.safeParse(update).success).toBe(true);
  expect(prepareMutation(update, { title: 'new', taskId: 'a1' }, { principal: 'tenant_A', precondition: '2' })).toMatchObject({ method: 'PATCH', url: 'https://example.com/tasks/a1', precondition: '2' });
  expect(mutationSchema.safeParse({ ...update, precondition: undefined }).success).toBe(false);
  expect(mutationSchema.safeParse({ ...create, readBack: { ...create.readBack, expected: {} } }).success).toBe(false);
  expect(mutationSchema.safeParse({ ...create, method: 'DELETE' }).success).toBe(false);
  expect(mutationSchema.safeParse({ ...create, body: { title: { source: 'input', name: 'missing' } } }).success).toBe(false);
  expect(mutationSchema.safeParse({ ...create, principal: { path: '/me/{missing}', pointer: '/tenant' } }).success).toBe(false);
  expect(mutationSchema.safeParse({ ...create, csrf: { ...create.csrf, header: 'authorization' } }).success).toBe(false);
  expect(() => prepareMutation(update, { title: 'new', taskId: '../private' }, { principal: 'tenant_A', precondition: '2' })).toThrow('INVALID_INPUT');
  expect(() => prepareMutation(update, { title: 'new', taskId: 'a1' }, { principal: 'tenant_A', precondition: '*' })).toThrow();
  const auxiliary = { ...create, inputs: { ...create.inputs, tenantId: { type: 'string', maxLength: 50 } }, principal: { path: '/tenants/{tenantId}', pointer: '/tenant' } };
  expect(() => prepareMutation(auxiliary, { title: 'new', tenantId: '../private' }, { principal: 'tenant_A' })).toThrow('INVALID_INPUT');
});
