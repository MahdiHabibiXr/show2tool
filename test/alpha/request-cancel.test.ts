import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { requestJson } from '../../src/runtime/transport.js';
it('cancels an active stalled HTTP response at the shared deadline', async () => {
  let received!: () => void;
  const requested = new Promise<void>(resolve => { received = resolve; });
  const server = createServer((_request, response) => { response.writeHead(200, { 'content-type': 'application/json' }); response.write('{'); received(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const controller = new AbortController();
    const pending = requestJson(new URL(origin), { origin, addresses: ['127.0.0.1'] }, {}, controller.signal);
    await requested;
    controller.abort();
    await expect(pending).rejects.toThrow('BUDGET_EXCEEDED');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
