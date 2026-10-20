export function summarize(value: unknown, depth = 0): unknown {
  if (depth >= 6) return 'depth-limited';
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length ? [summarize(value[0], depth + 1)] : [];
  if (typeof value !== 'object') return typeof value;
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, child] of Object.entries(value).slice(0, 40)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    result[key] = summarize(child, depth + 1);
  }
  return result;
}
