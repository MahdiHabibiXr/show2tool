import { afterEach, expect, it } from 'vitest';
import { createAcceptanceApp } from '../../examples/acceptance-app.js';

const apps: Awaited<ReturnType<typeof createAcceptanceApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function fixture() {
  const app = await createAcceptanceApp();
  apps.push(app);
  return app;
}

async function login(origin: string) {
  const response = await fetch(`${origin}/login`, { method: 'POST', redirect: 'manual' });
  expect(response.status).toBe(303);
  const cookie = response.headers.get('set-cookie')!.split(';')[0];
  const csrf = await fetch(`${origin}/api/csrf`, { headers: { cookie } });
  expect(csrf.status).toBe(200);
  const { token } = await csrf.json() as { token: string };
  return { cookie, 'x-csrf-token': token, 'content-type': 'application/json' };
}

it('requires manual login and CSRF before any synthetic write', async () => {
  const app = await fixture();
  expect((await fetch(app.origin)).status).toBe(200);
  for (const path of ['/api/me', '/api/csrf', '/api/items?term=alpha']) {
    expect((await fetch(app.origin + path)).status).toBe(401);
  }
  expect((await fetch(`${app.origin}/api/items`, { method: 'POST', body: '{"title":"synthetic"}' })).status).toBe(401);
  expect((await fetch(`${app.origin}/api/items?id=item-alpha`, { method: 'PATCH', body: '{"title":"synthetic"}' })).status).toBe(401);
  const headers = await login(app.origin);
  for (const token of ['', 'invalid']) {
    expect((await fetch(`${app.origin}/api/items`, {
      method: 'POST', headers: { ...headers, 'x-csrf-token': token }, body: '{"title":"synthetic"}',
    })).status).toBe(403);
  }
  expect(app.getEffectCount()).toBe(0);
});

it('identifies alice/demo, searches two terms, and creates a readable synthetic record', async () => {
  const app = await fixture();
  const headers = await login(app.origin);
  expect(await (await fetch(`${app.origin}/api/me`, { headers })).json()).toEqual({ account: 'alice', tenant: 'demo' });
  for (const term of ['alpha', 'beta']) {
    const response = await fetch(`${app.origin}/api/items?term=${term}`, { headers });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{
      id: `item-${term}`, title: `Synthetic ${term} note`, version: 1, account: 'alice', tenant: 'demo',
    }] });
  }
  expect(app.getEffectCount()).toBe(0);
  const response = await fetch(`${app.origin}/api/items`, { method: 'POST', headers, body: '{"title":"Synthetic new record"}' });
  expect(response.status).toBe(201);
  const item = await response.json() as { id: string };
  expect(item).toEqual({ id: expect.any(String), title: 'Synthetic new record', version: 1, account: 'alice', tenant: 'demo' });
  expect(app.getEffectCount()).toBe(1);
  const readback = await fetch(`${app.origin}/api/items?id=${encodeURIComponent(item.id)}`, { headers });
  expect(await readback.json()).toEqual(item);
  expect(app.getEffectCount()).toBe(1);
});

it('updates only with the current If-Match version and counts only committed effects', async () => {
  const app = await fixture();
  const headers = await login(app.origin);
  const url = `${app.origin}/api/items?id=item-alpha`;
  const body = '{"title":"Synthetic updated record"}';
  expect((await fetch(url, { method: 'PATCH', headers, body })).status).toBe(428);
  expect((await fetch(url, { method: 'PATCH', headers: { ...headers, 'if-match': '0' }, body })).status).toBe(412);
  expect(app.getEffectCount()).toBe(0);
  const response = await fetch(url, { method: 'PATCH', headers: { ...headers, 'if-match': '1' }, body });
  expect(response.status).toBe(200);
  const expected = { id: 'item-alpha', title: 'Synthetic updated record', version: 2, account: 'alice', tenant: 'demo' };
  expect(await response.json()).toEqual(expected);
  expect(app.getEffectCount()).toBe(1);
  expect((await fetch(url, { method: 'PATCH', headers: { ...headers, 'if-match': '1' }, body })).status).toBe(412);
  expect(await (await fetch(url, { headers })).json()).toEqual(expected);
  expect(app.getEffectCount()).toBe(1);
});

it('rejects invalid writes without changing data or the independent per-app count', async () => {
  const first = await fixture();
  const second = await fixture();
  const headers = await login(first.origin);
  for (const body of ['{', '{}', '{"title":""}', '{"title":"safe","account":"bob"}']) {
    expect((await fetch(`${first.origin}/api/items`, { method: 'POST', headers, body })).status).toBe(400);
  }
  expect((await fetch(`${first.origin}/api/items?id=missing`, {
    method: 'PATCH', headers: { ...headers, 'if-match': '1' }, body: '{"title":"Synthetic missing"}',
  })).status).toBe(404);
  expect(first.getEffectCount()).toBe(0);
  expect((await fetch(`${first.origin}/api/items`, { method: 'POST', headers, body: '{"title":"Synthetic one"}' })).status).toBe(201);
  expect(first.getEffectCount()).toBe(1);
  expect(second.getEffectCount()).toBe(0);
  // A session from another fixture must not authorize this one.
  expect((await fetch(`${second.origin}/api/me`, { headers })).status).toBe(401);
  expect(first.scope).toEqual({
    origin: first.origin, addresses: ['127.0.0.1'],
    paths: ['/api/me', '/api/csrf', '/api/items'],
    queryKeys: ['term', 'id'], bodyKeys: ['title'], cookieNames: ['acceptance_session'],
  });
});
