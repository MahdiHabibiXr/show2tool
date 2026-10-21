import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
it('accepts UTF-8 BOM command files produced by Windows PowerShell', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-bom-input-'));
  try {
    const file = join(dir, 'command.json');
    await writeFile(file, '﻿' + JSON.stringify({ command: 'commands' }) + '\r\n');
    const { stdout } = await promisify(execFile)(process.execPath, ['dist/src/cli.js', 'call-file', file]);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
