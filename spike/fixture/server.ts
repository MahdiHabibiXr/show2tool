import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { pageHtml } from './page.js';
import { registerFixture, unregisterFixture } from './registry.js';
import type { Fault, Fixture, Task } from '../contracts.js';

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of req) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 65536) throw new Error('body limit');
  }
  const value: unknown = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid body');
  return value as Record<string, unknown>;
}

export async function startFixture(): Promise<Fixture> {
  const tasks: Task[] = [
    { id: 'a1', tenant: 'A', title: 'alpha', version: 1 },
    { id: 'a2', tenant: 'A', title: 'beta', version: 1 },
    { id: 'a3', tenant: 'A', title: 'gamma', version: 1 },
    { id: 'b1', tenant: 'B', title: 'gamma', version: 1 },
  ];
  let writes = 0;
  let expired = false;
  let fault: Fault = 'none';
  const server = createServer(async (req, res) => {
    const json = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html' }); res.end(pageHtml); return;
      }
      if (url.pathname === '/login' && req.method === 'POST') {
        const data = await body(req);
        if (data.tenant !== 'A' && data.tenant !== 'B') { json(400, { error: 'tenant' }); return; }
        res.setHeader('set-cookie', `session=FIXTURE_COOKIE_CANARY_${data.tenant}; HttpOnly; SameSite=Strict; Path=/`);
        json(200, { ok: true }); return;
      }
      const header = req.headers.authorization || '';
      const cookie = req.headers.cookie || '';
      const tenant = ['A', 'B'].find(t => header === `Bearer FIXTURE_BEARER_CANARY_${t}` || cookie.split(';').some(c => c.trim() === `session=FIXTURE_COOKIE_CANARY_${t}`));
      if (!tenant || expired) { json(401, { error: 'unauthorized' }); return; }
      if (url.pathname === '/api/me') { json(200, { tenant }); return; }
      if (url.pathname === '/api/csrf') { json(200, { token: `FIXTURE_CSRF_CANARY_${tenant}` }); return; }
      if (req.method === 'GET') {
        if (fault === 'login-html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>Login</h1>'); return; }
        if (url.pathname === '/api/tasks') {
          const selected = fault === 'wrong-tenant' ? 'B' : tenant;
          const query = fault === 'ignore-filter' ? '' : url.searchParams.get('q') || '';
          const found = tasks.filter(t => t.tenant === selected && t.title.includes(query));
          const offset = Number(url.searchParams.get('cursor') || 0);
          if (!Number.isSafeInteger(offset) || offset < 0) { json(400, { error: 'cursor' }); return; }
          const next = offset + 1 < found.length ? String(offset + 1) : null;
          json(200, { items: found.slice(offset, offset + 1), next: fault === 'repeat-cursor' ? '0' : next }); return;
        }
        const task = tasks.find(t => url.pathname === `/api/tasks/${t.id}` && t.tenant === tenant);
        if (task) { res.setHeader('etag', String(task.version)); json(200, task); return; }
      }
      if ((req.method === 'POST' && url.pathname === '/api/tasks') || (req.method === 'PATCH' && url.pathname.startsWith('/api/tasks/'))) {
        if (req.headers['x-csrf-token'] !== `FIXTURE_CSRF_CANARY_${tenant}`) { json(403, { error: 'csrf' }); return; }
        const data = await body(req);
        if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 200) { json(400, { error: 'title' }); return; }
        let task: Task;
        if (req.method === 'POST') {
          task = { id: `new${writes + 1}`, tenant, title: data.title, version: 1 }; tasks.push(task);
        } else {
          const existing = tasks.find(t => url.pathname === `/api/tasks/${t.id}` && t.tenant === tenant);
          if (!existing) { json(404, { error: 'not found' }); return; }
          if (req.headers['if-match'] !== String(existing.version)) { json(412, { error: 'version' }); return; }
          task = existing; task.title = data.title; task.version++;
        }
        writes++;
        if (fault === 'drop-after-write') { req.socket.destroy(); return; }
        json(req.method === 'POST' ? 201 : 200, task); return;
      }
      json(404, { error: 'not found' });
    } catch { if (!res.headersSent) json(400, { error: 'invalid request' }); else res.destroy(); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture address unavailable');
  const origin = `http://127.0.0.1:${address.port}`;
  registerFixture(origin);
  return {
    origin,
    readState: () => structuredClone({ tasks, writes }),
    setFault: value => { fault = value; },
    expire: () => { expired = true; },
    close: () => new Promise<void>((resolve, reject) => { unregisterFixture(origin); server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }),
  };
}
