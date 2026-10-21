import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOwnership } from '../../src/broker/ownership.js';
it('locks the state directory before a browser can open and releases explicitly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-lock-'));
  try {
    const owner = await acquireOwnership(dir);
    await expect(acquireOwnership(dir)).rejects.toThrow('BROKER_ALREADY_RUNNING');
    await owner.release();
    const next = await acquireOwnership(dir);
    await next.release();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
