import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MutationJournal } from '../../src/approval/journal.js';
it('recovers an interrupted dispatch as unknown and never permits another claim', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-mutation-journal-'));
  try {
    const id = randomUUID();
    const first = new MutationJournal(dir);
    expect(await first.claim(id)).toBe(true);
    const second = new MutationJournal(dir);
    expect(await second.status(id)).toBe('unknown');
    expect(await second.claim(id)).toBe(false);
    const text = await readFile(join(dir, 'mutations', `${id}.json`), 'utf8');
    expect(JSON.parse(text)).toEqual({ schemaVersion: 1, id, status: 'dispatching' });
    expect(await second.claim('../escape')).toBe(false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('allows one durable claim across independent journal instances and records confirmed outcome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-mutation-journal-'));
  try {
    const id = randomUUID();
    const first = new MutationJournal(dir); const second = new MutationJournal(dir);
    const results = await Promise.all([first.claim(id), second.claim(id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results[0] ? first : second;
    const loser = results[0] ? second : first;
    await expect(loser.finish(id, 'confirmed')).rejects.toThrow('INVALID_TRANSITION');
    await winner.finish(id, 'confirmed');
    await expect(winner.finish(id, 'rejected')).rejects.toThrow('INVALID_TRANSITION');
    expect(await second.status(id)).toBe('confirmed');
    expect(await second.claim(id)).toBe(false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('fails closed on corrupt or oversized journal records', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-mutation-journal-'));
  try {
    const id = randomUUID(); const journal = new MutationJournal(dir);
    await journal.claim(id);
    await writeFile(join(dir, 'mutations', `${id}.json`), '{');
    expect(await journal.status(id)).toBe('unknown');
    await expect(journal.finish(id, 'confirmed')).rejects.toThrow('INVALID_TRANSITION');
    expect(await journal.claim(id)).toBe(false);
    await writeFile(join(dir, 'mutations', `${id}.json`), 'x'.repeat(10000));
    expect(await journal.status(id)).toBe('unknown');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
