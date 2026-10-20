import type { Task } from './contracts.js';
import { requireFixture } from './fixture/registry.js';
export type ReadContract = { origin: string; path: '/api/tasks'; queryInput: 'query'; expectedTenant: string };
export type Auth = { cookie?: string; bearer?: string };

// Deliberately fixture-only. Not a general-purpose URL fetcher or production SSRF boundary.
export async function fixtureJson(origin: string, path: string, auth: Auth, init: RequestInit = {}): Promise<unknown> {
  requireFixture(origin);
  const base = new URL(origin);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.origin !== origin || !base.port) throw new Error('fixture origin required');
  if (!path.startsWith('/api/') || path.includes('..') || path.startsWith('//')) throw new Error('path rejected');
  const headers = new Headers(init.headers);
  // Short-lived fixture servers may reuse ports; do not pool credentialed test connections.
  headers.set('connection', 'close');
  if (Boolean(auth.cookie) === Boolean(auth.bearer)) throw new Error('one auth mode required');
  if (auth.cookie) headers.set('cookie', auth.cookie);
  if (auth.bearer) headers.set('authorization', `Bearer ${auth.bearer}`);
  let response: Response;
  try { response = await fetch(new URL(path, origin), { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(3000) }); }
  catch { throw new Error('transport outcome unknown'); }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`http:${response.status}`); }
  if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('not-json'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      let part: ReadableStreamReadResult<Uint8Array>;
      try { part = await reader.read(); } catch { throw new Error('transport outcome unknown'); }
      if (part.done) break;
      size += part.value.length;
      if (size > 65536) { await reader.cancel(); throw new Error('body budget'); }
      chunks.push(part.value);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error('invalid-json'); }
    const stack = [{ value: parsed, depth: 0 }];
    while (stack.length) {
      const { value, depth } = stack.pop()!;
      if (depth > 32) throw new Error('json depth budget');
      if (value && typeof value === 'object') {
        for (const child of Object.values(value)) stack.push({ value: child, depth: depth + 1 });
      }
    }
    return parsed;
  } finally { reader.releaseLock(); }
}

export async function replayRead(contract: ReadContract, input: { query: string }, auth: Auth): Promise<Task[]> {
  if (contract.path !== '/api/tasks' || contract.queryInput !== 'query' || typeof input.query !== 'string' || input.query.length > 200) throw new Error('invalid contract/input');
  const items: Task[] = [];
  const seen = new Set<string>();
  let cursor = '0';
  for (let page = 0; page < 5; page++) {
    if (seen.has(cursor)) throw new Error('repeated cursor');
    seen.add(cursor);
    const result = await fixtureJson(contract.origin, `/api/tasks?q=${encodeURIComponent(input.query)}&cursor=${encodeURIComponent(cursor)}`, auth) as { items?: Task[]; next?: unknown };
    if (!Array.isArray(result.items)) throw new Error('invalid response');
    for (const task of result.items) {
      if (!task || typeof task.id !== 'string' || typeof task.title !== 'string' || !Number.isSafeInteger(task.version)) throw new Error('invalid task');
      if (task.tenant !== contract.expectedTenant) throw new Error('tenant mismatch');
      if (!task.title.includes(input.query)) throw new Error('filter mismatch');
      items.push(task);
    }
    if (result.next === null) return items;
    if (typeof result.next !== 'string' || !/^\d{1,6}$/.test(result.next)) throw new Error('invalid cursor');
    cursor = result.next;
  }
  throw new Error('page budget');
}

export async function replayDetail(contract: ReadContract, input: { query: string }, auth: Auth): Promise<Task> {
  const items = await replayRead(contract, input, auth);
  if (items.length !== 1) throw new Error('exactly one result required');
  const chosen = items[0];
  if (!/^[a-zA-Z0-9]+$/.test(chosen.id)) throw new Error('invalid detail id');
  const detail = await fixtureJson(contract.origin, `/api/tasks/${chosen.id}`, auth) as Task;
  if (detail.id !== chosen.id || detail.tenant !== contract.expectedTenant || detail.title !== chosen.title) throw new Error('detail mismatch');
  return detail;
}
