import { describe, it, expect } from 'vitest';
import { startFixture } from '../../spike/fixture/server.js';

describe('synthetic task fixture', () => {
  it('requires auth and exposes independent effects', async () => {
    const app = await startFixture();
    try {
      expect(app.readState().writes).toBe(0);
      expect((await fetch(app.origin + '/api/tasks')).status).toBe(401);
      expect(app.readState().tasks.map(t => t.tenant)).toContain('B');
    } finally { await app.close(); }
  });
  it('isolates tenants and finds the unseen gamma input', async () => {
    const app = await startFixture();
    try {
      const response = await fetch(app.origin + '/api/tasks?q=gamma', { headers: { authorization: 'Bearer FIXTURE_BEARER_CANARY_A' } });
      expect(await response.json()).toEqual({ items: [{ id: 'a3', tenant: 'A', title: 'gamma', version: 1 }], next: null });
      const foreign = await fetch(app.origin + '/api/tasks/b1', { headers: { authorization: 'Bearer FIXTURE_BEARER_CANARY_A' } });
      expect(foreign.status).toBe(404);
    } finally { await app.close(); }
  });
  it('rejects invalid csrf and stale updates without effects', async () => {
    const app = await startFixture();
    const headers = { authorization: 'Bearer FIXTURE_BEARER_CANARY_A', 'content-type': 'application/json' };
    try {
      expect((await fetch(app.origin + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ title: 'fresh' }) })).status).toBe(403);
      const valid = { ...headers, 'x-csrf-token': 'FIXTURE_CSRF_CANARY_A' };
      expect((await fetch(app.origin + '/api/tasks/a1', { method: 'PATCH', headers: { ...valid, 'if-match': '9' }, body: JSON.stringify({ title: 'changed' }) })).status).toBe(412);
      expect(app.readState().writes).toBe(0);
      const created = await fetch(app.origin + '/api/tasks', { method: 'POST', headers: valid, body: JSON.stringify({ title: 'fresh' }) });
      expect(created.status).toBe(201);
      const result = await created.json() as { id: string };
      expect(result.id).toBe('new1');
      expect((await fetch(app.origin + '/api/tasks/a1', { method: 'PATCH', headers: { ...valid, 'if-match': '1' }, body: JSON.stringify({ title: 'changed' }) })).status).toBe(200);
      expect(app.readState().writes).toBe(2);
      expect(app.readState().tasks.find(t => t.id === 'a1')?.title).toBe('changed');
    } finally { await app.close(); }
  });
});
