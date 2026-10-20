import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFixture } from './fixture/server.js';
import { startCapture } from './capture.js';
import { infer } from './infer.js';
import { replayRead } from './replay.js';
import { freezeContract, assertUnchanged, assertExpectedTasks } from './verify.js';

const app = await startFixture();
const profile = await mkdtemp(join(tmpdir(), 'show2tool-demo-'));
let browser: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) throw new Error('invalid arguments');
  const output = args[1];
  if (output) await mkdir(output);
  browser = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  const page = browser.pages()[0];
  await page.goto(app.origin);
  await page.getByRole('button', { name: 'Login tenant A' }).click();
  await page.getByText('Logged in', { exact: true }).waitFor();
  const demonstrations = [];
  const observations = [];
  for (const query of ['alpha', 'beta']) {
    const capture = await startCapture(page, { origin: app.origin, paths: ['/api/tasks'], maxRequests: 10, maxBytes: 65536, approvedQueryKeys: ['q'] });
    await page.getByLabel('Search', { exact: true }).fill(query);
    await page.getByRole('button', { name: 'Search tasks', exact: true }).click();
    await page.getByText(`"title":"${query}"`, { exact: false }).waitFor();
    const rows = await capture.stop();
    if (rows.length !== 1 || rows[0].omittedReason || !rows[0].approvedQuery) throw new Error('capture incomplete');
    observations.push(rows[0]);
    demonstrations.push({ inputs: { query }, approvedSlots: rows[0].approvedQuery });
  }
  const candidate = infer(demonstrations);
  if (candidate.unresolved.length || candidate.bindings.length !== 1) throw new Error('binding unresolved');
  const contract = { origin: app.origin, path: '/api/tasks' as const, queryInput: 'query' as const, expectedTenant: 'A' };
  const hash = freezeContract(contract);
  const cookie = (await browser.cookies(app.origin)).find(c => c.name === 'session');
  if (!cookie) throw new Error('session missing');
  assertUnchanged(contract, hash);
  const result = await replayRead(contract, { query: 'gamma' }, { cookie: `session=${cookie.value}` });
  assertExpectedTasks(result, ['a3']);
  assertUnchanged(contract, hash);
  const report = { status: 'passed', scope: 'synthetic fixture only', trainingInputs: ['alpha', 'beta'], heldOutInput: 'gamma', resultIds: result.map(t => t.id), writes: app.readState().writes, captureRows: observations.length, agentVisibleBytes: Buffer.byteLength(JSON.stringify(observations)), contractHash: hash };
  if (output) {
    const options = { encoding: 'utf8' as const, flag: 'wx', mode: 0o600 };
    await writeFile(join(output, 'recording.json'), JSON.stringify(observations, null, 2), options);
    await writeFile(join(output, 'demonstrations.json'), JSON.stringify(demonstrations, null, 2), options);
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), options);
  }
  console.log(JSON.stringify(report, null, 2));
} catch { console.error('Synthetic demo failed; run the regression suite for details.'); process.exitCode = 1; }
finally { await browser?.close(); await app.close(); await rm(profile, { recursive: true, force: true }); }
