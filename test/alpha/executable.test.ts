import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
it('provides discovery through a compiled executable without tsx', async () => {
  const result = await execute(process.execPath, ['dist/src/cli.js', 'commands']);
  expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 1, ok: true, data: { commands: expect.any(Array) } });
  expect(result.stderr).toBe('');
});
it('invalid commands return a JSON error and meaningful exit code', async () => {
  const error = await execute(process.execPath, ['dist/src/cli.js', 'SECRET_CANARY']).catch(error => error);
  expect(error.code).toBe(2);
  expect(JSON.parse(error.stdout)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  expect(error.stdout + error.stderr).not.toContain('SECRET_CANARY');
});
it('accepts file-based agent calls without shell JSON quoting', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-agent-input-'));
  try {
    const file = join(dir, 'command.json');
    await writeFile(file, '{"command":"commands"}');
    const result = await execute(process.execPath, ['dist/src/cli.js', 'call-file', file]);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, schemaVersion: 1 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('keeps runtime JSON under the documented budget', async () => {
  const result = await execute(process.execPath, ['dist/src/cli.js', 'schema']);
  expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32769);
  expect(JSON.parse(result.stdout).ok).toBe(true);
});
