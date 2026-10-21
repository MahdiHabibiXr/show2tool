import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MutationJournal } from '../../src/approval/journal.js';
it('recovers a killed process at the synced dispatch boundary as unknown without reclaim', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-journal-kill-'));
  const id = randomUUID();
  const child = spawn(process.execPath, ['--import', 'tsx', 'test/helpers/mutation-journal-worker.ts', dir, id], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('worker boundary timeout')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('worker ended early')); });
      child.stdout.once('data', chunk => { clearTimeout(timer); String(chunk).includes('durable') ? resolve() : reject(new Error('unexpected boundary')); });
    });
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGKILL'); await exited;
    const journal = new MutationJournal(dir);
    expect(await journal.status(id)).toBe('unknown');
    expect(await journal.claim(id)).toBe(false);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); await rm(dir, { recursive: true, force: true }); }
});
