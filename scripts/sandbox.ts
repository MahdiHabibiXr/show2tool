import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const prepareOnly = args[0] === '--prepare-only';
const directory = resolve(args[prepareOnly ? 1 : 0] ?? `.state/sandbox-${randomUUID()}`);
const tasks = [{ id: 'a1', tenant: 'A', title: 'alpha' }, { id: 'a2', tenant: 'A', title: 'beta' }, { id: 'a3', tenant: 'A', title: 'gamma' }];
const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Show2Tool read sandbox</title><body><h1>Show2Tool read sandbox</h1><p>Synthetic data only. No external accounts. Read-only task search.</p><p>Log in before starting capture, then demonstrate alpha and beta separately.</p><button id="login">Log in to synthetic tenant A</button><label>Search <input id="search" value="alpha"></label><button id="find">Find tasks</button><pre id="output"></pre><script>const out=document.querySelector('#output');document.querySelector('#login').onclick=async()=>{await fetch('/login',{method:'POST'});out.textContent='Logged in as synthetic tenant A';};document.querySelector('#find').onclick=async()=>{const r=await fetch('/api/tasks?q='+encodeURIComponent(document.querySelector('#search').value));out.textContent=JSON.stringify(await r.json(),null,2);};</script></body></html>`;
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://local');
  const json = (status: number, data: unknown) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(data)); };
  if (request.method === 'GET' && url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end(page); return; }
  if (request.method === 'POST' && url.pathname === '/login') { response.setHeader('set-cookie', 'session=synthetic_A; HttpOnly; SameSite=Strict; Path=/'); json(200, { tenant: 'A' }); return; }
  if (request.method !== 'GET') { json(405, { error: 'Read sandbox: mutations disabled.' }); return; }
  if (!request.headers.cookie?.split(';').some(cookie => cookie.trim() === 'session=synthetic_A')) { json(401, { error: 'Log in manually before recording.' }); return; }
  if (url.pathname === '/api/tasks') { json(200, { items: tasks.filter(task => task.title.includes(url.searchParams.get('q') ?? '')) }); return; }
  json(404, { error: 'Not found.' });
});
try {
  await mkdir(directory, { recursive: false, mode: 0o700 });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const files = {
    'scope.json': { origin, paths: ['/api/tasks'], queryKeys: ['q'], bodyKeys: [], cookieNames: ['session'], addresses: ['127.0.0.1'] },
    'start-alpha.json': { command: 'record_start', inputs: { search: 'alpha' } },
    'start-beta.json': { command: 'record_start', inputs: { search: 'beta' } },
    'stop.json': { command: 'record_stop' },
    'compile.json': { command: 'compile_recordings', ids: ['REPLACE_ALPHA_RECORDING_UUID', 'REPLACE_BETA_RECORDING_UUID'], requestIds: ['request:0', 'request:0'], specification: { id: 'find_tasks', origin, method: 'GET', path: '/api/tasks', effect: 'read', inputs: { search: { type: 'string', maxLength: 100 } }, projection: ['/items'] } },
    'verify.json': { command: 'verify', id: 'find_tasks', inputs: { search: 'gamma' }, expected: { '/items/0/id': 'a3', '/items/0/tenant': 'A', '/items/length': 1 } },
  };
  for (const [name, value] of Object.entries(files)) await writeFile(resolve(directory, name), JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: prepareOnly ? 'prepared' : 'ready', synthetic: true, origin, directory, nextAction: prepareOnly ? 'Preparation check only; server is stopping.' : 'Keep this terminal open. Start the human host using scope.json. See docs/SANDBOX.md.' }));
  if (prepareOnly) await new Promise<void>(resolve => server.close(() => resolve()));
  else for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { server.closeAllConnections(); server.close(); });
} catch {
  if (server.listening) { server.closeAllConnections(); server.close(); }
  console.error('Sandbox could not start. Choose a new directory whose parent exists; existing work is never overwritten.');
  process.exitCode = 1;
}
