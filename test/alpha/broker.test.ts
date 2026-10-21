import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startBroker, callBroker } from '../../src/broker/server.js';
it('owns one IPC endpoint and handles shared commands across clients', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-broker-'));
  const broker = await startBroker(dir);
  try {
    const results = await Promise.all([callBroker(dir, { command: 'commands' }), callBroker(dir, { command: 'inspect', recording: [] })]);
    expect(results[0]).toMatchObject({ ok: true, schemaVersion: 1 });
    expect(results[1]).toMatchObject({ ok: true, data: { complete: false } });
    await expect(startBroker(dir)).rejects.toThrow('BROKER_ALREADY_RUNNING');
  } finally { await broker.close(); await rm(dir, { recursive: true, force: true }); }
});
it('allows a bounded multi-page read to outlive the old 15-second IPC deadline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-long-read-'));
  const { ReviewStore } = await import('../../src/approval/review.js');
  const { WorkflowRegistry } = await import('../../src/app/registry.js');
  class SlowRegistry extends WorkflowRegistry {
    override async run(): Promise<unknown> {
      await new Promise(resolve => setTimeout(resolve, 15500));
      return { '/items': ['finished'] };
    }
  }
  const broker = await startBroker(dir, new SlowRegistry(new ReviewStore()));
  try {
    expect(await callBroker(dir, { command: 'run', id: 'slow', inputs: {} })).toMatchObject({ ok: true, data: { '/items': ['finished'] } });
  } finally { await broker.close(); await rm(dir, { recursive: true, force: true }); }
}, 25000);
it('returns stable unavailable error without leaking filesystem paths', async () => {
  const result = await callBroker(join(tmpdir(), 'no-broker-' + Date.now()), { command: 'commands' });
  expect(result).toMatchObject({ ok: false, error: { code: 'BROKER_UNAVAILABLE' } });
  expect(JSON.stringify(result)).not.toContain(tmpdir());
});
it('rejects agent self-review over supported IPC commands', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-no-review-'));
  const broker = await startBroker(dir);
  try {
    for (const command of ['review', 'approve', 'authorize']) expect(await callBroker(dir, { command, interactive: true })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  } finally { await broker.close(); await rm(dir, { recursive: true, force: true }); }
});
