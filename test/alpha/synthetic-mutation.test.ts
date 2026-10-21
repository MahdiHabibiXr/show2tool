import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startFixture } from '../../spike/fixture/server.js';
import { SyntheticMutations } from '../../spike/mutations.js';

function contract(origin: string) {
  return { schemaVersion: 1, id: 'create_task', origin, effect: 'create', method: 'POST', path: '/api/tasks', inputs: { title: { type: 'string', maxLength: 100 } }, body: { title: { source: 'input', name: 'title' } }, principal: { path: '/api/me', pointer: '/tenant' }, csrf: { path: '/api/csrf', pointer: '/token', header: 'x-csrf-token' }, readBack: { path: '/api/tasks/{createdId}', idSource: '/id', expected: { '/title': { source: 'input', name: 'title' }, '/tenant': { source: 'principal' } } } };
}
it('prepares without effects and dispatches one approved synthetic create with independent read-back', async () => {
  const fixture = await startFixture();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-synthetic-mutation-'));
  try {
    const coordinator = new SyntheticMutations(dir, { cookie: 'session=FIXTURE_COOKIE_CANARY_A' });
    const prepared = await coordinator.prepare(contract(fixture.origin), { title: 'fresh title' });
    expect(fixture.readState().writes).toBe(0);
    await expect(coordinator.dispatch(prepared.id)).rejects.toThrow('APPROVAL_REQUIRED');
    expect(fixture.readState().writes).toBe(0);
    expect(await coordinator.approve(prepared.id, { interactive: true, ask: async () => `approve ${prepared.id}` })).toBe(true);
    const concurrent = await Promise.allSettled([coordinator.dispatch(prepared.id), coordinator.dispatch(prepared.id)]);
    expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(concurrent.find(result => result.status === 'fulfilled')).toMatchObject({ value: { status: 'confirmed' } });
    expect(fixture.readState().writes).toBe(1);
    expect(fixture.readState().tasks.find(task => task.title === 'fresh title')).toMatchObject({ tenant: 'A', version: 1 });
  } finally { await fixture.close(); await rm(dir, { recursive: true, force: true }); }
});
it('updates a single synthetic task under a concrete version precondition', async () => {
  const fixture = await startFixture();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-synthetic-update-'));
  try {
    const coordinator = new SyntheticMutations(dir, { cookie: 'session=FIXTURE_COOKIE_CANARY_A' });
    const base = contract(fixture.origin);
    const update = { ...base, id: 'update_task', effect: 'update', method: 'PATCH', path: '/api/tasks/{taskId}', inputs: { ...base.inputs, taskId: { type: 'string', maxLength: 50 } }, precondition: { path: '/api/tasks/{taskId}', pointer: '/version', header: 'if-match' }, readBack: { path: '/api/tasks/{taskId}', expected: base.readBack.expected } };
    const prepared = await coordinator.prepare(update, { title: 'updated title', taskId: 'a1' });
    await coordinator.approve(prepared.id, { interactive: true, ask: async () => `approve ${prepared.id}` });
    expect(await coordinator.dispatch(prepared.id)).toMatchObject({ status: 'confirmed' });
    expect(fixture.readState().writes).toBe(1);
    expect(fixture.readState().tasks.find(task => task.id === 'a1')).toMatchObject({ title: 'updated title', version: 2 });
  } finally { await fixture.close(); await rm(dir, { recursive: true, force: true }); }
});
it('records lost acknowledgment as unknown and never resends an approved mutation', async () => {
  const fixture = await startFixture();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-synthetic-mutation-'));
  try {
    const coordinator = new SyntheticMutations(dir, { cookie: 'session=FIXTURE_COOKIE_CANARY_A' });
    const prepared = await coordinator.prepare(contract(fixture.origin), { title: 'unknown outcome' });
    await coordinator.approve(prepared.id, { interactive: true, ask: async () => `approve ${prepared.id}` });
    fixture.setFault('drop-after-write');
    expect(await coordinator.dispatch(prepared.id)).toMatchObject({ status: 'unknown' });
    expect(fixture.readState().writes).toBe(1);
    await expect(coordinator.dispatch(prepared.id)).rejects.toThrow('APPROVAL_REQUIRED');
    expect(fixture.readState().writes).toBe(1);
  } finally { await fixture.close(); await rm(dir, { recursive: true, force: true }); }
});
