import { it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SavedChains } from '../../src/app/chains.js';
import { handle } from '../../src/app/handlers.js';
const definition = { schemaVersion: 1, id: 'chain', inputs: {}, steps: [{ id: 'tool', manifestDigest: '0'.repeat(64), inputs: {} }] };
it('publishes concurrent identical saves once and detects modified contents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-chain-storage-'));
  try {
    const catalog = new SavedChains(dir);
    const saves = await Promise.all([catalog.save(definition), catalog.save(definition)]);
    expect(saves[0]).toEqual(saves[1]);
    expect(await catalog.list()).toHaveLength(1);
    await writeFile(join(dir, 'chains', `chain-${saves[0].digest}.json`), JSON.stringify({ ...definition, id: 'changed' }));
    await expect(catalog.load('chain', saves[0].digest)).rejects.toThrow();
    expect(await catalog.list()).toEqual([]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('pages saved chain descriptors within the IPC output budget', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-chain-pages-'));
  try {
    const catalog = new SavedChains(dir);
    const inputs = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`field_${index}_${'x'.repeat(50)}`, { type: 'string', maxLength: 200 }]));
    for (let index = 0; index < 25; index++) await catalog.save({ ...definition, id: `chain_${index}`, inputs });
    let offset: number | null = 0;
    const ids = new Set<string>();
    while (offset !== null) {
      const result = await handle({ command: 'chains', offset }, undefined, undefined, dir);
      expect(result.ok).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(32768);
      if (!result.ok) throw new Error('page failed');
      const page = result.data as { chains: { id: string }[]; nextOffset: number | null };
      page.chains.forEach(chain => ids.add(chain.id)); offset = page.nextOffset;
    }
    expect(ids.size).toBe(25);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
