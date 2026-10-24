import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Item = { id: string; title: string; version: number; account: string; tenant: string };
const cookieName = 'acceptance_session';
const principal = { account: 'alice', tenant: 'demo' };

// Local synthetic fixture only: no external accounts, persistence, or network calls.
export async function createAcceptanceApp(options: { port?: number } = {}) {
  const items = new Map<string, Item>(['alpha', 'beta'].map(term => [
    `item-${term}`, { id: `item-${term}`, title: `Synthetic ${term} note`, version: 1, ...principal },
  ]));
  const sessions = new Map<string, string>();
  let effectCount = 0;
  let nextId = 1;
  let origin = '';

  function json(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  }
  async function readTitle(req: IncomingMessage): Promise<string | undefined> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 4096) return undefined;
      chunks.push(buffer);
    }
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const fields = value as Record<string, unknown>;
      if (Object.keys(fields).length !== 1 || typeof fields.title !== 'string') return undefined;
      const title = fields.title.trim();
      return title.length > 0 && title.length <= 200 ? title : undefined;
    } catch { return undefined; }
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'Fixture request failed' });
      else res.end();
    });
  });
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    const url = new URL(req.url ?? '/', origin);
    const method = req.method ?? 'GET';
    if (req.headers.origin && req.headers.origin !== origin) {
      json(res, 403, { error: 'Same-origin requests only' }); return;
    }
    if (method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page); return;
    }
    if (method === 'POST' && url.pathname === '/login') {
      const session = randomBytes(24).toString('hex');
      sessions.set(session, randomBytes(24).toString('hex'));
      res.writeHead(303, {
        location: '/',
        'set-cookie': `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict`,
      });
      res.end(); return;
    }
    if (!['/api/me', '/api/csrf', '/api/items'].includes(url.pathname)) {
      json(res, 404, { error: 'Not found' }); return;
    }
    const session = (req.headers.cookie ?? '').split(';').map(part => part.trim())
      .find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    const token = session ? sessions.get(session) : undefined;
    if (!token) { json(res, 401, { error: 'Log in manually first' }); return; }
    if (method === 'GET' && url.pathname === '/api/me') {
      json(res, 200, principal); return;
    }
    if (method === 'GET' && url.pathname === '/api/csrf') {
      json(res, 200, { token }); return;
    }
    if (url.pathname !== '/api/items' || !['GET', 'POST', 'PATCH'].includes(method)) {
      json(res, 405, { error: 'Method not allowed' }); return;
    }
    const id = url.searchParams.get('id');
    if (method === 'GET') {
      if (id !== null) {
        const item = items.get(id);
        json(res, item ? 200 : 404, item ?? { error: 'Item not found' });
      } else {
        const term = (url.searchParams.get('term') ?? '').toLowerCase();
        json(res, 200, { items: [...items.values()].filter(item => item.title.toLowerCase().includes(term)) });
      }
      return;
    }
    if (req.headers['x-csrf-token'] !== token) {
      json(res, 403, { error: 'Valid CSRF token required' }); return;
    }
    const title = await readTitle(req);
    if (title === undefined) { json(res, 400, { error: 'Expected only a title of 1–200 characters' }); return; }
    if (method === 'POST') {
      const item: Item = { id: `item-${nextId++}`, title, version: 1, ...principal };
      items.set(item.id, item);
      effectCount++;
      json(res, 201, item); return;
    }
    const before = id ? items.get(id) : undefined;
    if (!before) { json(res, 404, { error: 'Item not found' }); return; }
    const version = req.headers['if-match'];
    if (!version) { json(res, 428, { error: 'If-Match version required' }); return; }
    if (version !== String(before.version)) { json(res, 412, { error: 'Version changed; read the item again' }); return; }
    const item: Item = { ...before, title, version: before.version + 1 };
    items.set(item.id, item);
    effectCount++;
    json(res, 200, item);
  }

  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => { server.off('error', reject); accept(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind a TCP port');
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    scope: {
      origin, addresses: ['127.0.0.1'], paths: ['/api/me', '/api/csrf', '/api/items'],
      queryKeys: ['term', 'id'], bodyKeys: ['title'], cookieNames: [cookieName],
    },
    // This counter is independent of HTTP results and cannot be changed via the API.
    getEffectCount: () => effectCount,
    close: () => new Promise<void>((accept, reject) => {
      server.close(error => error ? reject(error) : accept());
      server.closeAllConnections();
    }),
  };
}

const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Synthetic acceptance fixture</title>
<style>body{font:16px system-ui;max-width:760px;margin:32px auto;padding:0 16px}fieldset{margin:20px 0}label{display:block;margin:12px 0}input{font:inherit;padding:6px}button{font:inherit;padding:6px 12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}li{margin:12px 0}</style>
<h1>Synthetic acceptance fixture</h1>
<p>Local memory only. Not an external-account acceptance test. Restarting resets all records.</p>
<form method="post" action="/login"><button>Log in as alice / demo</button></form>
<p id="identity" role="status">Log in manually before using the fixture.</p>
<fieldset><legend>Search: demonstrate alpha, then beta</legend>
<form id="search"><label>Search term <input id="term" value="alpha" maxlength="200"></label><button>Search</button></form>
<ul id="results"></ul></fieldset>
<fieldset><legend>Create a synthetic record</legend>
<form id="create"><label>New title <input id="new-title" value="Synthetic new note" required maxlength="200"></label><button>Create</button></form></fieldset>
<fieldset><legend>Update a synthetic record</legend>
<p>Choose a search result or create a record to fill the target and current version.</p>
<form id="update"><label>Item ID <input id="item-id" required></label>
<label>Current version <input id="version" required readonly></label>
<label>Updated title <input id="updated-title" value="Synthetic updated note" required maxlength="200"></label>
<button>Update</button></form></fieldset>
<pre id="output" role="status"></pre>
<script>
const byId = id => document.getElementById(id);
async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function selected(item) {
  byId('item-id').value = item.id;
  byId('version').value = item.version;
}
function show(data) { byId('output').textContent = JSON.stringify(data, null, 2); }
function failed(error) { byId('output').textContent = error.message; }
async function write(method, path, title) {
  const csrf = await api('/api/csrf');
  const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf.token };
  if (method === 'PATCH') headers['if-match'] = byId('version').value;
  const item = await api(path, { method, headers, body: JSON.stringify({ title }) });
  selected(item); show(item);
}
byId('search').onsubmit = async event => {
  event.preventDefault();
  try {
    const data = await api('/api/items?term=' + encodeURIComponent(byId('term').value));
    byId('results').replaceChildren();
    for (const item of data.items) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.textContent = item.title + ' — select for update';
      button.onclick = () => { selected(item); show(item); };
      li.append(button); byId('results').append(li);
    }
    show(data);
  } catch (error) { failed(error); }
};
byId('create').onsubmit = event => {
  event.preventDefault();
  write('POST', '/api/items', byId('new-title').value).catch(failed);
};
byId('update').onsubmit = event => {
  event.preventDefault();
  write('PATCH', '/api/items?id=' + encodeURIComponent(byId('item-id').value), byId('updated-title').value).catch(failed);
};
api('/api/me').then(me => { byId('identity').textContent = 'Logged in: ' + me.account + ' / ' + me.tenant; }).catch(() => {});
</script></html>`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 0);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be 0–65535');
  const app = await createAcceptanceApp({ port });
  console.log(`Synthetic fixture ready: ${app.origin}`);
  console.log('Save the following JSON as your scope file (login is manual and outside recording scope):');
  console.log(JSON.stringify(app.scope, null, 2));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close(); });
  }
}
