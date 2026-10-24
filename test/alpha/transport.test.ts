import { it, expect } from 'vitest';
import { createServer, type RequestListener } from 'node:http';
import { requestJson } from '../../src/runtime/transport.js';
async function withServer(listener: RequestListener, run: (origin: string) => Promise<void>) {
  const server = createServer(listener);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
it('never follows a redirect to another destination', async () => {
  await withServer((_, response) => { response.writeHead(302, { location: 'http://169.254.169.254/' }); response.end(); }, async origin => {
    await expect(requestJson(new URL(origin), { origin, addresses: ['127.0.0.1'] })).rejects.toThrow('UPSTREAM_REJECTED');
  });
});
it('rejects malformed JSON without disclosing response content', async () => {
  await withServer((_, response) => { response.setHeader('content-type', 'application/json'); response.end('SECRET_CANARY'); }, async origin => {
    await expect(requestJson(new URL(origin), { origin, addresses: ['127.0.0.1'] })).rejects.toThrow('INVALID_RESPONSE');
  });
});
it('rejects session rotation rather than mutating browser auth silently', async () => {
  await withServer((_, response) => { response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'session=changed' }); response.end('{}'); }, async origin => {
    await expect(requestJson(new URL(origin), { origin, addresses: ['127.0.0.1'] })).rejects.toThrow('UNSUPPORTED_AUTH');
  });
});
it('aborts oversized decoded data', async () => {
  const { gzipSync } = await import('node:zlib');
  await withServer((_, response) => { response.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' }); response.end(gzipSync(JSON.stringify({ value: 'x'.repeat(70000) }))); }, async origin => {
    await expect(requestJson(new URL(origin), { origin, addresses: ['127.0.0.1'] })).rejects.toThrow('BUDGET_EXCEEDED');
  });
});
it('supports hostname lookup while pinning the connection to validated addresses', async () => {
  const server = createServer((_, response) => { response.setHeader('content-type', 'application/json'); response.end('{"ok":true}'); });
  await new Promise<void>(resolve => server.listen(0, '::', resolve));
  const origin = `http://localhost:${(server.address() as { port: number }).port}`;
  try { await expect(requestJson(new URL(origin), { origin, addresses: ['127.0.0.1', '::1'] })).resolves.toEqual({ ok: true }); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('rejects mutation methods other than the reviewed create/update set before sending',async()=>{
  await expect(requestJson(new URL('https://example.com/books'),{origin:'https://example.com'},{},{method:'DELETE',body:'{}'} as never)).rejects.toThrow('UNSUPPORTED_FEATURE');
});
