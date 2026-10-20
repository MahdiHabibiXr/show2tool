import { readFile, open, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
export type State = 'dispatching' | 'confirmed' | 'unknown';
export type Journal = { record(id: string, state: State): Promise<void>; state(id: string): State | undefined };
export async function createJournal(path: string): Promise<Journal> {
  let data: Record<string, State> = Object.create(null);
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid journal');
    for (const [id, state] of Object.entries(parsed)) {
      if (!['dispatching', 'confirmed', 'unknown'].includes(String(state))) throw new Error('invalid journal');
      data[id] = state === 'dispatching' ? 'unknown' : state as State;
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let queue = Promise.resolve();
  return {
    state: id => data[id],
    record(id, state) {
      const operation = queue.then(async () => {
        const next = Object.assign(Object.create(null), data, { [id]: state });
        const temp = `${path}.${randomUUID()}.tmp`;
        const file = await open(temp, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(next), 'utf8'); await file.sync(); }
        finally { await file.close(); }
        await rename(temp, path);
        data = next;
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
