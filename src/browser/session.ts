import { chromium, type BrowserContext, type Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { startCapture, type Capture, type Observation } from '../../spike/capture.js';
import { inspectRecording } from '../../spike/inspect.js';
import { assertDestination } from '../runtime/policy.js';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export const scopeSchema = z.object({
  origin: z.string().url().refine(value => new URL(value).origin === value && ['https:', 'http:'].includes(new URL(value).protocol)),
  paths: z.array(z.string().regex(/^\/[a-zA-Z0-9_\-/]*$/).max(1024)).min(1).max(20),
  queryKeys: z.array(z.string()).max(20), bodyKeys: z.array(z.string()).max(20), cookieNames: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)).max(20),
  addresses: z.array(z.string().refine(value => isIP(value) !== 0)).max(20).optional(),
}).strict();
export type Scope = z.infer<typeof scopeSchema>;
export type Recording = { inputs: Record<string, string>; observations: Observation[] };
export class BrowserSession {
  readonly id = randomUUID();
  private starting = false;
  private active?: { capture: Capture; inputs: Record<string, string> };
  private readonly recordings = new Map<string, Recording>();
  private constructor(private readonly context: BrowserContext, private readonly page: Page, readonly scope: Scope) {}
  static async open(stateDir: string, value: unknown, options: { headless?: boolean } = {}): Promise<BrowserSession> {
    const scope = scopeSchema.parse(value);
    const hostname = new URL(scope.origin).hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true })).map(item => item.address);
    assertDestination(new URL(scope.origin), addresses, { origin: scope.origin, addresses: scope.addresses });
    const context = await chromium.launchPersistentContext(join(stateDir, 'profile'), { channel: 'chrome', headless: options.headless ?? false });
    try {
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(scope.origin, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return new BrowserSession(context, page, scope);
    } catch { await context.close(); throw new Error('BROWSER_OPEN_FAILED'); }
  }
  async start(value: unknown): Promise<void> {
    if (this.active || this.starting) throw new Error('RECORDING_ACTIVE');
    if (this.recordings.size >= 10) throw new Error('BUDGET_EXCEEDED');
    const inputs = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), z.string().max(200)).parse(value);
    if (Object.keys(inputs).length > 20 || new URL(this.page.url()).origin !== this.scope.origin) throw new Error('INVALID_INPUT');
    this.starting = true;
    try {
      const capture = await startCapture(this.page, { origin: this.scope.origin, paths: this.scope.paths, approvedQueryKeys: this.scope.queryKeys, approvedBodyKeys: this.scope.bodyKeys, maxRequests: 100, maxBytes: 1024 * 1024 });
      this.active = { capture, inputs: structuredClone(inputs) };
    } finally { this.starting = false; }
  }
  async stop(): Promise<{ recordingId: string; requestCount: number; complete: boolean }> {
    if (!this.active) throw new Error('RECORDING_NOT_ACTIVE');
    const active = this.active; this.active = undefined;
    const observations = await active.capture.stop();
    const recordingId = randomUUID();
    this.recordings.set(recordingId, { inputs: active.inputs, observations });
    const report = inspectRecording(observations);
    return { recordingId, requestCount: report.requestCount, complete: report.complete };
  }
  recording(id: string): Recording {
    const recording = this.recordings.get(id); if (!recording) throw new Error('RECORDING_NOT_FOUND');
    return structuredClone(recording);
  }
  async headers(url: string): Promise<Record<string, string>> {
    if (new URL(url).origin !== this.scope.origin) throw new Error('REVIEW_REQUIRED');
    const cookies = (await this.context.cookies(url)).filter(cookie => this.scope.cookieNames.includes(cookie.name));
    return cookies.length ? { cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') } : {};
  }
  async close(): Promise<void> { if (this.active) await this.stop(); await this.context.close(); }
}
