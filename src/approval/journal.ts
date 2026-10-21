import { mkdir, open, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { z } from 'zod';
async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return;
  const directory = await open(path, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
const idSchema = z.string().uuid();
const recordSchema = z.object({ schemaVersion: z.literal(1), id: idSchema, status: z.enum(['dispatching', 'confirmed', 'rejected', 'unknown']) }).strict();
export class MutationJournal {
  private readonly directory: string;
  private readonly owned = new Set<string>();
  constructor(stateDir: string) { this.directory = join(stateDir, 'mutations'); }
  async claim(id: string): Promise<boolean> {
    if (!idSchema.safeParse(id).success) return false;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await syncDirectory(dirname(this.directory));
    let file;
    try { file = await open(join(this.directory, `${id}.json`), 'wx', 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error; }
    try { await file.writeFile(JSON.stringify({ schemaVersion: 1, id, status: 'dispatching' }), 'utf8'); await file.sync(); }
    finally { await file.close(); }
    await syncDirectory(this.directory);
    this.owned.add(id);
    return true;
  }
  async status(id: string): Promise<'confirmed' | 'rejected' | 'unknown' | undefined> {
    if (!idSchema.safeParse(id).success) throw new Error('INVALID_INPUT');
    let file;
    try { file = await open(join(this.directory, `${id}.json`), 'r'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    try {
      if (!(await file.stat()).isFile()) return 'unknown';
      const buffer = Buffer.alloc(1025); let size = 0;
      while (size < buffer.length) { const chunk = await file.read(buffer, size, buffer.length - size, null); if (!chunk.bytesRead) break; size += chunk.bytesRead; }
      if (size > 1024) return 'unknown';
      const parsed = recordSchema.safeParse(JSON.parse(buffer.subarray(0, size).toString('utf8')));
      if (!parsed.success || parsed.data.id !== id || parsed.data.status === 'dispatching') return 'unknown';
      return parsed.data.status;
    } catch { return 'unknown'; } finally { await file.close(); }
  }
  async finish(id: string, status: 'confirmed' | 'rejected' | 'unknown'): Promise<void> {
    idSchema.parse(id);
    if (!this.owned.delete(id)) throw new Error('INVALID_TRANSITION');
    const current = await open(join(this.directory, `${id}.json`), 'r');
    try {
      if ((await current.stat()).size > 1024) throw new Error('INVALID_TRANSITION');
      const parsed = recordSchema.safeParse(JSON.parse(await current.readFile('utf8')));
      if (!parsed.success || parsed.data.id !== id || parsed.data.status !== 'dispatching') throw new Error('INVALID_TRANSITION');
    } catch { throw new Error('INVALID_TRANSITION'); } finally { await current.close(); }
    const temporary = join(this.directory, `${id}.${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ schemaVersion: 1, id, status }), 'utf8'); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, join(this.directory, `${id}.json`));
    await syncDirectory(this.directory);
  }
}
