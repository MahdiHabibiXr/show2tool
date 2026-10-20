import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixture } from '../../spike/fixture/server.js';
import { startCapture } from '../../spike/capture.js';
import { infer } from '../../spike/infer.js';
import { createIntentStore, dispatchFixtureWrite } from '../../spike/intents.js';
import { approveIntent } from '../../spike/approve.js';
import { createJournal } from '../../spike/journal.js';

it('learns a create field from two passive captures and verifies one unseen approved creation', async () => {
  const app = await startFixture();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-write-pipeline-'));
  let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    browser = await chromium.launchPersistentContext(join(dir, 'profile'), { channel: 'chrome', headless: true });
    const page = browser.pages()[0];
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Login tenant A' }).click();
    await page.getByText('Logged in', { exact: true }).waitFor();
    const demos = [];
    for (const title of ['first task', 'second task']) {
      const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 10, maxBytes: 65536, approvedBodyKeys: ['title'] });
      await page.getByLabel('Title', { exact: true }).fill(title);
      const response = page.waitForResponse(response => response.url() === app.origin + '/api/tasks' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Create task' }).click();
      await (await response).finished();
      await page.getByText('Created', { exact: true }).waitFor();
      const rows = await capture.stop();
      expect(rows).toHaveLength(1);
      expect(rows[0].requestOmittedReason).toBeUndefined();
      expect(rows[0].approvedBody).toEqual({ title });
      demos.push({ inputs: { title }, approvedSlots: rows[0].approvedBody as Record<string, string> });
    }
    expect(app.readState().writes).toBe(2);
    const candidate = infer(demos);
    expect(candidate.bindings).toEqual([{ slot: 'title', input: 'title', evidence: ['demo:0', 'demo:1'] }]);
    expect(candidate.unresolved).toEqual([]);
    const store = createIntentStore();
    const intent = store.prepare({ kind: 'create', title: 'unseen third task' }, 'tenant:A', app.origin);
    expect(await approveIntent(store, intent, { interactive: true, ask: async () => `approve ${intent.id}` })).toBe(true);
    const cookie = (await browser.cookies(app.origin)).find(cookie => cookie.name === 'session')!;
    const journal = await createJournal(join(dir, 'journal.json'));
    expect(await dispatchFixtureWrite(app.origin, store, intent, { cookie: `session=${cookie.value}` }, journal)).toEqual({ status: 'confirmed' });
    expect(app.readState().writes).toBe(3);
    expect(app.readState().tasks.filter(task => task.title === 'unseen third task')).toEqual([{ id: 'new3', tenant: 'A', title: 'unseen third task', version: 1 }]);
  } finally { await browser?.close(); await app.close(); await rm(dir, { recursive: true, force: true }); }
});
