import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixture } from '../../spike/fixture/server.js';
import { startCapture } from '../../spike/capture.js';
import { summarize } from '../../spike/sanitize.js';

it('captures selected page without replaying its write or leaking credentials', async () => {
  const app = await startFixture();
  const profile = await mkdtemp(join(tmpdir(), 'show2tool-fixture-'));
  const browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  try {
    const page = browser.pages()[0];
    page.setDefaultTimeout(4000);
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Login tenant A' }).click();
    await page.getByText('Logged in', { exact: true }).waitFor();
    const other = await browser.newPage();
    await other.goto(app.origin);
    const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 20, maxBytes: 65536 });
    await other.evaluate(async () => { await fetch('/api/tasks?q=UNRELATED'); });
    await page.getByRole('button', { name: 'Create task' }).click();
    await page.getByText('Created', { exact: true }).waitFor();
    const rows = await capture.stop();
    expect(app.readState().writes).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe('POST');
    expect(rows[0].shape).toMatchObject({ id: 'string', title: 'string' });
    const saved = JSON.stringify(rows);
    expect(saved).not.toContain('CANARY');
    expect(saved).not.toContain('UNRELATED');
    expect(saved).not.toContain('fresh');
  } finally { await browser.close(); await app.close(); await rm(profile, { recursive: true, force: true }); }
});
it('retains only bounded shapes including secret-looking values', () => {
  expect(summarize({ token: 'CANARY', title: 'private', nested: [1, 2] })).toEqual({ token: 'string', title: 'string', nested: ['number'] });
  expect(summarize(JSON.parse('{"__proto__":"hostile"}'))).toEqual({});
});
it('reports response omission under a tiny retention budget', async () => {
  const app = await startFixture();
  const profile = await mkdtemp(join(tmpdir(), 'show2tool-budget-'));
  const browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  try {
    const page = browser.pages()[0];
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Login tenant A' }).click();
    await page.getByText('Logged in', { exact: true }).waitFor();
    const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 1, maxBytes: 1 });
    await page.getByRole('button', { name: 'Search tasks', exact: true }).click();
    await page.getByText('"next":null', { exact: false }).waitFor();
    const rows = await capture.stop();
    expect(rows).toHaveLength(1);
    expect(rows[0].omittedReason).toBe('body-budget');
    expect(rows[0].shape).toBe(null);
  } finally { await browser.close(); await app.close(); await rm(profile, { recursive: true, force: true }); }
});
it('stops safely on leaving the approved origin', async () => {
  const app = await startFixture();
  const profile = await mkdtemp(join(tmpdir(), 'show2tool-navigation-'));
  const browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  try {
    const page = browser.pages()[0];
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Login tenant A' }).click();
    await page.getByText('Logged in', { exact: true }).waitFor();
    const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 20, maxBytes: 65536 });
    await page.goto('about:blank');
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Search tasks', exact: true }).click();
    await page.getByText('"next":null', { exact: false }).waitFor();
    expect(await capture.stop()).toHaveLength(0);
  } finally { await browser.close(); await app.close(); await rm(profile, { recursive: true, force: true }); }
});
it('attaches through CDP to an owned dedicated Chrome instance', async () => {
  const { spawn } = await import('node:child_process');
  const { readFile } = await import('node:fs/promises');
  const app = await startFixture();
  const profile = await mkdtemp(join(tmpdir(), 'show2tool-cdp-'));
  const { findChrome } = await import('../../src/browser/chrome.js');
  const executable = await findChrome();
  if (!executable) throw new Error('Install Google Chrome in its standard location before running browser tests.');
  const chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let attached: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    let port = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; if (port) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(port).toMatch(/^\d+$/);
    attached = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = attached.contexts()[0].pages()[0];
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Login tenant A' }).click();
    await page.getByText('Logged in', { exact: true }).waitFor();
    const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 10, maxBytes: 65536 });
    await page.getByRole('button', { name: 'Search tasks', exact: true }).click();
    await page.getByText('"next":null', { exact: false }).waitFor();
    const rows = await capture.stop();
    expect(rows).toHaveLength(1);
    expect(rows[0].shape).toHaveProperty('items');
    expect(rows[0].omittedReason).toBeUndefined();
  } finally {
    if (attached) { const cdp = await attached.newBrowserCDPSession(); await cdp.send('Browser.close').catch(() => {}); }
    await new Promise<void>(resolve => { if (chrome.exitCode !== null) resolve(); else { chrome.once('exit', () => resolve()); setTimeout(() => { chrome.kill(); resolve(); }, 2000).unref(); } });
    await app.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
it('excludes same-origin child-frame requests from selected main-frame capture', async () => {
  const app = await startFixture();
  const profile = await mkdtemp(join(tmpdir(), 'show2tool-frame-'));
  const browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  try {
    const page = browser.pages()[0];
    await page.goto(app.origin);
    await page.getByRole('button', { name: 'Login tenant A' }).click();
    await page.getByText('Logged in', { exact: true }).waitFor();
    await page.evaluate(() => { const iframe = document.createElement('iframe'); iframe.src = '/'; document.body.append(iframe); });
    await page.frameLocator('iframe').getByRole('button', { name: 'Search tasks', exact: true }).waitFor();
    const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 10, maxBytes: 65536 });
    await page.frameLocator('iframe').getByRole('button', { name: 'Search tasks', exact: true }).click();
    await page.frameLocator('iframe').getByText('"next":null', { exact: false }).waitFor();
    expect(await capture.stop()).toEqual([]);
  } finally { await browser.close(); await app.close(); await rm(profile, { recursive: true, force: true }); }
});
