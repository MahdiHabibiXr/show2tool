import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('refuses to grant scope from a noninteractive process', async () => {
  const error = await promisify(execFile)(process.execPath, ['dist/src/cli.js', 'host', 'SECRET_PATH']).catch(error => error);
  expect(error.code).toBe(3);
  expect(JSON.parse(error.stdout)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
  expect(error.stdout + error.stderr).not.toContain('SECRET_PATH');
});
