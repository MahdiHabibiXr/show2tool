import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableJournal } from '../../src/approval/journal.js';
import { WriteIntents } from '../../src/approval/intents.js';

it('allows one exact human-approved write and checks independent readback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-intents-'));
  const journal = await DurableJournal.open(join(dir, 'journal.jsonl'));
  let effects = 0;
  try {
    const service = new WriteIntents(journal);
    const proposal = { toolId: 'add_book', manifestHash: 'hash', principal: { account: 'alice', tenant: 'team' }, request: { method: 'POST', url: 'https://example.com/books', body: '{"title":"New book"}' } };
    const pending = service.prepare(proposal);
    expect(JSON.stringify(pending)).not.toContain('New book');
    const dispatch = async () => { effects++; return { record: 'book-1' }; };
    const verify = async () => true;
    await expect(service.execute(pending.intentId, proposal, dispatch, verify)).rejects.toThrow('APPROVAL_REQUIRED');
    expect(effects).toBe(0);
    expect(await service.approve(pending.intentId, { interactive: false, ask: async () => 'approve' })).toBe(false);
    expect(await service.approve(pending.intentId, { interactive: true, ask: async prompt => { expect(prompt).toContain('New book'); expect(prompt).toContain('alice'); return `approve ${pending.intentId}`; } })).toBe(true);
    expect(await service.execute(pending.intentId, proposal, dispatch, verify)).toEqual({ intentId: pending.intentId, state: 'confirmed' });
    await expect(service.execute(pending.intentId, proposal, dispatch, verify)).rejects.toThrow('APPROVAL_REQUIRED');
    expect(effects).toBe(1);
  } finally { await journal.close(); await rm(dir, { recursive: true, force: true }); }
});

it('invalidates approval when identity or request changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-identity-'));
  const journal = await DurableJournal.open(join(dir, 'journal.jsonl'));
  try {
    const service = new WriteIntents(journal);
    const proposal = { toolId: 'add_book', manifestHash: 'hash', principal: { account: 'alice', tenant: 'team' }, request: { method: 'POST', url: 'https://example.com/books', body: '{}' } };
    const pending = service.prepare(proposal);
    await service.approve(pending.intentId, { interactive: true, ask: async () => `approve ${pending.intentId}` });
    await expect(service.execute(pending.intentId, { ...proposal, principal: { account: 'bob', tenant: 'team' } }, async () => { throw new Error('must not send'); }, async () => true)).rejects.toThrow('INTENT_CHANGED');
  } finally { await journal.close(); await rm(dir, { recursive: true, force: true }); }
});

it('records unknown without retry on dispatch failure and blocks an identical fresh proposal after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-unknown-'));
  const path = join(dir, 'journal.jsonl');
  let journal = await DurableJournal.open(path);
  try {
    const service = new WriteIntents(journal);
    const proposal = { toolId: 'add_book', manifestHash: 'hash', principal: { account: 'alice', tenant: 'team' }, request: { method: 'POST', url: 'https://example.com/books', body: '{}' } };
    const pending = service.prepare(proposal);
    await service.approve(pending.intentId, { interactive: true, ask: async () => `approve ${pending.intentId}` });
    let effects = 0;
    const result = await service.execute(pending.intentId, proposal, async () => { effects++; throw new Error('lost acknowledgment'); }, async () => true);
    expect(result.state).toBe('unknown'); expect(effects).toBe(1);
    await journal.close(); journal = await DurableJournal.open(path);
    expect(() => new WriteIntents(journal).prepare(proposal)).toThrow('OUTCOME_UNKNOWN');
  } finally { await journal.close(); await rm(dir, { recursive: true, force: true }); }
});

