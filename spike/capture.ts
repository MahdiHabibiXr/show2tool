import type { Page } from 'playwright';
import { summarize } from './sanitize.js';
export type Observation = { id: string; method: string; path: string; queryKeys: string[]; status: number; shape: unknown; approvedQuery?: Record<string, string>; approvedBody?: Record<string, string | number | boolean | null>; requestOmittedReason?: string; omittedReason?: string };
export type Capture = { stop(): Promise<Observation[]> };
async function bounded(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([work.catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, ms); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export async function startCapture(page: Page, scope: { origin: string; paths: string[]; maxRequests: number; maxBytes: number; approvedQueryKeys?: string[]; approvedBodyKeys?: string[]; maxDurationMs?: number }): Promise<Capture> {
  if (!Number.isSafeInteger(scope.maxRequests) || scope.maxRequests < 1 || scope.maxRequests > 100 ||
      !Number.isSafeInteger(scope.maxBytes) || scope.maxBytes < 1 || scope.maxBytes > 10 * 1024 * 1024 ||
      !Number.isSafeInteger(scope.maxDurationMs ?? 90000) || (scope.maxDurationMs ?? 90000) < 1 || (scope.maxDurationMs ?? 90000) > 90000) throw new Error('invalid capture limits');
  for (const fields of [scope.approvedBodyKeys ?? [], scope.approvedQueryKeys ?? []]) {
    if (fields.length > 20 || !fields.every(key => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key))) throw new Error('invalid capture fields');
  }
  const session = await page.context().newCDPSession(page);
  const frameTree = await session.send('Page.getFrameTree');
  const frameId = frameTree.frameTree.frame.id;
  const rows: Observation[] = [];
  const tracked = new Map<string, Observation>();
  const pending = new Set<Promise<void>>();
  let bytes = 0;
  let departed = false;
  let stopping = false;
  const navigation = (frame: import('playwright').Frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).origin !== scope.origin) departed = true;
  };
  page.on('framenavigated', navigation);
  const onRequest = (event: {frameId?:string;requestId:string;request:{url:string;method:string;postData?:string;hasPostData?:boolean}}) => {
    if (stopping || departed || event.frameId !== frameId) return;
    const url = new URL(event.request.url);
    if (url.origin !== scope.origin || !scope.paths.includes(url.pathname)) return;
    if (rows.length >= scope.maxRequests) { rows[rows.length - 1].requestOmittedReason = 'request-count-budget'; return; }
    const row: Observation = { id: `request:${rows.length}`, method: event.request.method, path: url.pathname,
      queryKeys: [...url.searchParams.keys()].filter(k => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k)).slice(0, 20), status: 0, shape: null };
    if (scope.approvedQueryKeys?.length) {
      row.approvedQuery = Object.create(null);
      for (const key of scope.approvedQueryKeys) {
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || /token|secret|password|auth|cookie|key/i.test(key)) continue;
        const value = url.searchParams.get(key);
        if (value !== null && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value)) row.approvedQuery![key] = value;
      }
    }
    if (scope.approvedBodyKeys?.length && event.request.hasPostData && event.request.postData === undefined) row.requestOmittedReason = 'request-body-unavailable';
    if (scope.approvedBodyKeys?.length && event.request.postData) {
      if (Buffer.byteLength(event.request.postData) > 65536) row.requestOmittedReason = 'request-body-budget';
      else {
        try {
          const body: unknown = JSON.parse(event.request.postData);
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
          row.approvedBody = Object.create(null);
          for (const key of scope.approvedBodyKeys) {
            if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || /token|secret|password|auth|cookie|key/i.test(key) || !Object.hasOwn(body, key)) continue;
            const value = (body as Record<string, unknown>)[key];
            if ((typeof value === 'string' && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value)) || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || value === null) row.approvedBody![key] = value;
            else row.requestOmittedReason = 'unsupported-body-field';
          }
          const retained = Buffer.byteLength(JSON.stringify(row.approvedBody));
          if (retained > scope.maxBytes - bytes) { delete row.approvedBody; row.requestOmittedReason = 'request-body-budget'; }
          else bytes += retained;
        } catch { row.requestOmittedReason = 'invalid-body'; }
      }
    }
    rows.push(row); tracked.set(event.requestId, row);
  };
  const onResponse = (event: {requestId:string;response:{url:string;status:number;mimeType:string}}) => {
    const row = tracked.get(event.requestId);
    if (!row) return;
    const url = new URL(event.response.url);
    if (url.origin !== scope.origin || !scope.paths.includes(url.pathname)) { row.omittedReason = 'out-of-scope'; return; }
    row.status = event.response.status;
    if (!event.response.mimeType.includes('json')) row.omittedReason = 'not-json';
  };
  const onFailed = (event: {requestId:string}) => {
    const row = tracked.get(event.requestId); if (row) row.omittedReason = 'body-unavailable';
  };
  const onFinished = (event: {requestId:string;encodedDataLength:number}) => {
    const row = tracked.get(event.requestId);
    if (!row || row.omittedReason) return;
    const work = (async () => {
      try {
        if (event.encodedDataLength > scope.maxBytes - bytes) { row.omittedReason = 'body-budget'; return; }
        const result = await session.send('Network.getResponseBody', { requestId: event.requestId });
        const data = Buffer.from(result.body, result.base64Encoded ? 'base64' : 'utf8');
        if (data.length > scope.maxBytes - bytes) { row.omittedReason = 'body-budget'; return; }
        bytes += data.length; row.shape = summarize(JSON.parse(data.toString('utf8')));
      } catch { row.omittedReason = 'body-unavailable'; }
    })();
    pending.add(work); void work.finally(() => pending.delete(work));
  };
  session.on('Network.requestWillBeSent', onRequest);
  session.on('Network.responseReceived', onResponse);
  session.on('Network.loadingFailed', onFailed);
  session.on('Network.loadingFinished', onFinished);
  await session.send('Network.enable', { maxTotalBufferSize: scope.maxBytes, maxResourceBufferSize: scope.maxBytes });
  let stopped: Promise<Observation[]> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const stop = (): Promise<Observation[]> => {
    if (stopped) return stopped.then(rows => structuredClone(rows));
    stopping = true;
    if (deadline) clearTimeout(deadline);
    stopped = (async () => {
      await bounded(Promise.all([...pending]), 1000);
      page.off('framenavigated', navigation);
      session.off('Network.requestWillBeSent', onRequest);
      session.off('Network.responseReceived', onResponse);
      session.off('Network.loadingFailed', onFailed);
      session.off('Network.loadingFinished', onFinished);
      await bounded(session.detach(), 500);
      for (const row of rows) if (row.shape === null && !row.omittedReason) row.omittedReason = 'incomplete';
      return structuredClone(rows);
    })();
    return stopped.then(rows => structuredClone(rows));
  };
  deadline = setTimeout(() => { if (rows.length) rows[rows.length - 1].requestOmittedReason = 'capture-duration-budget'; void stop(); }, scope.maxDurationMs ?? 90000);
  deadline.unref();
  return { stop };
}
