import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SavedToolCatalog } from '../../src/app/catalog.js';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { handleConsoleCommand } from '../../src/browser/console.js';

const manifest = { schemaVersion: 1, id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };

it('saves reviewed files and reloads them only after a fresh human confirmation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-console-'));
  try {
    const file = join(dir, 'candidate.json');
    await writeFile(file, JSON.stringify({ schemaVersion: 1, ok: true, data: manifest, meta: { complete: true } }));
    const catalog = new SavedToolCatalog(dir);
    const scope = { origin: manifest.origin, paths: ['/catalog'] };
    const reviews = new ReviewStore();
    const registry = new WorkflowRegistry(reviews);
    const context = { catalog, scope, reviews, registry, terminal: { interactive: true, ask: async () => 'review catalog' } };
    expect(await handleConsoleCommand(`review ${file}`, context)).toContain('saved');
    expect(await catalog.list()).toHaveLength(1);
    const freshReviews = new ReviewStore();
    const freshRegistry = new WorkflowRegistry(freshReviews);
    const restarted = { ...context, reviews: freshReviews, registry: freshRegistry };
    expect(await handleConsoleCommand('saved', restarted)).toContain('catalog');
    expect(freshRegistry.list()).toEqual([]);
    expect(await handleConsoleCommand('load catalog', { ...restarted, terminal: { interactive: true, ask: async () => 'deny' } })).toBe('Not granted.');
    expect(freshRegistry.list()).toEqual([]);
    expect(await handleConsoleCommand('load catalog', restarted)).toContain('registered');
    expect(freshRegistry.list()).toHaveLength(1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('does not save denied or out-of-scope definitions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-console-'));
  try {
    const file = join(dir, 'candidate.json');
    await writeFile(file, JSON.stringify(manifest));
    const catalog = new SavedToolCatalog(dir);
    const reviews = new ReviewStore();
    const registry = new WorkflowRegistry(reviews);
    const context = { catalog, reviews, registry, scope: { origin: manifest.origin, paths: ['/other'] }, terminal: { interactive: true, ask: async () => 'review catalog' } };
    expect(await handleConsoleCommand(`review ${file}`, context)).toContain('failed');
    expect(await catalog.list()).toEqual([]);
    expect(registry.list()).toEqual([]);
    expect(await handleConsoleCommand(`review ${file}`, { ...context, scope: { origin: manifest.origin }, terminal: { interactive: true, ask: async () => 'deny' } })).toBe('Not granted.');
    expect(await catalog.list()).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('explains ambiguous saved versions and supports explicitly selecting a digest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-console-'));
  try {
    const catalog = new SavedToolCatalog(dir);
    const first = await catalog.save(manifest);
    await catalog.save({ ...manifest, path: '/other' });
    const reviews = new ReviewStore();
    const registry = new WorkflowRegistry(reviews);
    const context = { catalog, reviews, registry, scope: { origin: manifest.origin }, terminal: { interactive: true, ask: async () => 'review catalog' } };
    expect(await handleConsoleCommand('load catalog', context)).toContain('digest');
    expect(registry.list()).toEqual([]);
    expect(await handleConsoleCommand(`load catalog ${first.digest}`, context)).toContain('registered');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
