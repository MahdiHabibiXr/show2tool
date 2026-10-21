import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
export async function acquireOwnership(dir: string): Promise<{ release(): Promise<void> }> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, 'owner.lock');
  const token = randomUUID();
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch { throw new Error('BROKER_ALREADY_RUNNING'); }
  await file.writeFile(JSON.stringify({ pid: process.pid, token }), 'utf8');
  await file.sync();
  await file.close();
  return { async release() {
    const existing = JSON.parse(await readFile(path, 'utf8'));
    if (existing.token !== token) throw new Error('OWNERSHIP_CHANGED');
    await unlink(path);
  } };
}
