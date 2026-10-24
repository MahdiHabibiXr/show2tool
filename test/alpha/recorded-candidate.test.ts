import { it, expect } from 'vitest';
import { handle } from '../../src/app/handlers.js';
it('requires an owned session when compiling from recording IDs', async () => {
  expect(await handle({ command: 'compile_recordings', ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'], requestIds: ['request:0', 'request:0'], specification: { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs: { term: { type: 'string', maxLength: 100 } }, projection: ['/items'] } })).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED' } });
});
