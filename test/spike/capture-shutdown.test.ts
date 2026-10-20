import { it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Page } from 'playwright';
import { startCapture } from '../../spike/capture.js';

function harness(detach: () => Promise<void> = async () => {}) {
  const events = new EventEmitter();
  Object.assign(events, { send: async (name: string) => {
    if (name === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } };
    if (name === 'Network.getResponseBody') return new Promise(() => {});
    return {};
  }, detach });
  const frame = {};
  const page = Object.assign(new EventEmitter(), { context: () => ({ newCDPSession: async () => events }), mainFrame: () => frame });
  return { events, page: page as unknown as Page };
}
it('reports admitted request still waiting for headers when stopping', async () => {
  const { events, page } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024 });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST' } });
  const rows = await capture.stop();
  expect(rows).toHaveLength(1);
  expect(rows[0].omittedReason).toBe('incomplete');
});
it('bounds cleanup even if CDP detach never resolves', async () => {
  const { page } = harness(() => new Promise(() => {}));
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024 });
  const result = await Promise.race([capture.stop().then(() => 'stopped'), new Promise(resolve => setTimeout(() => resolve('hung'), 2200))]);
  expect(result).toBe('stopped');
});
it('does not admit requests after stop begins', async () => {
  const { events, page } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024 });
  const stopping = capture.stop();
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: 'late', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST' } });
  events.emit('Network.responseReceived', { requestId: 'late', response: { url: 'http://127.0.0.1:1234/api/tasks', status: 200, mimeType: 'application/json' } });
  expect(await stopping).toHaveLength(0);
});
it('returns incomplete evidence when browser cleanup rejects', async () => {
  const { events, page } = harness(async () => { throw new Error('closed session'); });
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024 });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST' } });
  expect((await capture.stop())[0].omittedReason).toBe('incomplete');
});
it('marks failed admitted requests explicitly without recording error text', async () => {
  const { events, page } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024 });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks?token=SECRET', method: 'POST' } });
  events.emit('Network.loadingFailed', { requestId: '1', errorText: 'SECRET' });
  const rows = await capture.stop();
  expect(rows[0].omittedReason).toBe('body-unavailable');
  expect(JSON.stringify(rows)).not.toContain('SECRET');
});
it('automatically stops collecting when capture duration expires', async () => {
  const { page, events } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024, maxDurationMs: 20 });
  await new Promise(resolve => setTimeout(resolve, 50));
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: 'late', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'GET' } });
  expect(await capture.stop()).toEqual([]);
});
it('returns the same stopped snapshot on repeated stop calls', async () => {
  let detaches = 0;
  const { page, events } = harness(async () => { detaches++; });
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024 });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'GET' } });
  const first = await capture.stop();
  expect(await capture.stop()).toEqual(first);
  expect(detaches).toBe(1);
});
it('captures only explicitly approved scalar mutation fields', async () => {
  const { page, events } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024, approvedBodyKeys: ['title', 'token'] });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST', postData: JSON.stringify({ title: 'alpha', token: 'SECRET', unrelated: 'PRIVATE' }) } });
  const rows = await capture.stop();
  expect(rows[0].approvedBody).toEqual({ title: 'alpha' });
  expect(JSON.stringify(rows)).not.toContain('SECRET');
  expect(JSON.stringify(rows)).not.toContain('PRIVATE');
});
it('marks oversized mutation evidence incomplete instead of parsing it', async () => {
  const { page, events } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024, approvedBodyKeys: ['title'] });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST', postData: JSON.stringify({ title: 'x'.repeat(70000) }) } });
  const rows = await capture.stop();
  expect(rows[0].requestOmittedReason).toBe('request-body-budget');
  expect(rows[0].approvedBody).toBeUndefined();
});
it('rejects invalid collection limits before connecting to Chrome', async () => {
  const { page } = harness();
  for (const maxRequests of [0, -1, Infinity, 1.5]) {
    await expect(startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests, maxBytes: 1024 })).rejects.toThrow('invalid capture limits');
  }
});
it('charges retained mutation fields against capture budget', async () => {
  const { page, events } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 16, approvedBodyKeys: ['title'] });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST', postData: JSON.stringify({ title: 'x'.repeat(100) }) } });
  const rows = await capture.stop();
  expect(rows[0].approvedBody).toBeUndefined();
  expect(rows[0].requestOmittedReason).toBe('request-body-budget');
});
it('marks Chrome-omitted request body as unavailable', async () => {
  const { page, events } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 1024, approvedBodyKeys: ['title'] });
  events.emit('Network.requestWillBeSent', { frameId: 'main', requestId: '1', request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST', hasPostData: true } });
  const rows = await capture.stop();
  expect(rows[0].requestOmittedReason).toBe('request-body-unavailable');
});
it('rejects unbounded approved field lists before attaching', async () => {
  const { page } = harness();
  await expect(startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 10, maxBytes: 65536, approvedBodyKeys: Array.from({ length: 21 }, (_, i) => 'field' + i) })).rejects.toThrow('invalid capture fields');
});
it('marks retained evidence incomplete when request count truncates capture', async () => {
  const { page, events } = harness();
  const capture = await startCapture(page, { origin: 'http://127.0.0.1:1234', paths: ['/api/tasks'], maxRequests: 1, maxBytes: 1024 });
  for (const requestId of ['1', '2']) events.emit('Network.requestWillBeSent', { frameId: 'main', requestId, request: { url: 'http://127.0.0.1:1234/api/tasks', method: 'POST' } });
  const rows = await capture.stop();
  expect(rows).toHaveLength(1);
  expect(rows[0].requestOmittedReason).toBe('request-count-budget');
});
