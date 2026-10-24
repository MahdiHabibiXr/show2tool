import { it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAcceptanceApp } from '../../examples/acceptance-app.js';
import { ReviewStore } from '../../src/approval/review.js';
import { DurableJournal } from '../../src/approval/journal.js';
import { WriteIntents } from '../../src/approval/intents.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { startBroker } from '../../src/broker/server.js';

it('runs guarded synthetic creation through real MCP calls with an independent effects counter', async () => {
  const app = await createAcceptanceApp();
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-mcp-write-'));
  const login = await fetch(app.origin + '/login', { method: 'POST', redirect: 'manual' });
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const journal = await DurableJournal.open(join(dir, 'dispatch.jsonl'));
  const reviews = new ReviewStore(); const intents = new WriteIntents(journal);
  const registry = new WorkflowRegistry(reviews, async () => ({ cookie }), intents);
  const manifest = { schemaVersion: 1, id: 'acceptance_create', origin: app.origin, path: '/api/items', method: 'POST', effect: 'create', inputs: { title: { type: 'string', maxLength: 100 } }, query: {}, body: { title: { source: 'input', name: 'title' } }, projection: ['/id'], provenance: ['controlled-a', 'controlled-b'], mutation: { identity: { path: '/api/me', account: '/account', tenant: '/tenant' }, csrf: { path: '/api/csrf', value: '/token', header: 'x-csrf-token' }, readback: { path: '/api/items', idQuery: 'id', resultId: '/id', recordId: '/id', account: '/account', tenant: '/tenant', fields: { title: '/title' } } } };
  await reviews.review(manifest, { interactive: true, ask: async () => 'review acceptance_create' });
  registry.register(manifest, app.scope);
  const broker = await startBroker(dir, registry);
  const client = new Client({ name: 'acceptance', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/src/cli.js', 'serve', '--stdio'], env: { ...process.env, SHOW2TOOL_STATE_DIR: dir } as Record<string, string>, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const prepared = await client.callTool({ name: 'show2tool_prepare_write', arguments: { id: 'acceptance_create', inputs: { title: 'MCP approved item' } } });
    const envelope = prepared.structuredContent as { ok: boolean; data: { intentId: string } };
    expect(envelope.ok).toBe(true); expect(app.getEffectCount()).toBe(0);
    const rejected = await client.callTool({ name: 'show2tool_execute_write', arguments: { intentId: envelope.data.intentId } });
    expect(rejected.isError).toBe(true); expect(app.getEffectCount()).toBe(0);
    // Tests inject the human boundary; this is not a live human acceptance claim.
    await intents.approve(envelope.data.intentId, { interactive: true, ask: async () => `approve ${envelope.data.intentId}` });
    const executed = await client.callTool({ name: 'show2tool_execute_write', arguments: { intentId: envelope.data.intentId } });
    expect(executed.structuredContent).toMatchObject({ ok: true, data: { state: 'confirmed' } });
    expect(app.getEffectCount()).toBe(1);
    const repeated = await client.callTool({ name: 'show2tool_execute_write', arguments: { intentId: envelope.data.intentId } });
    expect(repeated.isError).toBe(true); expect(app.getEffectCount()).toBe(1);
  } finally { await client.close(); await broker.close(); await journal.close(); await app.close(); await rm(dir, { recursive: true, force: true }); }
});
