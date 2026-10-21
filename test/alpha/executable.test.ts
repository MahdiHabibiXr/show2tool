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
it('produces candidate output that can be saved and loaded for human review', async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { parseReviewArtifact, ReviewStore } = await import('../../src/approval/review.js');
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-review-artifact-'));
  try {
    const input = join(dir, 'compile.json');
    const output = join(dir, 'candidate.json');
    await writeFile(input, JSON.stringify({
      command: 'candidate',
      specification: { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: { search: { type: 'string', maxLength: 50 } }, projection: ['/items'] },
      demonstrations: ['first', 'second'].map((value, index) => ({ inputs: { search: value }, request: { id: String(index), method: 'GET', path: '/catalog', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: value } } })),
    }));
    const result = await execute(process.execPath, ['dist/src/cli.js', 'call-file', input]);
    await writeFile(output, result.stdout);
    const manifest = parseReviewArtifact(await readFile(output, 'utf8'));
    expect(manifest.id).toBe('catalog');
    expect(manifest.query).toEqual({ term: { source: 'input', name: 'search' } });
    expect(() => new ReviewStore().require(manifest)).toThrow('REVIEW_REQUIRED');
    expect(result.stderr).toBe('');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('keeps runtime JSON under the documented budget', async () => {
  const result = await execute(process.execPath, ['dist/src/cli.js', 'schema']);
  expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(32769);
  expect(JSON.parse(result.stdout).ok).toBe(true);
});
