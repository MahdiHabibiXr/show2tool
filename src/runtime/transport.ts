import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { assertDestination, type DestinationGrant } from './policy.js';
import { withinDeadline } from './deadline.js';

export async function requestJson(url: URL, grant: DestinationGrant, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<unknown> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const resolved = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await withinDeadline(lookup(hostname, { all: true }), signal);
  if (signal?.aborted) throw new Error('BUDGET_EXCEEDED');
  assertDestination(url, resolved.map(item => item.address), grant);
  const selected = resolved[0];
  return new Promise((accept, reject) => {
    let settled = false;
    const abort = () => fail('BUDGET_EXCEEDED');
    const fail = (code: string) => { if (!settled) { settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); req.destroy(); reject(new Error(code)); } };
    const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET', agent: false, headers: { ...headers, accept: 'application/json', 'accept-encoding': 'gzip, deflate, br' },
      lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options.all) callback(null, [{ address: selected.address, family: selected.family }]);
        else callback(null, selected.address, selected.family);
      }) as import('node:net').LookupFunction,
    }, response => {
      if (response.statusCode === 401 || response.statusCode === 403) { response.destroy(); fail('AUTH_REQUIRED'); return; }
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) { response.destroy(); fail('UPSTREAM_REJECTED'); return; }
      if (!response.headers['content-type']?.includes('application/json')) { response.destroy(); fail('UNSUPPORTED_RESPONSE'); return; }
      if (response.headers['set-cookie']) { response.destroy(); fail('UNSUPPORTED_AUTH'); return; }
      let encoded = 0;
      response.on('data', chunk => { encoded += chunk.length; if (encoded > 65536) fail('BUDGET_EXCEEDED'); });
      const encoding = response.headers['content-encoding'];
      const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : undefined;
      if (encoding && encoding !== 'identity' && !decoder) { response.destroy(); fail('UNSUPPORTED_RESPONSE'); return; }
      const stream = decoder ? response.pipe(decoder) : response;
      const chunks: Buffer[] = [];
      let decoded = 0;
      stream.on('data', chunk => {
        decoded += chunk.length;
        if (decoded > 65536) { stream.destroy(); fail('BUDGET_EXCEEDED'); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on('aborted', () => fail('UPSTREAM_FAILED'));
      response.on('error', () => fail('UPSTREAM_FAILED'));
      stream.on('error', () => fail('UPSTREAM_FAILED'));
      stream.on('end', () => {
        if (settled) return;
        try {
          const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const stack = [{ value, depth: 0 }];
          while (stack.length) {
            const item = stack.pop()!;
            if (item.depth > 32) { fail('BUDGET_EXCEEDED'); return; }
            if (item.value && typeof item.value === 'object') for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 });
          }
          settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); accept(value);
        } catch { fail('INVALID_RESPONSE'); }
      });
    });
    const timer = setTimeout(() => fail('UPSTREAM_TIMEOUT'), 10000);
    req.on('error', () => fail('UPSTREAM_FAILED'));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    req.end();
  });
}
