import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJournal } from '../../spike/journal.js';

it('recovers a real terminated child dispatch as unknown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-crash-'));
  const path = join(dir, 'journal.json');
  const child = spawn(process.execPath, ['--import', 'tsx', 'test/helpers/crash-worker.ts', path], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('worker did not reach durable boundary')), 5000);
      child.once('error', reject);
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('worker exited before durable boundary')); });
      child.stdout.once('data', chunk => { clearTimeout(timeout); String(chunk).includes('durable') ? resolve() : reject(new Error('unexpected worker output')); });
    });
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await exited;
    const journal = await createJournal(path);
    expect(journal.state('interrupted')).toBe('unknown');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(dir, { recursive: true, force: true });
  }
});
it('preserves one actual server effect when the writer dies before acknowledgment', async () => {
  const { createServer } = await import('node:http');
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-committed-crash-'));
  const path = join(dir, 'journal.json');
  let effects = 0;
  let committed!: () => void;
  const observed = new Promise<void>(resolve => { committed = resolve; });
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/me') res.end('{"tenant":"A"}');
    else if (req.url === '/api/csrf') res.end('{"token":"fixture"}');
    else if (req.method === 'POST' && req.url === '/api/tasks') { effects++; committed(); /* Withhold acknowledgment to model connection loss. */ }
    else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', 'test/helpers/crash-write-worker.ts', path, origin], { stdio: 'ignore' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([observed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('write not observed')), 5000); })]);
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGKILL');
    await exited;
    expect(effects).toBe(1);
    const recovered = await createJournal(path);
    expect(recovered.state('crash-write')).toBe('unknown');
    expect(effects).toBe(1);
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
