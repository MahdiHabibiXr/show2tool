import { createInterface } from 'node:readline/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixture } from './fixture/server.js';
import { createIntentStore, dispatchFixtureWrite } from './intents.js';
import { createJournal } from './journal.js';
import { approveIntent } from './approve.js';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Interactive terminal required; no request was sent.');
  process.exitCode = 2;
} else {
  const app = await startFixture();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-manual-'));
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Synthetic local test only. Creates one temporary test task. No real accounts.');
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'human-confirmed synthetic task' }, 'tenant:A', app.origin);
    const accepted = await approveIntent(store, intent, { interactive: true, ask: prompt => terminal.question(prompt) });
    if (!accepted) console.log('Denied; writes:', app.readState().writes);
    else {
      const journal = await createJournal(join(dir, 'journal.json'));
      const outcome = await dispatchFixtureWrite(app.origin, store, intent, { bearer: 'FIXTURE_BEARER_CANARY_A' }, journal);
      console.log('Outcome:', outcome.status, 'writes:', app.readState().writes);
    }
  } finally { terminal.close(); await app.close(); await rm(dir, { recursive: true, force: true }); }
}
