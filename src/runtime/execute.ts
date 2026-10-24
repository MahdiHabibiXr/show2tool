import { select } from './pointer.js';
import { performance } from 'node:perf_hooks';
import { manifestSchema } from '../contracts/manifest.js';
import { materialize } from '../workflow/candidate.js';
import { requestJson } from './transport.js';
import type { DestinationGrant } from './policy.js';
export async function executeRead(candidate: unknown, inputs: unknown, grant: DestinationGrant, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const manifest = manifestSchema.parse(candidate);
  if (manifest.effect !== 'read' || manifest.method !== 'GET') throw new Error('UNSUPPORTED_FEATURE');
  const request = materialize(manifest, inputs);
  const deadline = performance.now() + 30000;
  let data = await requestJson(new URL(request.url), grant, headers);
  if (manifest.pagination) {
    const rule = manifest.pagination;
    if (manifest.projection.length !== 1 || manifest.projection[0] !== rule.items) throw new Error('UNSUPPORTED_FEATURE');
    const items: unknown[] = []; const cursors = new Set<string>();
    for (let page = 0; ; page++) {
      const batch = select(data, rule.items); if (!Array.isArray(batch)) throw new Error('CONTRACT_MISMATCH');
      items.push(...batch); if (items.length > 100) throw new Error('BUDGET_EXCEEDED');
      const next = select(data, rule.next);
      if (next === null || next === '') {
        const projected = { [rule.items]: items };
        if (Buffer.byteLength(JSON.stringify(projected)) > 32768) throw new Error('BUDGET_EXCEEDED');
        return projected;
      }
      if (typeof next !== 'string' || next.length > 200 || cursors.has(next)) throw new Error('CONTRACT_MISMATCH');
      if (page + 1 >= rule.maxPages || performance.now() >= deadline) throw new Error('BUDGET_EXCEEDED');
      cursors.add(next); const url = new URL(request.url); url.searchParams.set(rule.parameter, next);
      data = await requestJson(url, grant, headers, undefined, deadline - performance.now());
    }
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const pointer of manifest.projection) {
    let value: unknown = data;
    for (const escaped of pointer.split('/').slice(1)) {
      const key = escaped.replace(/~1/g, '/').replace(/~0/g, '~');
      if (['__proto__', 'constructor', 'prototype'].includes(key) || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('CONTRACT_MISMATCH');
      value = (value as Record<string, unknown>)[key];
    }
    if (Array.isArray(value) && value.length > 100) throw new Error('BUDGET_EXCEEDED');
    result[pointer] = value;
  }
  if (Buffer.byteLength(JSON.stringify(result)) > 32768) throw new Error('BUDGET_EXCEEDED');
  return result;
}
