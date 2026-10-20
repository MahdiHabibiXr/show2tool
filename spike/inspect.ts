type Endpoint = { method: string; path: string; count: number; queryKeys: string[]; incomplete: number; statuses: number[] };
export function inspectRecording(value: unknown): { complete: boolean; requestCount: number; endpoints: Endpoint[] } {
  if (!Array.isArray(value) || value.length > 100) throw new Error('invalid recording');
  const groups = new Map<string, Endpoint>();
  for (const row of value) {
    if (!row || typeof row !== 'object' || !['GET', 'POST', 'PUT', 'PATCH', 'HEAD', 'OPTIONS', 'DELETE'].includes(row.method) ||
        typeof row.path !== 'string' || !row.path.startsWith('/') || row.path.length > 2048 || /[\x00-\x1f\x7f]/.test(row.path) ||
        !Array.isArray(row.queryKeys) || row.queryKeys.length > 20 || !row.queryKeys.every((key: unknown) => typeof key === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) ||
        !Number.isInteger(row.status) || row.status < 0 || row.status > 599) throw new Error('invalid recording');
    const key = row.method + ' ' + row.path;
    const endpoint = groups.get(key) ?? { method: row.method, path: row.path, count: 0, queryKeys: [], incomplete: 0, statuses: [] };
    endpoint.count++;
    if (row.shape == null || row.omittedReason || row.requestOmittedReason || row.status === 0) endpoint.incomplete++;
    endpoint.queryKeys = [...new Set([...endpoint.queryKeys, ...row.queryKeys as string[]])].sort();
    endpoint.statuses = [...new Set([...endpoint.statuses, row.status as number])].sort((a, b) => a - b);
    groups.set(key, endpoint);
  }
  const endpoints = [...groups.values()];
  return { complete: value.length > 0 && endpoints.every(endpoint => endpoint.incomplete === 0), requestCount: value.length, endpoints };
}
