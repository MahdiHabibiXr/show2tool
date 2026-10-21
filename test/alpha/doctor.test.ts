import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('reports local prerequisites without opening a browser or revealing profile paths', async () => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['dist/src/cli.js', 'doctor']);
  const result = JSON.parse(stdout);
  expect(result).toMatchObject({ schemaVersion: 1, ok: true, data: { node: { supported: true }, chrome: { available: expect.any(Boolean) }, ready: expect.any(Boolean) } });
  expect(stdout).not.toContain(process.env.USERPROFILE ?? 'SECRET_PATH_CANARY');
  expect(stderr).toBe('');
});
