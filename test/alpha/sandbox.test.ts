import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
it('creates a read-only sandbox workspace without overwriting existing evidence', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'show2tool-sandbox-'));
  const dir = join(parent, 'workspace');
  try {
    const run = () => promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/sandbox.ts', '--prepare-only', dir]);
    const result = await run();
    const ready = JSON.parse(result.stdout);
    expect(ready).toMatchObject({ status: 'prepared', synthetic: true });
    expect(JSON.parse(await readFile(join(dir, 'scope.json'), 'utf8'))).toMatchObject({ origin: expect.stringMatching(/^http:\/\/127\.0\.0\.1:/), paths: ['/api/tasks'], cookieNames: ['session'], addresses: ['127.0.0.1'] });
    expect(JSON.parse(await readFile(join(dir, 'verify.json'), 'utf8'))).toMatchObject({ command: 'verify', id: 'find_tasks', inputs: { search: 'gamma' }, expected: { '/items/0/id': 'a3', '/items/0/tenant': 'A', '/items/length': 1 } });
    await expect(run()).rejects.toMatchObject({ code: 1 });
    expect(await readdir(dir)).toContain('scope.json');
  } finally { await rm(parent, { recursive: true, force: true }); }
});
