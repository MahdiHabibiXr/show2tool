import { it, expect } from 'vitest';
import { handle } from '../../src/app/handlers.js';

it('discovers agent commands and never offers an approval capability', async () => {
  const result = await handle({ command: 'commands' });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected command list');
  expect(result.data).toMatchObject({ commands: expect.arrayContaining([expect.objectContaining({ name: 'inspect' }), expect.objectContaining({ name: 'infer' })]) });
  expect((result.data as { commands: { name: string }[] }).commands.map(command => command.name)).not.toContain('approve');
  expect(result.schemaVersion).toBe(1);
});
it('returns stable machine errors without echoing unknown inputs', async () => {
  const result = await handle({ command: 'SECRET_CANARY' });
  expect(result).toMatchObject({ schemaVersion: 1, ok: false, error: { code: 'INVALID_INPUT', retryable: false } });
  expect(JSON.stringify(result)).not.toContain('SECRET_CANARY');
});
it('returns inspection through the same bounded result envelope', async () => {
  const result = await handle({ command: 'inspect', recording: [{ method: 'GET', path: '/catalog', queryKeys: [], status: 200, shape: {} }] });
  expect(result).toMatchObject({ ok: true, data: { requestCount: 1, complete: true }, meta: { complete: true } });
});
it('rejects extra command fields before processing', async () => {
  const result = await handle({ command: 'commands', injected: 'secret' });
  expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
});
it('compiles candidates through discoverable shared agent handlers', async () => {
  const specification = { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: { search: { type: 'string', maxLength: 50 } }, projection: ['/items'] };
  const demonstrations = ['first', 'second'].map((value, index) => ({ inputs: { search: value }, request: { id: String(index), method: 'GET', path: '/catalog', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: value } } }));
  expect(await handle({ command: 'candidate', specification, demonstrations })).toMatchObject({ ok: true, data: { schemaVersion: 1, query: { term: { source: 'input', name: 'search' } } } });
});
it('returns usable schemas rather than failing on runtime-only refinements', async () => {
  expect(await handle({ command: 'schema' })).toMatchObject({ ok: true, data: { oneOf: expect.any(Array) } });
});
it('propagates incomplete recording status into result metadata', async () => {
  expect(await handle({ command: 'inspect', recording: [] })).toMatchObject({ ok: true, meta: { complete: false } });
});
it('preserves actionable review errors instead of disguising them as malformed input', async () => {
  const { ReviewStore } = await import('../../src/approval/review.js');
  const { WorkflowRegistry } = await import('../../src/app/registry.js');
  const registry = new WorkflowRegistry(new ReviewStore());
  expect(await handle({ command: 'run', id: 'missing', inputs: {} }, registry)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
});
