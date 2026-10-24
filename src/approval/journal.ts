import { open, readFile, type FileHandle } from 'node:fs/promises';
import { acquireOwnership } from '../broker/ownership.js';
import { createHash } from 'node:crypto';
export type DispatchState = 'dispatching' | 'confirmed' | 'rejected' | 'unknown';
type RecordValue = { version: 1; sequence: number; previous: string; id: string; state: DispatchState; digest: string };
const hash = (value: RecordValue) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class DurableJournal {
  private readonly states = new Map<string, { state: DispatchState; digest: string }>();
  private sequence = 0;
  private previous = '';
  private queue = Promise.resolve();
  private poisoned = false;
  private constructor(private readonly file: FileHandle, private readonly owner: { release(): Promise<void> }) {}
  static async open(path: string): Promise<DurableJournal> {
    let owner; try { owner = await acquireOwnership(path + '.writer'); } catch { throw new Error('JOURNAL_IN_USE'); }
    let text = '';
    try {
      try { text = await readFile(path, 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (Buffer.byteLength(text) > 8 * 1024 * 1024 || (text && !text.endsWith(String.fromCharCode(10)))) throw new Error('JOURNAL_CORRUPT');
    } catch (error) { await owner.release(); throw error; }
    let file; try { file = await open(path, 'a', 0o600); } catch (error) { await owner.release(); throw error; }
    const journal = new DurableJournal(file, owner);
    try {
      for (const line of text.split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        const value: RecordValue = { version: row.version, sequence: row.sequence, previous: row.previous, id: row.id, state: row.state, digest: row.digest };
        if (Object.keys(row).length !== 7 || value.version !== 1 || value.sequence !== journal.sequence + 1 || value.previous !== journal.previous || typeof value.id !== 'string' || value.id.length > 100 || typeof value.digest !== 'string' || value.digest.length > 128 || !['dispatching', 'confirmed', 'rejected', 'unknown'].includes(value.state) || row.hash !== hash(value)) throw new Error('JOURNAL_CORRUPT');
        journal.validate(value.id, value.state, value.digest);
        journal.states.set(value.id, { state: value.state, digest: value.digest });
        journal.sequence = value.sequence; journal.previous = row.hash;
      }
      for (const [id, entry] of journal.states) if (entry.state === 'dispatching') journal.states.set(id, { ...entry, state: 'unknown' });
      return journal;
    } catch { await file.close(); await owner.release(); throw new Error('JOURNAL_CORRUPT'); }
  }
  private validate(id: string, state: DispatchState, digest: string): void {
    const old = this.states.get(id);
    if (!old && state !== 'dispatching') throw new Error('INVALID_TRANSITION');
    if (old && (!['dispatching', 'unknown'].includes(old.state) || state === 'dispatching' || (old.state === 'unknown' && state !== 'confirmed') || old.digest !== digest)) throw new Error('INVALID_TRANSITION');
  }
  hasUncertain(digest: string): boolean { return [...this.states.values()].some(entry => entry.digest === digest && ['dispatching', 'unknown'].includes(entry.state)); }
  status(id: string): { state: DispatchState; digest: string } | undefined { const value = this.states.get(id); return value && { ...value }; }
  record(id: string, state: DispatchState, digest: string): Promise<void> {
    const work = this.queue.then(async () => {
      if (this.poisoned) throw new Error('JOURNAL_UNAVAILABLE');
      this.validate(id, state, digest);
      const value: RecordValue = { version: 1, sequence: this.sequence + 1, previous: this.previous, id, state, digest };
      const checksum = hash(value);
      try { await this.file.writeFile(JSON.stringify({ ...value, hash: checksum }) + '\n', 'utf8'); await this.file.sync(); }
      catch { this.poisoned = true; throw new Error('JOURNAL_UNAVAILABLE'); }
      this.sequence++; this.previous = checksum; this.states.set(id, { state, digest });
    });
    this.queue = work.catch(() => {}); return work;
  }
  async close(): Promise<void> { await this.queue; await this.file.close(); await this.owner.release(); }
}
