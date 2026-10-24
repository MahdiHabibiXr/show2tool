export type ErrorCode = 'INVALID_INPUT' | 'BUDGET_EXCEEDED' | 'REVIEW_REQUIRED' | 'APPROVAL_REQUIRED' | 'AUTH_REQUIRED' | 'BROKER_UNAVAILABLE' | 'OUTCOME_UNKNOWN' | 'UNSUPPORTED_FEATURE' | 'INTENT_CHANGED' | 'APPROVAL_EXPIRED' | 'JOURNAL_UNAVAILABLE' | 'DUPLICATE_OPERATION' | 'CONTRACT_CHANGED' | 'CONTRACT_MISMATCH' | 'UNSUPPORTED_AUTH' | 'INCOMPLETE_EVIDENCE' | 'AMBIGUOUS_BINDING' | 'UPSTREAM_FAILED' | 'UPSTREAM_TIMEOUT' | 'UPSTREAM_REJECTED' | 'INVALID_RESPONSE' | 'IDENTITY_MISMATCH';
export type Result = { schemaVersion: 1; ok: true; data: unknown; meta: { complete: boolean } } | { schemaVersion: 1; ok: false; error: { code: ErrorCode; message: string; retryable: boolean; nextAction?: string } };
export function failure(code: ErrorCode, message: string, nextAction?: string): Result {
  return { schemaVersion: 1, ok: false, error: { code, message, retryable: false, ...(nextAction ? { nextAction } : {}) } };
}
export function success(data: unknown, complete = true): Result {
  const result: Result = { schemaVersion: 1, ok: true, data, meta: { complete } };
  if (Buffer.byteLength(JSON.stringify(result)) > 32768) return failure('BUDGET_EXCEEDED', 'Result exceeds the 32 KiB output limit.');
  return result;
}
