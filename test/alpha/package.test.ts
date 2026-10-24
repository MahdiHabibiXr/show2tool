import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const exec = promisify(execFile);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run package tests through npm test.');
it('packs only distributable files and runs the compiled command from a clean location', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-package-'));
  try {
    const info = await exec(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', dir], { cwd: process.cwd(), timeout: 30000 });
    const packed = JSON.parse(info.stdout)[0];
    const files = packed.files.map((file: { path: string }) => file.path);
    expect(files).toContain('dist/src/cli.js');
    expect(files.some((path: string) => /^(\.claude|\.superpowers|profiles|test|docs\/research)\//.test(path))).toBe(false);
    // Extraction tests the packed filesystem boundary; dependencies use an explicit local link, not workspace source imports.
    await exec('tar', ['-xzf', packed.filename], { cwd: dir });
    const manifest = JSON.parse(await readFile(join(dir, 'package', 'package.json'), 'utf8'));
    expect(manifest.bin.show2tool).toBe('dist/src/cli.js');
    const { symlink } = await import('node:fs/promises');
    await symlink(resolve('node_modules'), join(dir, 'package', 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const run = await exec(process.execPath, [join(dir, 'package', 'dist', 'src', 'cli.js'), 'commands'], { cwd: dir });
    expect(JSON.parse(run.stdout)).toMatchObject({ ok: true, schemaVersion: 1 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('includes browser capture runtime dependencies in the package file allowlist', async () => {
  const result = await exec(process.execPath, [npmCli, 'pack', '--json', '--dry-run']);
  const paths = JSON.parse(result.stdout)[0].files.map((file: { path: string }) => file.path);
  expect(paths).toContain('dist/spike/capture.js');
  expect(paths).toContain('dist/spike/sanitize.js');
});
it('ships Apache license and excludes runtime state and private planning artifacts',async()=>{
  const result=await exec(process.execPath,[npmCli,'pack','--json','--dry-run']);
  const files=JSON.parse(result.stdout)[0].files.map((file:{path:string})=>file.path);
  expect(files).toContain('LICENSE');expect(files).toContain('SECURITY.md');
  expect(files.some((path:string)=>/owner\.lock|dispatch\.jsonl|\.env|profile\//.test(path))).toBe(false);
});
