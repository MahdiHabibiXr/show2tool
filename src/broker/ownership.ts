import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
export async function acquireOwnership(dir: string): Promise<{ release(): Promise<void> }> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const hash = createHash('sha256').update(resolve(dir).toLowerCase()).digest('hex').slice(0, 32);
  const address = process.platform === 'win32' ? `\\\\.\\pipe\\show2tool-owner-${hash}` : join(tmpdir(), `show2tool-owner-${hash}.sock`);
  const server = createServer(socket => socket.destroy());
  const token = randomUUID(); const path = join(dir, 'owner.lock');
  const listen = () => new Promise<void>((accept, reject) => {
    const error = (value: Error) => { server.off('listening', ready); reject(value); };
    const ready = () => { server.off('error', error); accept(); };
    server.once('error', error); server.once('listening', ready); server.listen(address);
  });
  try { await listen(); }
  catch (error) {
    if (process.platform === 'win32' || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw new Error('BROKER_ALREADY_RUNNING');
    // Unix sockets survive abrupt process death. Recover only when metadata proves the recorded owner dead.
    let dead = false;
    try { const owner = JSON.parse(await readFile(path, 'utf8')); if (Number.isSafeInteger(owner.pid) && owner.pid > 0) { try { process.kill(owner.pid, 0); } catch (probe) { dead = (probe as NodeJS.ErrnoException).code === 'ESRCH'; } } } catch {}
    if (!dead) throw new Error('BROKER_ALREADY_RUNNING');
    await unlink(address); await listen();
  }
  try { await writeFile(path, JSON.stringify({ pid: process.pid, token }), { encoding: 'utf8', mode: 0o600 }); }
  catch (error) { await new Promise<void>(accept => server.close(() => accept())); throw error; }
  let released = false;
  return { async release() {
    if (released) return; released = true;
    try { const existing = JSON.parse(await readFile(path, 'utf8')); if (existing.token === token) await unlink(path); }
    finally { await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())); }
  } };
}
