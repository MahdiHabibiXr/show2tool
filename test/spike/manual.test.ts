import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('manual write probe refuses noninteractive execution', async () => {
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'spike/manual.ts'], { timeout: 10000 }).catch(error => error);
  expect(result.code).toBe(2);
  expect(result.stderr).toContain('Interactive terminal required');
});
