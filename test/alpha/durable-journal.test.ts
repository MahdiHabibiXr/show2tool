import { it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DurableJournal } from '../../src/approval/journal.js';
it('recovers orphaned dispatches as unknown without storing request bodies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-durable-'));
  try {
    const path = join(dir, 'journal.jsonl');
    const journal = await DurableJournal.open(path);
    await journal.record('intent-1', 'dispatching', 'digest-1');
    await journal.close();
    const recovered = await DurableJournal.open(path);
    expect(recovered.status('intent-1')).toEqual({ state: 'unknown', digest: 'digest-1' });
    expect(await readFile(path, 'utf8')).not.toContain('cookie');
    await recovered.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('fails closed on corrupt or incomplete durable data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-corrupt-'));
  try {
    const path = join(dir, 'journal.jsonl');
    await writeFile(path, '{"partial":true');
    await expect(DurableJournal.open(path)).rejects.toThrow('JOURNAL_CORRUPT');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('chains synchronized records and refuses duplicate dispatch transitions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-transitions-'));
  try {
    const path = join(dir, 'journal.jsonl');
    const journal = await DurableJournal.open(path);
    await journal.record('intent-1', 'dispatching', 'digest');
    await expect(journal.record('intent-1', 'dispatching', 'digest')).rejects.toThrow('INVALID_TRANSITION');
    await journal.record('intent-1', 'confirmed', 'digest');
    await journal.close();
    const recovered = await DurableJournal.open(path);
    expect(recovered.status('intent-1')?.state).toBe('confirmed');
    await recovered.close();
    const text = await readFile(path, 'utf8');
    await writeFile(path, text.replace('confirmed', 'rejected'));
    await expect(DurableJournal.open(path)).rejects.toThrow('JOURNAL_CORRUPT');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('permits only one live writer for a journal file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'show2tool-journal-owner-'));const path=join(dir,'journal.jsonl');const journal=await DurableJournal.open(path);
  try {await expect(DurableJournal.open(path)).rejects.toThrow('JOURNAL_IN_USE');}
  finally {await journal.close();await rm(dir,{recursive:true,force:true});}
});
