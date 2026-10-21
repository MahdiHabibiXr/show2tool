import { createServer, createConnection, type Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { BrowserSession } from '../browser/session.js';
import type { WorkflowRegistry } from '../app/registry.js';
import { handle } from '../app/handlers.js';
import { failure, type Result } from '../contracts/results.js';
export function endpoint(stateDir: string): string {
  const hash = createHash('sha256').update(resolve(stateDir)).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\show2tool-${hash}` : join(resolve(stateDir), 'broker.sock');
}
export async function startBroker(stateDir: string, registry?: WorkflowRegistry, session?: BrowserSession): Promise<{ close(): Promise<void> }> {
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.setTimeout(15000, () => socket.destroy());
    let data = Buffer.alloc(0);
    let responding = false;
    socket.on('data', chunk => {
      if (responding) return;
      data = Buffer.concat([data, chunk]);
      if (data.length > 1024 * 1024) { responding = true; socket.end(JSON.stringify(failure('BUDGET_EXCEEDED', 'IPC request too large.')) + '\n'); return; }
      const end = data.indexOf(10);
      if (end === -1) return;
      responding = true;
      void (async () => {
        let result: Result;
        try { result = await handle(JSON.parse(data.subarray(0, end).toString('utf8')), registry, session); }
        catch { result = failure('INVALID_INPUT', 'Invalid IPC request.'); }
        socket.end(JSON.stringify(result) + '\n');
      })();
    });
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', error => reject(new Error((error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'BROKER_ALREADY_RUNNING' : 'BROKER_START_FAILED')));
    server.listen(endpoint(stateDir), accept);
  });
  return { async close() {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()));
  } };
}
export async function callBroker(stateDir: string, command: unknown): Promise<Result> {
  return new Promise(resolveResult => {
    const socket = createConnection(endpoint(stateDir));
    let data = Buffer.alloc(0);
    let settled = false;
    const finish = (result: Result) => { if (!settled) { settled = true; socket.destroy(); resolveResult(result); } };
    socket.setTimeout(15000, () => finish(failure('BROKER_UNAVAILABLE', 'Broker did not respond.')));
    socket.on('error', () => finish(failure('BROKER_UNAVAILABLE', 'Start the local broker first.')));
    socket.on('end', () => { if (!settled) finish(failure('BROKER_UNAVAILABLE', 'Broker closed before a complete result.')); });
    socket.once('connect', () => {
      try {
        const frame = JSON.stringify(command) + '\n';
        if (Buffer.byteLength(frame) > 1024 * 1024) { finish(failure('BUDGET_EXCEEDED', 'IPC request too large.')); return; }
        socket.write(frame);
      } catch { finish(failure('INVALID_INPUT', 'Invalid command data.')); }
    });
    socket.on('data', chunk => {
      data = Buffer.concat([data, chunk]);
      if (data.length > 32768) { finish(failure('BUDGET_EXCEEDED', 'IPC result too large.')); return; }
      const end = data.indexOf(10);
      if (end !== -1) {
        try { const result = JSON.parse(data.subarray(0, end).toString('utf8')); if (result.schemaVersion !== 1 || typeof result.ok !== 'boolean') throw new Error(); finish(result as Result); }
        catch { finish(failure('BROKER_UNAVAILABLE', 'Invalid broker response.')); }
      }
    });
  });
}
