import { it, expect } from 'vitest';
import { handle } from '../../src/app/handlers.js';
it('recording commands explicitly require an owned browser session', async () => {
  expect(await handle({ command: 'record_start', inputs: { search: 'alpha' } })).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED' } });
  expect(await handle({ command: 'record_stop' })).toMatchObject({ ok: false, error: { code: 'AUTH_REQUIRED' } });
});
it('raw recordings are not assumed to authorize site execution', async () => {
  expect(await handle({ command: 'run', id: 'catalog', inputs: {} })).toMatchObject({ ok: false, error: { code: 'BROKER_UNAVAILABLE' } });
});
