import { it, expect } from 'vitest';
import { BrowserSession } from '../../src/browser/session.js';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('records only approved scope in an owned browser and returns opaque recording identifiers', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<button onclick="fetch(\'/catalog/a1?term=alpha\').then(r=>r.json()).then(()=>document.title=\'done\')">Search</button>'); }
    else { res.setHeader('content-type', 'application/json'); res.end('{"items":["alpha"]}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-session-'));
  const session = await BrowserSession.open(dir, { origin, paths: ['/catalog/{itemId}'], queryKeys: ['term'], bodyKeys: [], cookieNames: [], addresses: ['127.0.0.1'] }, { headless: true });
  try {
    await session.start({ search: 'alpha' });
    // Drive only our controlled test page; product code never clicks to demonstrate.
    await (session as unknown as { page: import('playwright').Page }).page.getByRole('button', { name: 'Search' }).click();
    await (session as unknown as { page: import('playwright').Page }).page.waitForFunction(() => document.title === 'done');
    const summary = await session.stop();
    expect(summary).toMatchObject({ recordingId: expect.any(String), requestCount: 1, complete: true });
    const recording = session.recording(summary.recordingId);
    expect(recording.observations[0].approvedQuery).toEqual({ term: 'alpha' });
    expect(JSON.stringify(summary)).not.toContain(dir);
    const starts = await Promise.allSettled([session.start({ search: 'beta' }), session.start({ search: 'beta' })]);
    expect(starts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(starts.filter(result => result.status === 'rejected')).toHaveLength(1);
  } finally { await session.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
it('compiles two broker-owned browser recordings into a real executable read workflow', async () => {
  const { compileTool } = await import('../../src/workflow/candidate.js');
  const { ReviewStore } = await import('../../src/approval/review.js');
  const { WorkflowRegistry } = await import('../../src/app/registry.js');
  const { startBroker, callBroker } = await import('../../src/broker/server.js');
  const server = createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end('<label>Term<input id="term"></label><button onclick="fetch(\'/books?term=\'+encodeURIComponent(document.querySelector(\'#term\').value)).then(r=>r.json()).then(x=>document.title=x.items[0])">Search</button>'); }
    else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ items: [new URL(req.url!, 'http://local').searchParams.get('term')] })); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-full-read-'));
  const scope = { origin, paths: ['/books'], queryKeys: ['term'], bodyKeys: [], cookieNames: [], addresses: ['127.0.0.1'] };
  const session = await BrowserSession.open(dir, scope, { headless: true });
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews, url => session.headers(url));
  const broker = await startBroker(dir, registry, session);
  try {
    const ids: string[] = [];
    for (const term of ['first', 'second']) {
      expect(await callBroker(dir, { command: 'record_start', inputs: { search: term } })).toMatchObject({ ok: true });
      const page = (session as unknown as { page: import('playwright').Page }).page;
      await page.getByLabel('Term').fill(term);
      await page.getByRole('button', { name: 'Search' }).click();
      await page.waitForFunction(value => document.title === value, term);
      const result = await callBroker(dir, { command: 'record_stop' });
      expect(result).toMatchObject({ ok: true, data: { complete: true } });
      if (!result.ok) throw new Error('capture failed');
      ids.push((result.data as { recordingId: string }).recordingId);
    }
    const result = await callBroker(dir, { command: 'compile_recordings', ids, requestIds: ['request:0', 'request:0'], specification: { id: 'books', origin, path: '/books', method: 'GET', effect: 'read', inputs: { search: { type: 'string', maxLength: 100 } }, projection: ['/items'] } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('compile failed');
    await reviews.review(result.data, { interactive: true, ask: async () => 'review books' });
    registry.register(result.data, scope);
    expect(await callBroker(dir, { command: 'run', id: 'books', inputs: { search: 'unseen third' } })).toMatchObject({ ok: true, data: { '/items': ['unseen third'] } });
  } finally { await broker.close(); await session.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
