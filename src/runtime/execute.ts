import { manifestSchema } from '../contracts/manifest.js';
import { materialize } from '../workflow/candidate.js';
import { requestJson } from './transport.js';
import type { DestinationGrant } from './policy.js';

function atPointer(data: unknown, pointer: string): unknown {
  let value = data;
  for (const escaped of pointer.split('/').slice(1)) {
    const key = escaped.replace(/~1/g, '/').replace(/~0/g, '~');
    if (['__proto__', 'constructor', 'prototype'].includes(key) || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('CONTRACT_MISMATCH');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
export async function executeRead(candidate: unknown, inputs: unknown, grant: DestinationGrant, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const manifest = manifestSchema.parse(candidate);
  if (manifest.effect !== 'read' || manifest.method !== 'GET') throw new Error('UNSUPPORTED_FEATURE');
  const request = materialize(manifest, inputs);
  const paging = manifest.pagination;
  if (paging && (manifest.projection.length !== 1 || manifest.projection[0] !== paging.itemsPointer || Object.hasOwn(manifest.query, paging.cursorQuery))) throw new Error('INVALID_INPUT');
  const url = new URL(request.url);
  const cursors = new Set<string>();
  const items: unknown[] = [];
  let data: unknown;
  const started = Date.now();
  for (let page = 0; page < (paging?.maxPages ?? 1); page++) {
    if (Date.now() - started >= 60000) throw new Error('BUDGET_EXCEEDED');
    data = await requestJson(url, grant, headers);
    if (!paging) break;
    const batch = atPointer(data, paging.itemsPointer);
    if (!Array.isArray(batch)) throw new Error('CONTRACT_MISMATCH');
    items.push(...batch);
    if (items.length > 100 || Buffer.byteLength(JSON.stringify(items)) > 32768) throw new Error('BUDGET_EXCEEDED');
    const next = atPointer(data, paging.nextPointer);
    if (next === null) break;
    if (typeof next !== 'string' || !next.length || next.length > 200 || cursors.has(next)) throw new Error('CONTRACT_MISMATCH');
    if (page + 1 >= paging.maxPages) throw new Error('BUDGET_EXCEEDED');
    cursors.add(next);
    url.searchParams.set(paging.cursorQuery, next);
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const pointer of manifest.projection) {
    const value = paging ? items : atPointer(data, pointer);
    if (Array.isArray(value) && value.length > 100) throw new Error('BUDGET_EXCEEDED');
    result[pointer] = value;
  }
  if (Buffer.byteLength(JSON.stringify(result)) > 32768) throw new Error('BUDGET_EXCEEDED');
  return result;
}
