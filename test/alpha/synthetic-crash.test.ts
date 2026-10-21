import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MutationJournal } from '../../src/approval/journal.js';
it('retains one independent effect after coordinator death before acknowledgment', async () => {
  let effects = 0; let commit!: () => void;
  const committed = new Promise<void>(resolve => { commit = resolve; });
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/me') response.end('{"tenant":"A"}');
    else if (request.method === 'POST' && request.url === '/api/tasks') { effects++; commit(); }
    else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-coordinator-crash-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'test/helpers/synthetic-crash-worker.ts', dir, origin], { stdio: ['ignore', 'pipe', 'pipe'] });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const intent = new Promise<string>((resolve, reject) => {
      let text = '';
      child.stdout.on('data', chunk => { text += String(chunk); if (text.includes('\n')) { try { resolve(JSON.parse(text.split('\n')[0]).intentId); } catch { reject(new Error('invalid worker output')); } } });
      child.once('error', reject);
    });
    await Promise.race([committed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('mutation not observed')), 5000); })]);
    const id = await intent;
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill('SIGKILL'); await exited;
    expect(effects).toBe(1);
    const recovered = new MutationJournal(dir);
    expect(await recovered.status(id)).toBe('unknown');
    expect(await recovered.claim(id)).toBe(false);
    expect(effects).toBe(1);
  } finally {
    if (timer) clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
