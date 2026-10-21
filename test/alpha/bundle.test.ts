import { it, expect } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handle } from '../../src/app/handlers.js';
import { ReviewStore, manifestHash } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
it('exports credential-free definitions and imports without execution grants', async () => {
  const source = await mkdtemp(join(tmpdir(), 'show2tool-bundle-source-'));
  const recipient = await mkdtemp(join(tmpdir(), 'show2tool-bundle-recipient-'));
  const reviews = new ReviewStore(); const registry = new WorkflowRegistry(reviews);
  const manifest = { schemaVersion: 1, id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  try {
    await reviews.review(manifest, { interactive: true, ask: async () => 'review catalog' });
    registry.register(manifest, { origin: manifest.origin });
    const exported = await handle({ command: 'export_bundle', ids: ['catalog'] }, registry, undefined, source);
    expect(exported).toMatchObject({ ok: true, data: { schemaVersion: 1, kind: 'show2tool-read-bundle', tools: [manifest] } });
    if (!exported.ok) throw new Error('export failed');
    const fresh = new WorkflowRegistry(new ReviewStore());
    expect(await handle({ command: 'import_bundle', bundle: exported.data }, fresh, undefined, recipient)).toMatchObject({ ok: true, data: { imported: [{ id: 'catalog', digest: manifestHash(manifest) }], permissionGranted: false } });
    expect(await handle({ command: 'run', id: 'catalog', inputs: {} }, fresh)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
    expect(JSON.parse(await readFile(join(recipient, 'tools', `catalog-${manifestHash(manifest)}.json`), 'utf8'))).toEqual(manifest);
    expect(await handle({ command: 'import_bundle', bundle: { ...(exported.data as object), cookies: { session: 'SECRET' } } }, fresh, undefined, recipient)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const huge = { ...manifest, id: 'huge', query: Object.fromEntries(Array.from({ length: 160 }, (_, index) => [`field${index}`, { source: 'literal', value: 'x'.repeat(200) }])) };
    expect(await handle({ command: 'import_bundle', bundle: { schemaVersion: 1, kind: 'show2tool-read-bundle', tools: [{ ...manifest, id: 'not_written' }, huge] } }, fresh, undefined, recipient)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    await expect(access(join(recipient, 'tools', `not_written-${manifestHash({ ...manifest, id: 'not_written' })}.json`))).rejects.toThrow();
  } finally { await rm(source, { recursive: true, force: true }); await rm(recipient, { recursive: true, force: true }); }
});
