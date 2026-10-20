import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixture } from '../../spike/fixture/server.js';
import { startCapture } from '../../spike/capture.js';
import { infer } from '../../spike/infer.js';
import { replayRead } from '../../spike/replay.js';

it('captures two demonstrated inputs and replays an unseen query with the same browser cookie', async () => {
  const app = await startFixture();
  const profile = await mkdtemp(join(tmpdir(), 'show2tool-pipeline-'));
  const browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  try {
    const page = browser.pages()[0];
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Login tenant A' }).click();
    await page.getByText('Logged in', { exact: true }).waitFor();
    const demos = [];
    for (const query of ['alpha', 'beta']) {
      const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 10, maxBytes: 65536, approvedQueryKeys: ['q'] });
      await page.getByLabel('Search', { exact: true }).fill(query);
      await page.getByRole('button', { name: 'Search tasks', exact: true }).click();
      await page.getByText(`"title":"${query}"`, { exact: false }).waitFor();
      const records = await capture.stop();
      expect(records[0].omittedReason).toBeUndefined();
      demos.push({ inputs: { query }, approvedSlots: records[0].approvedQuery || {} });
    }
    const candidate = infer(demos);
    expect(candidate.unresolved).toEqual([]);
    expect(candidate.bindings[0].input).toBe('query');
    const cookie = (await browser.cookies(app.origin)).find(c => c.name === 'session');
    expect(cookie).toBeDefined();
    const result = await replayRead({ origin: app.origin, path: '/api/tasks', queryInput: 'query', expectedTenant: 'A' }, { query: 'gamma' }, { cookie: `session=${cookie!.value}` });
    expect(result).toEqual([{ id: 'a3', tenant: 'A', title: 'gamma', version: 1 }]);
    expect(app.readState().writes).toBe(0);
  } finally { await browser.close(); await app.close(); await rm(profile, { recursive: true, force: true }); }
});
