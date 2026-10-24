import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DurableJournal, type DispatchState } from './journal.js';
const proposalSchema = z.object({
  toolId: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), manifestHash: z.string().min(1).max(128),
  principal: z.object({ account: z.string().min(1).max(200), tenant: z.string().min(1).max(200) }).strict(),
  request: z.object({ method: z.enum(['POST', 'PUT', 'PATCH']), url: z.string().url().max(4096), body: z.string().max(65536), version: z.string().max(200).optional() }).strict(),
}).strict();
export type WriteProposal = z.infer<typeof proposalSchema>;
function digest(value: WriteProposal): string {
  const request = value.request;
  return createHash('sha256').update(JSON.stringify([value.toolId, value.manifestHash, value.principal.account, value.principal.tenant, request.method, request.url, request.body, request.version ?? null])).digest('hex');
}
export class WriteIntents {
  private readonly dispatched = new Set<string>();
  private readonly pending = new Map<string, { proposal: WriteProposal; digest: string; expiresAt: number; state: 'pending' | 'approved' | 'dispatching' | 'confirmed' | 'unknown' }>();
  constructor(private readonly journal: DurableJournal, private readonly now: () => number = Date.now) {}
  prepare(value: unknown): { intentId: string; expiresAt: number; state: string } {
    const proposal = proposalSchema.parse(value);
    const hash = digest(proposal);
    if (this.journal.hasUncertain(hash)) throw new Error('OUTCOME_UNKNOWN');
    for (const [id, entry] of this.pending) if (entry.state !== 'dispatching' && (this.now() >= entry.expiresAt || ['confirmed', 'unknown'].includes(entry.state))) this.pending.delete(id);
    if (this.pending.size >= 100) throw new Error('BUDGET_EXCEEDED');
    const intentId = randomUUID(); const expiresAt = this.now() + 60000;
    this.pending.set(intentId, { proposal: structuredClone(proposal), digest: hash, expiresAt, state: 'pending' });
    return { intentId, expiresAt, state: 'pending' };
  }
  private entry(id: string) {
    const entry = this.pending.get(id);
    if (!entry) throw new Error('APPROVAL_REQUIRED');
    if (this.now() >= entry.expiresAt) throw new Error('APPROVAL_EXPIRED');
    return entry;
  }
  async approve(id: string, terminal: { interactive: boolean; ask(prompt: string): Promise<string> }): Promise<boolean> {
    if (!terminal.interactive) return false;
    const entry = this.entry(id);
    if (entry.state !== 'pending') throw new Error('APPROVAL_REQUIRED');
    const answer = await terminal.ask(`Exact write proposal ${JSON.stringify(entry.proposal)}\nExpires ${entry.expiresAt}\nType approve ${id}: `);
    if (answer !== `approve ${id}`) return false;
    this.entry(id); entry.state = 'approved'; return true;
  }
  status(id: string): { state: string } {
    const persisted = this.journal.status(id);
    const local = this.pending.get(id);
    return { state: local?.state === 'unknown' ? 'unknown' : persisted?.state ?? (local && this.now() >= local.expiresAt ? 'expired' : local?.state) ?? 'unavailable' };
  }
  async reconcile(id: string, value: unknown, read: () => Promise<boolean>): Promise<{ intentId: string; state: string }> {
    const proposal = proposalSchema.parse(value);
    if (this.pending.get(id)?.state === 'dispatching') throw new Error('OUTCOME_UNKNOWN');
    const entry = this.journal.status(id);
    if (!entry || entry.digest !== digest(proposal) || !['unknown', 'dispatching'].includes(entry.state)) throw new Error('INTENT_CHANGED');
    let verified = false; try { verified = await read(); } catch { verified = false; }
    if (!verified) return { intentId: id, state: 'unknown' };
    await this.journal.record(id, 'confirmed', entry.digest);
    const pending = this.pending.get(id); if (pending) pending.state = 'confirmed';
    return { intentId: id, state: 'confirmed' };
  }
  async execute(id: string, current: unknown, send: () => Promise<unknown>, verify: (result: unknown) => Promise<boolean>): Promise<{ intentId: string; state: 'confirmed' | 'unknown' }> {
    const entry = this.entry(id);
    if (entry.state !== 'approved') throw new Error('APPROVAL_REQUIRED');
    if (digest(proposalSchema.parse(current)) !== entry.digest) { entry.state = 'pending'; throw new Error('INTENT_CHANGED'); }
    if (this.journal.hasUncertain(entry.digest)) throw new Error('OUTCOME_UNKNOWN');
    if (this.dispatched.has(entry.digest)) throw new Error('DUPLICATE_OPERATION');
    this.dispatched.add(entry.digest);
    // Consume synchronously before the first await, then durably record before network dispatch.
    entry.state = 'dispatching';
    try { await this.journal.record(id, 'dispatching', entry.digest); }
    catch { entry.state = 'unknown'; throw new Error('JOURNAL_UNAVAILABLE'); }
    let state: 'confirmed' | 'unknown' = 'unknown';
    try { state = await verify(await send()) ? 'confirmed' : 'unknown'; } catch { state = 'unknown'; }
    try { await this.journal.record(id, state as DispatchState, entry.digest); }
    catch { state = 'unknown'; }
    entry.state = state;
    return { intentId: id, state };
  }
}
