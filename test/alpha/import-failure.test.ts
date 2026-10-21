import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../../src/app/handlers.js';
it('reports bundle persistence failures without pretending no inactive definitions could have been saved', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-import-failure-'));
  try {
    await writeFile(join(dir, 'tools'), 'not a directory');
    const tool = { schemaVersion: 1, id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
    expect(await handle({ command: 'import_bundle', bundle: { schemaVersion: 1, kind: 'show2tool-read-bundle', tools: [tool] } }, undefined, undefined, dir)).toMatchObject({ ok: false, error: { code: 'DEFINITION_SAVE_FAILED', nextAction: expect.stringContaining('inactive') } });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
