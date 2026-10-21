import { createInterface } from 'node:readline/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixture } from '../spike/fixture/server.js';
import { SyntheticMutations } from '../spike/mutations.js';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.log(JSON.stringify({ schemaVersion: 1, ok: false, error: { code: 'REVIEW_REQUIRED' }, fixtureStarted: false, writes: 0 }));
  process.exitCode = 3;
} else {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let fixture: Awaited<ReturnType<typeof startFixture>> | undefined;
  let directory: string | undefined;
  try {
    console.log('Synthetic temporary data only. This probe creates at most one test task after exact human approval. No external accounts.');
    fixture = await startFixture();
    directory = await mkdtemp(join(tmpdir(), 'show2tool-guarded-human-'));
    const coordinator = new SyntheticMutations(directory, { cookie: 'session=FIXTURE_COOKIE_CANARY_A' });
    const title = 'human guarded probe';
    const contract = { schemaVersion: 1, id: 'create_probe', origin: fixture.origin, effect: 'create', method: 'POST', path: '/api/tasks', inputs: { title: { type: 'string', maxLength: 100 } }, body: { title: { source: 'input', name: 'title' } }, principal: { path: '/api/me', pointer: '/tenant' }, csrf: { path: '/api/csrf', pointer: '/token', header: 'x-csrf-token' }, readBack: { path: '/api/tasks/{createdId}', idSource: '/id', expected: { '/title': { source: 'input', name: 'title' }, '/tenant': { source: 'principal' } } } };
    const intent = await coordinator.prepare(contract, { title });
    const approved = await coordinator.approve(intent.id, { interactive: true, ask: prompt => terminal.question(prompt) });
    if (!approved) console.log(JSON.stringify({ schemaVersion: 1, ok: true, data: { status: 'denied', synthetic: true, writes: fixture.readState().writes } }));
    else {
      const result = await coordinator.dispatch(intent.id);
      const state = fixture.readState();
      const correct = result.status === 'confirmed' && state.writes === 1 && state.tasks.filter(task => task.title === title && task.tenant === 'A').length === 1;
      console.log(JSON.stringify({ schemaVersion: 1, ok: correct, data: { status: result.status, synthetic: true, writes: state.writes, independentlyChecked: correct } }));
      if (!correct) process.exitCode = 4;
    }
  } catch { console.error('Guarded synthetic probe failed; no automatic retry was attempted.'); process.exitCode = 4; }
  finally { terminal.close(); await fixture?.close(); if (directory) await rm(directory, { recursive: true, force: true }); }
}
