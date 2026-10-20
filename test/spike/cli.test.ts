import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = (args: string[]) => promisify(execFile)(process.execPath, ['--import', 'tsx', 'spike/cli.ts', ...args], { timeout: 10000 });
it('inspects a recording through an executable local CLI', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-cli-'));
  try {
    const file = join(dir, 'capture.json');
    await writeFile(file, JSON.stringify([{ id: 'request:0', method: 'GET', path: '/api/tasks', queryKeys: ['q'], status: 200, shape: {}, approvedQuery: { q: 'PRIVATE' } }]));
    const result = await run(['inspect', file]);
    expect(JSON.parse(result.stdout).endpoints[0].path).toBe('/api/tasks');
    expect(result.stdout).not.toContain('PRIVATE');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('infers mappings from explicitly annotated demonstrations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-infer-'));
  try {
    const file = join(dir, 'demos.json');
    await writeFile(file, JSON.stringify([{ inputs: { title: 'one' }, approvedSlots: { title: 'one' } }, { inputs: { title: 'two' }, approvedSlots: { title: 'two' } }]));
    const result = await run(['infer', file]);
    expect(JSON.parse(result.stdout).bindings).toEqual([{ slot: 'title', input: 'title', evidence: ['demo:0', 'demo:1'] }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('rejects secret-bearing invalid input without printing it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-invalid-'));
  try {
    const file = join(dir, 'bad.json');
    await writeFile(file, 'SECRET_CANARY');
    const error = await run(['inspect', file]).catch(error => error);
    expect(error.code).toBe(2);
    expect(error.stderr).toContain('invalid input');
    expect(error.stderr).not.toContain('SECRET_CANARY');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
