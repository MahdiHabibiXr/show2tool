export async function withinDeadline<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) { void work.catch(() => {}); throw new Error('BUDGET_EXCEEDED'); }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('BUDGET_EXCEEDED'));
    signal.addEventListener('abort', abort, { once: true });
    work.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) reject(new Error('BUDGET_EXCEEDED')); else resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
