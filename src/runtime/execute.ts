import { manifestSchema } from '../contracts/manifest.js';
import { materialize } from '../workflow/candidate.js';
import { requestJson } from './transport.js';
import type { DestinationGrant } from './policy.js';
export async function executeRead(candidate: unknown, inputs: unknown, grant: DestinationGrant, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const manifest = manifestSchema.parse(candidate);
  if (manifest.effect !== 'read' || manifest.method !== 'GET') throw new Error('UNSUPPORTED_FEATURE');
  const request = materialize(manifest, inputs);
  const data = await requestJson(new URL(request.url), grant, headers);
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
