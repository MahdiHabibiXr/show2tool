export function select(value: unknown, pointer: string): unknown {
  let result = value;
  for (const encoded of pointer.split('/').slice(1)) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (['__proto__', 'constructor', 'prototype'].includes(key) || !result || typeof result !== 'object' || !Object.hasOwn(result, key)) throw new Error('CONTRACT_MISMATCH');
    result = (result as Record<string, unknown>)[key];
  }
  return result;
}
export function scalar(value: unknown): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).length > 200 || !String(value).length) throw new Error('CONTRACT_MISMATCH');
  return String(value);
}