it('expires intent approval and admits only one concurrent execute', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-expiry-'));
  const journal = await DurableJournal.open(join(dir, 'journal.jsonl'));
  try {
    let now = 0; const service = new WriteIntents(journal, () => now);
    const proposal = { toolId: 'add_book', manifestHash: 'hash', principal: { account: 'alice', tenant: 'team' }, request: { method: 'POST', url: 'https://example.com/books', body: '{}' } };
    const expired = service.prepare(proposal); now = 61000;
    await expect(service.approve(expired.intentId, { interactive: true, ask: async () => `approve ${expired.intentId}` })).rejects.toThrow('APPROVAL_EXPIRED');
    const pending = service.prepare(proposal);
    await service.approve(pending.intentId, { interactive: true, ask: async () => `approve ${pending.intentId}` });
    let effects = 0;
    const outcomes = await Promise.allSettled([1, 2].map(() => service.execute(pending.intentId, proposal, async () => { effects++; return {}; }, async () => true)));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(effects).toBe(1);
  } finally { await journal.close(); await rm(dir, { recursive: true, force: true }); }
});
it('does not allow two separately approved identical proposals to race into duplicate effects', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-duplicate-'));
  const journal = await DurableJournal.open(join(dir, 'journal.jsonl'));
  try {
    const service = new WriteIntents(journal);
    const proposal = { toolId: 'add_book', manifestHash: 'hash', principal: { account: 'alice', tenant: 'team' }, request: { method: 'POST', url: 'https://example.com/books', body: '{}' } };
    const a = service.prepare(proposal); const b = service.prepare(proposal);
    for (const pending of [a,b]) await service.approve(pending.intentId, { interactive: true, ask: async () => `approve ${pending.intentId}` });
    let effects = 0;
    const results = await Promise.allSettled([a,b].map(pending => service.execute(pending.intentId, proposal, async () => { effects++; return {}; }, async () => true)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(effects).toBe(1);
  } finally { await journal.close(); await rm(dir, { recursive: true, force: true }); }
});
it('reclaims expired pending slots instead of exhausting the host permanently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-prune-')); const journal = await DurableJournal.open(join(dir, 'journal.jsonl'));
  try {
    let now = 0; const service = new WriteIntents(journal, () => now);
    const proposal = { toolId: 'add_book', manifestHash: 'hash', principal: { account: 'alice', tenant: 'team' }, request: { method: 'POST', url: 'https://example.com/books', body: '{}' } };
    for (let i = 0; i < 100; i++) service.prepare(proposal);
    now = 61000;
    expect(() => service.prepare(proposal)).not.toThrow();
  } finally { await journal.close(); await rm(dir, { recursive: true, force: true }); }
});
it('reports unknown consistently if terminal journal persistence fails after dispatch', async () => {
  const journal = { hasUncertain: () => false, status: () => ({ state: 'dispatching', digest: 'hash' }), record: async (_id: string, state: string) => { if(state !== 'dispatching') throw new Error('disk'); } } as unknown as DurableJournal;
  const service = new WriteIntents(journal);
  const proposal = { toolId:'add_book',manifestHash:'hash',principal:{account:'alice',tenant:'team'},request:{method:'POST',url:'https://example.com/books',body:'{}'} };
  const intent=service.prepare(proposal);await service.approve(intent.intentId,{interactive:true,ask:async()=>`approve ${intent.intentId}`});
  expect((await service.execute(intent.intentId,proposal,async()=>({}),async()=>true)).state).toBe('unknown');
  expect(service.status(intent.intentId).state).toBe('unknown');
});
it('never reconciles an operation while its live dispatch is still pending', async () => {
  const dir=await mkdtemp(join(tmpdir(),'show2tool-live-reconcile-'));const journal=await DurableJournal.open(join(dir,'journal.jsonl'));
  try{const service=new WriteIntents(journal);const proposal={toolId:'add_book',manifestHash:'hash',principal:{account:'alice',tenant:'team'},request:{method:'POST',url:'https://example.com/books',body:'{}'}};
    const intent=service.prepare(proposal);await service.approve(intent.intentId,{interactive:true,ask:async()=>`approve ${intent.intentId}`});
    let finish!:()=>void;let started!:()=>void;const sent=new Promise<void>(resolve=>started=resolve);
    const running=service.execute(intent.intentId,proposal,async()=>{started();await new Promise<void>(resolve=>finish=resolve);return{};},async()=>false);
    await sent;await expect(service.reconcile(intent.intentId,proposal,async()=>true)).rejects.toThrow('OUTCOME_UNKNOWN');finish();await running;
  }finally{await journal.close();await rm(dir,{recursive:true,force:true});}
});
