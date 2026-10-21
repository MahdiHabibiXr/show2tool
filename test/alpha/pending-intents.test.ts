import { it, expect, vi } from 'vitest';
import { PendingIntents } from '../../src/approval/pending.js';
it('requires exact terminal approval and consumes an intent synchronously once', async () => {
  let now = 1000;
  const store = new PendingIntents(() => now);
  const intent = store.prepare({ manifestDigest: 'a'.repeat(64), principal: 'tenant:A', method: 'POST', url: 'https://example.com/tasks', body: { title: 'new' } });
  expect(() => store.consume(intent.id)).toThrow('APPROVAL_REQUIRED');
  expect(await store.approve(intent.id, { interactive: false, ask: async () => `approve ${intent.id}` })).toBe(false);
  const denied = store.prepare({ manifestDigest: 'a'.repeat(64), principal: 'tenant:A', method: 'POST', url: 'https://example.com/tasks', body: { title: 'denied' } });
  expect(await store.approve(denied.id, { interactive: true, ask: async () => 'approve another' })).toBe(false);
  expect(() => store.consume(denied.id)).toThrow('APPROVAL_REQUIRED');
  expect(await store.approve(intent.id, { interactive: true, ask: async prompt => { expect(prompt).toContain('"title":"new"'); expect(prompt).toContain('tenant:A'); return `approve ${intent.id}`; } })).toBe(true);
  expect(store.consume(intent.id)).toMatchObject({ principal: 'tenant:A', body: { title: 'new' } });
  expect(() => store.consume(intent.id)).toThrow('APPROVAL_REQUIRED');
  const expired = store.prepare({ manifestDigest: 'a'.repeat(64), principal: 'tenant:A', method: 'PATCH', url: 'https://example.com/tasks/a1', body: { title: 'changed' } });
  now += 60000;
  expect(await store.approve(expired.id, { interactive: true, ask: async () => `approve ${expired.id}` })).toBe(false);
  expect(() => store.consume(expired.id)).toThrow('APPROVAL_REQUIRED');
});
it('does not allow concurrent review or consumption of the same intent', async () => {
  const store = new PendingIntents();
  const intent = store.prepare({ manifestDigest: 'c'.repeat(64), principal: 'tenant:A', method: 'POST', url: 'https://example.com/tasks', body: { title: 'one' } });
  let answer!: (value: string) => void;
  const reviewing = store.approve(intent.id, { interactive: true, ask: async () => new Promise(resolve => { answer = resolve; }) });
  expect(await store.approve(intent.id, { interactive: true, ask: async () => `approve ${intent.id}` })).toBe(false);
  expect(() => store.consume(intent.id)).toThrow('APPROVAL_REQUIRED');
  answer(`approve ${intent.id}`);
  expect(await reviewing).toBe(true);
  const consumed = await Promise.allSettled([Promise.resolve().then(() => store.consume(intent.id)), Promise.resolve().then(() => store.consume(intent.id))]);
  expect(consumed.filter(result => result.status === 'fulfilled')).toHaveLength(1);
});
it('drops idle expired payloads without requiring another operation', () => {
  vi.useFakeTimers();
  try {
    const store = new PendingIntents();
    for (let index = 0; index < 20; index++) store.prepare({ manifestDigest: 'd'.repeat(64), principal: 'tenant:A', method: 'POST', url: 'https://example.com/tasks', body: { title: 'sensitive' } });
    expect(vi.getTimerCount()).toBe(20);
    vi.advanceTimersByTime(60001);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
it('does not accept an approval after the payload expires while the human is reading', async () => {
  let now = 0; const store = new PendingIntents(() => now);
  const intent = store.prepare({ manifestDigest: 'b'.repeat(64), principal: 'tenant:A', method: 'POST', url: 'https://example.com/tasks', body: { title: 'private' } });
  expect(await store.approve(intent.id, { interactive: true, ask: async () => { now = 60001; return `approve ${intent.id}`; } })).toBe(false);
  expect(() => store.consume(intent.id)).toThrow('APPROVAL_REQUIRED');
});
