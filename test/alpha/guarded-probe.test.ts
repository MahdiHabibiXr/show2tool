import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('refuses unattended guarded mutation probing before creating a fixture', async () => {
  const error = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/guarded-probe.ts']).catch(error => error);
  expect(error.code).toBe(3);
  expect(JSON.parse(error.stdout)).toMatchObject({ schemaVersion: 1, ok: false, error: { code: 'REVIEW_REQUIRED' }, fixtureStarted: false, writes: 0 });
  expect(error.stderr).toBe('');
});
