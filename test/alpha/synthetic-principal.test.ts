import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixture } from '../../spike/fixture/server.js';
import { SyntheticMutations } from '../../spike/mutations.js';
it('blocks principal changes before dispatch with zero mutation effects', async () => {
  const fixture = await startFixture(); const dir = await mkdtemp(join(tmpdir(), 'show2tool-principal-'));
  const auth = { cookie: 'session=FIXTURE_COOKIE_CANARY_A' };
  const contract = { schemaVersion: 1, id: 'create_task', origin: fixture.origin, effect: 'create', method: 'POST', path: '/api/tasks', inputs: { title: { type: 'string', maxLength: 100 } }, body: { title: { source: 'input', name: 'title' } }, principal: { path: '/api/me', pointer: '/tenant' }, csrf: { path: '/api/csrf', pointer: '/token', header: 'x-csrf-token' }, readBack: { path: '/api/tasks/{createdId}', idSource: '/id', expected: { '/title': { source: 'input', name: 'title' }, '/tenant': { source: 'principal' } } } };
  try {
    const coordinator = new SyntheticMutations(dir, auth);
    const intent = await coordinator.prepare(contract, { title: 'blocked' });
    await coordinator.approve(intent.id, { interactive: true, ask: async () => `approve ${intent.id}` });
    auth.cookie = 'session=FIXTURE_COOKIE_CANARY_B';
    await expect(coordinator.dispatch(intent.id)).rejects.toThrow('AUTH_REQUIRED');
    expect(fixture.readState().writes).toBe(0);
    await expect(coordinator.dispatch(intent.id)).rejects.toThrow('APPROVAL_REQUIRED');
  } finally { await fixture.close(); await rm(dir, { recursive: true, force: true }); }
});
