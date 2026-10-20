import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { fixtureJson, type Auth } from './replay.js';
import type { Journal } from './journal.js';
export type Prepared = { id: string; digest: string; expiresAt: number };
export type IntentStore = {
  prepare(request: unknown, principal: string, origin?: string): Prepared;
  confirm(id: string, digest: string): void;
  consume(id: string, digest: string): unknown;
  principal(id: string, digest: string): string;
  preview(id: string, digest: string): unknown;
  destination(id: string, digest: string): string | undefined;
};
export function createIntentStore(now: () => number = Date.now): IntentStore {
  const key = randomBytes(32);
  const entries = new Map<string, { digest: string; expiresAt: number; principal: string; origin?: string; request: unknown; state: string }>();
  const get = (id: string, digest: string) => {
    const entry = entries.get(id);
    if (!entry || entry.digest !== digest) throw new Error('intent mismatch');
    if (now() >= entry.expiresAt) throw new Error('expired');
    return entry;
  };
  return {
    prepare(request, principal, origin) {
      const cloned = structuredClone(request);
      const id = randomUUID();
      const digest = createHmac('sha256', key).update(JSON.stringify({ id, principal, origin, request: cloned })).digest('hex');
      const expiresAt = now() + 60000;
      entries.set(id, { digest, expiresAt, principal, origin, request: cloned, state: 'pending' });
      return { id, digest, expiresAt };
    },
    confirm(id, digest) { const e = get(id, digest); if (e.state !== 'pending') throw new Error('not pending'); e.state = 'approved'; },
    consume(id, digest) { const e = get(id, digest); if (e.state !== 'approved') throw new Error('not approved'); e.state = 'dispatching'; return structuredClone(e.request); },
    principal(id, digest) { return get(id, digest).principal; },
    destination(id, digest) { return get(id, digest).origin; },
    preview(id, digest) { return structuredClone(get(id, digest).request); },
  };
}
export async function dispatchFixtureWrite(origin: string, store: IntentStore, intent: Prepared, auth: Auth, journal?: Journal): Promise<{ status: 'unknown' | 'confirmed' | 'rejected' }> {
  if (store.destination(intent.id, intent.digest) !== origin) throw new Error('origin mismatch');
  const me = await fixtureJson(origin, '/api/me', auth) as { tenant: string };
  if (`tenant:${me.tenant}` !== store.principal(intent.id, intent.digest)) throw new Error('principal mismatch');
  const csrf = await fixtureJson(origin, '/api/csrf', auth) as { token: string };
  const request = store.consume(intent.id, intent.digest) as { kind: string; title: string; id?: string; version?: number };
  if (!['create', 'update'].includes(request.kind) || typeof request.title !== 'string' || !request.title.trim() || request.title.length > 200) throw new Error('unsupported fixture action');
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-csrf-token': csrf.token };
  let path = '/api/tasks';
  if (request.kind === 'update') {
    if (typeof request.id !== 'string' || !/^[a-zA-Z0-9]+$/.test(request.id) || !Number.isSafeInteger(request.version)) throw new Error('invalid update');
    path += `/${request.id}`;
    headers['if-match'] = String(request.version);
  }
  await journal?.record(intent.id, 'dispatching');
  try {
    const result = await fixtureJson(origin, path, auth, { method: request.kind === 'create' ? 'POST' : 'PATCH', headers, body: JSON.stringify({ title: request.title }) }) as { id: string };
    if (typeof result.id !== 'string' || !/^[a-zA-Z0-9]+$/.test(result.id)) return { status: 'unknown' };
    if (request.kind === 'update' && result.id !== request.id) return { status: 'unknown' };
    const verified = await fixtureJson(origin, `/api/tasks/${result.id}`, auth) as { id: string; title: string; tenant: string; version: number };
    const correctVersion = request.kind === 'create' ? verified.version === 1 : verified.version === request.version! + 1;
    const status = verified.id === result.id && correctVersion && verified.title === request.title && verified.tenant === me.tenant ? 'confirmed' : 'unknown';
    await journal?.record(intent.id, status);
    return { status };
  } catch {
    // A post-dispatch persistence failure cannot change the uncertain network outcome.
    try { await journal?.record(intent.id, 'unknown'); } catch { /* dispatching recovers as unknown */ }
    return { status: 'unknown' };
  }
}
