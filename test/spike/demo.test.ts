import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('runs the synthetic two-demo pipeline without any writes', async () => {
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'spike/demo.ts'], { timeout: 15000 });
  const report = JSON.parse(result.stdout);
  expect(report.trainingInputs).toEqual(['alpha', 'beta']);
  expect(report.heldOutInput).toBe('gamma');
  expect(report.resultIds).toEqual(['a3']);
  expect(report.writes).toBe(0);
  expect(report.status).toBe('passed');
  expect(result.stdout).not.toContain('CANARY');
});
it('saves synthetic evidence to a new directory without overwriting files', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-evidence-'));
  const output = join(dir, 'new-evidence');
  try {
    await promisify(execFile)(process.execPath, ['--import', 'tsx', 'spike/demo.ts', '--out', output], { timeout: 15000 });
    const recording = JSON.parse(await readFile(join(output, 'recording.json'), 'utf8'));
    expect(recording).toHaveLength(2);
    expect(JSON.stringify(recording)).not.toContain('CANARY');
    const report = JSON.parse(await readFile(join(output, 'report.json'), 'utf8'));
    expect(report.resultIds).toEqual(['a3']);
    const second = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'spike/demo.ts', '--out', output], { timeout: 15000 }).catch(error => error);
    expect(second.code).toBe(1);
    expect(JSON.parse(await readFile(join(output, 'report.json'), 'utf8')).resultIds).toEqual(['a3']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
