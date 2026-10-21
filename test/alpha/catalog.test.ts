import { it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SavedToolCatalog } from '../../src/app/catalog.js';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';

const manifest = { schemaVersion: 1, id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };

it('retains a saved definition across restart but not its execution permission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-catalog-'));
  try {
    const catalog = new SavedToolCatalog(dir);
    expect(await catalog.list()).toEqual([]);
    const saved = await catalog.save(manifest);
    const restarted = new SavedToolCatalog(dir);
    expect(await restarted.list()).toEqual([{ id: 'catalog', digest: saved.digest, origin: 'https://example.com', path: '/catalog' }]);
    const loaded = await restarted.load('catalog');
    expect(loaded).toEqual(manifest);
    const reviews = new ReviewStore();
    const registry = new WorkflowRegistry(reviews);
    expect(() => registry.register(loaded, { origin: manifest.origin })).toThrow('REVIEW_REQUIRED');
    await expect(registry.run('catalog', {})).rejects.toThrow('REVIEW_REQUIRED');
    expect(await reviews.review(loaded, { interactive: true, ask: async () => 'review catalog' })).toBe(true);
    registry.register(loaded, { origin: manifest.origin });
    expect(registry.list()).toEqual([{ id: 'catalog', effect: 'read', inputs: {}, manifestDigest: saved.digest }]);
    const files = await readdir(join(dir, 'tools'));
    expect(files).toHaveLength(1);
    expect(JSON.parse(await readFile(join(dir, 'tools', files[0]), 'utf8'))).toEqual(manifest);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('executes a saved definition after restart only after re-review against current scope', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ items: ['independent saved-tool result'] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-catalog-runtime-'));
  try {
    await new SavedToolCatalog(dir).save({ ...manifest, origin });
    const loaded = await new SavedToolCatalog(dir).load('catalog');
    const reviews = new ReviewStore();
    const registry = new WorkflowRegistry(reviews);
    await expect(registry.run('catalog', {})).rejects.toThrow('REVIEW_REQUIRED');
    await reviews.review(loaded, { interactive: true, ask: async () => 'review catalog' });
    expect(() => registry.register(loaded, { origin, paths: ['/other'] })).toThrow('REVIEW_REQUIRED');
    registry.register(loaded, { origin, paths: ['/catalog'], addresses: ['127.0.0.1'] });
    expect(await registry.run('catalog', {})).toEqual({ '/items': ['independent saved-tool result'] });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

it('keeps distinct versions and requires an explicit digest when an id is ambiguous', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-catalog-'));
  try {
    const catalog = new SavedToolCatalog(dir);
    const first = await catalog.save(manifest);
    expect(await catalog.save(manifest)).toEqual(first);
    const second = await catalog.save({ ...manifest, path: '/other' });
    expect(second.digest).not.toBe(first.digest);
    expect(await catalog.list()).toHaveLength(2);
    await expect(catalog.load('catalog')).rejects.toThrow('SAVED_TOOL_AMBIGUOUS');
    expect(await catalog.load('catalog', first.digest)).toEqual(manifest);
    expect(await catalog.load('catalog', second.digest)).toMatchObject({ path: '/other' });
    await expect(catalog.load('missing')).rejects.toThrow('SAVED_TOOL_NOT_FOUND');
    await expect(catalog.load('../escape')).rejects.toThrow();
    await expect(catalog.load('catalog', '../escape')).rejects.toThrow();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('keeps valid tools discoverable when another saved file is corrupt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-catalog-'));
  try {
    const catalog = new SavedToolCatalog(dir);
    const saved = await catalog.save(manifest);
    await writeFile(join(dir, 'tools', `broken-${'0'.repeat(64)}.json`), '{');
    expect(await catalog.list()).toEqual([{ id: 'catalog', digest: saved.digest, origin: manifest.origin, path: '/catalog' }]);
    expect(await catalog.load('catalog')).toEqual(manifest);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('recovers a corrupt entry when explicitly saving the validated definition again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-catalog-'));
  try {
    const catalog = new SavedToolCatalog(dir);
    const saved = await catalog.save(manifest);
    await writeFile(join(dir, 'tools', `catalog-${saved.digest}.json`), '{');
    expect(await catalog.save(manifest)).toEqual(saved);
    expect(await catalog.load('catalog')).toEqual(manifest);
    const files = await readdir(join(dir, 'tools'));
    expect(files.some(file => file.endsWith('.invalid'))).toBe(true);
    expect(files.some(file => file.endsWith('.tmp'))).toBe(false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('rejects invalid definitions and detects modified saved contents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-catalog-'));
  try {
    const catalog = new SavedToolCatalog(dir);
    await expect(catalog.save({ ...manifest, approved: true })).rejects.toThrow();
    await expect(catalog.save({ ...manifest, method: 'POST', effect: 'create' })).rejects.toThrow('UNSUPPORTED_FEATURE');
    const saved = await catalog.save(manifest);
    await writeFile(join(dir, 'tools', `catalog-${saved.digest}.json`), JSON.stringify({ ...manifest, path: '/tampered' }));
    await expect(catalog.load('catalog', saved.digest)).rejects.toThrow('INVALID_SAVED_TOOL');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
