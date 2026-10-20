import { it, expect } from 'vitest';
import { createIntentStore, dispatchFixtureWrite } from '../../spike/intents.js';
import { startFixture } from '../../spike/fixture/server.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJournal } from '../../spike/journal.js';

it('requires exact confirmation and consumes it only once', () => {
  const store = createIntentStore(() => 1000);
  const intent = store.prepare({ kind: 'create', title: 'fresh' }, 'tenant:A');
  expect(() => store.consume(intent.id, intent.digest)).toThrow('not approved');
  expect(() => store.confirm(intent.id, 'changed')).toThrow('intent mismatch');
  store.confirm(intent.id, intent.digest);
  expect(store.consume(intent.id, intent.digest)).toEqual({ kind: 'create', title: 'fresh' });
  expect(() => store.consume(intent.id, intent.digest)).toThrow('not approved');
});
it('expires approval and clones prepared values', () => {
  let time = 0;
  const store = createIntentStore(() => time);
  const data = { kind: 'create', title: 'fresh' };
  const intent = store.prepare(data, 'tenant:A');
  data.title = 'tampered';
  store.confirm(intent.id, intent.digest);
  expect(store.consume(intent.id, intent.digest)).toEqual({ kind: 'create', title: 'fresh' });
  const expired = store.prepare(data, 'tenant:A');
  time = 61000;
  expect(() => store.confirm(expired.id, expired.digest)).toThrow('expired');
});
it('does not retry a committed write after connection loss', async () => {
  const app = await startFixture();
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'fresh' }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    app.setFault('drop-after-write');
    const result = await dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' });
    expect(result.status).toBe('unknown');
    expect(app.readState().writes).toBe(1);
    await expect(dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' })).rejects.toThrow('not approved');
    expect(app.readState().writes).toBe(1);
  } finally { await app.close(); }
});
it('checks principal before dispatch and verifies a successful create', async () => {
  const app = await startFixture();
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'fresh' }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    await expect(dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_B' })).rejects.toThrow('principal mismatch');
    expect(app.readState().writes).toBe(0);
    const result = await dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' });
    expect(result.status).toBe('confirmed');
    expect(app.readState().writes).toBe(1);
  } finally { await app.close(); }
});
it('recovers an interrupted dispatch as unknown without persisting its body', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-journal-'));
  try {
    const path = join(dir, 'journal.json');
    const journal = await createJournal(path);
    await journal.record('intent:1', 'dispatching');
    const recovered = await createJournal(path);
    expect(recovered.state('intent:1')).toBe('unknown');
    expect(await readFile(path, 'utf8')).not.toContain('title');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('records dispatch before sending and records unknown on lost acknowledgement', async () => {
  const app = await startFixture();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-dispatch-'));
  try {
    const journal = await createJournal(join(dir, 'journal.json'));
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'journalled' }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    app.setFault('drop-after-write');
    expect(await dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' }, journal)).toEqual({ status: 'unknown' });
    expect(journal.state(intent.id)).toBe('unknown');
    expect(app.readState().writes).toBe(1);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
it('fails closed before dispatch if durable state cannot be recorded', async () => {
  const app = await startFixture();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-failed-journal-'));
  try {
    const journal = await createJournal(join(dir, 'missing', 'journal.json'));
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'never' }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    await expect(dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' }, journal)).rejects.toThrow();
    expect(app.readState().writes).toBe(0);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
it('updates one approved record with version precondition', async () => {
  const app = await startFixture();
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'update', id: 'a1', title: 'renamed', version: 1 }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    expect(await dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' })).toEqual({ status: 'confirmed' });
    expect(app.readState().writes).toBe(1);
    expect(app.readState().tasks.find(t => t.id === 'a1')).toEqual({ id: 'a1', tenant: 'A', title: 'renamed', version: 2 });
  } finally { await app.close(); }
});
it('requires a local TTY exact phrase to confirm synthetic intent', async () => {
  const { approveIntent } = await import('../../spike/approve.js');
  const store = createIntentStore();
  const intent = store.prepare({ kind: 'create', title: 'fresh' }, 'tenant:A');
  expect(await approveIntent(store, intent, { interactive: false, ask: async () => 'approve' })).toBe(false);
  expect(await approveIntent(store, intent, { interactive: true, ask: async () => 'no' })).toBe(false);
  expect(() => store.consume(intent.id, intent.digest)).toThrow('not approved');
  expect(await approveIntent(store, intent, { interactive: true, ask: async () => `approve ${intent.id}` })).toBe(true);
  expect(store.consume(intent.id, intent.digest)).toEqual({ kind: 'create', title: 'fresh' });
});
it('shows exact target and changed values before asking confirmation', async () => {
  const { approveIntent } = await import('../../spike/approve.js');
  const store = createIntentStore();
  const intent = store.prepare({ kind: 'update', id: 'a1', title: 'visible-change', version: 1 }, 'tenant:A');
  let prompt = '';
  await approveIntent(store, intent, { interactive: true, ask: async text => { prompt = text; return 'no'; } });
  expect(prompt).toContain('visible-change');
  expect(prompt).toContain('a1');
  expect(prompt).toContain('update');
});
it('permits only one of two concurrent dispatches', async () => {
  const app = await startFixture();
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'once' }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    const outcomes = await Promise.allSettled([
      dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' }),
      dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' }),
    ]);
    expect(outcomes.filter(r => r.status === 'fulfilled'), outcomes.map(r => r.status === 'rejected' ? String(r.reason) : r.value.status).join('; ')).toHaveLength(1);
    expect(app.readState().writes).toBe(1);
  } finally { await app.close(); }
});
it('returns unknown rather than hiding a committed write behind a journal error', async () => {
  const app = await startFixture();
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'recorded' }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    const journal = { state: () => undefined, record: async (_id: string, state: string) => { if (state !== 'dispatching') throw new Error('disk failed'); } };
    expect(await dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' }, journal)).toEqual({ status: 'unknown' });
    expect(app.readState().writes).toBe(1);
  } finally { await app.close(); }
});
it('never confirms a different record returned by a mutation', async () => {
  const { createServer } = await import('node:http');
  const { registerFixture, unregisterFixture } = await import('../../spike/fixture/registry.js');
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/me') res.end('{"tenant":"A"}');
    else if (req.url === '/api/csrf') res.end('{"token":"synthetic"}');
    else if (req.method === 'PATCH') res.end('{"id":"a2"}');
    else res.end('{"id":"a2","tenant":"A","title":"beta","version":1}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  registerFixture(origin);
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'update', id: 'a1', title: 'beta', version: 1 }, 'tenant:A', origin);
    store.confirm(intent.id, intent.digest);
    expect(await dispatchFixtureWrite(origin, store, intent, { bearer: 'synthetic' })).toEqual({ status: 'unknown' });
  } finally { unregisterFixture(origin); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('binds approval to the exact fixture origin, not merely its tenant name', async () => {
  const first = await startFixture();
  const second = await startFixture();
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'only-first' }, 'tenant:A', first.origin);
    store.confirm(intent.id, intent.digest);
    await expect(dispatchFixtureWrite(second.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' })).rejects.toThrow('origin mismatch');
    expect(second.readState().writes).toBe(0);
  } finally { await first.close(); await second.close(); }
});
it('shows approved destination during human confirmation', async () => {
  const { approveIntent } = await import('../../spike/approve.js');
  const store = createIntentStore();
  const intent = store.prepare({ kind: 'create', title: 'fresh' }, 'tenant:A', 'http://127.0.0.1:1234');
  let prompt = '';
  await approveIntent(store, intent, { interactive: true, ask: async value => { prompt = value; return 'deny'; } });
  expect(prompt).toContain('http://127.0.0.1:1234');
});
it('checks current identity even after approval was prepared for another account', async () => {
  const app = await startFixture();
  try {
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'never-for-B' }, 'tenant:A', app.origin);
    store.confirm(intent.id, intent.digest);
    await expect(dispatchFixtureWrite(app.origin, store, intent, { cookie: 'session=FIXTURE_COOKIE_CANARY_B' })).rejects.toThrow('principal mismatch');
    expect(app.readState().writes).toBe(0);
  } finally { await app.close(); }
});
