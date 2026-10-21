import { randomUUID } from 'node:crypto';
import { z } from 'zod';
const payloadSchema = z.object({
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  principal: z.string().min(1).max(200),
  method: z.enum(['POST', 'PATCH', 'PUT']),
  url: z.string().url().max(2048).refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash; }),
  body: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).refine(name => !['__proto__', 'constructor', 'prototype'].includes(name)), z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()])).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 20),
  precondition: z.string().max(200).optional(),
}).strict();
type Payload = z.infer<typeof payloadSchema>;
export class PendingIntents {
  private readonly entries = new Map<string, { payload: Payload; expiresAt: number; state: 'pending' | 'reviewing' | 'approved' }>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly now: () => number = Date.now) {}
  private drop(id: string): void { this.entries.delete(id); clearTimeout(this.timers.get(id)); this.timers.delete(id); }
  prepare(value: unknown): { id: string; expiresAt: number } {
    const payload = payloadSchema.parse(value);
    for (const [id, entry] of this.entries) if (this.now() >= entry.expiresAt) this.drop(id);
    if (this.entries.size >= 20) throw new Error('BUDGET_EXCEEDED');
    const id = randomUUID(); const expiresAt = this.now() + 60000;
    this.entries.set(id, { payload: structuredClone(payload), expiresAt, state: 'pending' });
    const timer = setTimeout(() => this.drop(id), 60000); timer.unref(); this.timers.set(id, timer);
    return { id, expiresAt };
  }
  async approve(id: string, terminal: { interactive: boolean; ask(prompt: string): Promise<string> }): Promise<boolean> {
    const entry = this.entries.get(id);
    if (entry && this.now() >= entry.expiresAt) { this.drop(id); return false; }
    if (!terminal.interactive || !entry || entry.state !== 'pending') return false;
    entry.state = 'reviewing';
    let answer: string;
    try { answer = await terminal.ask(`Proposed mutation ${JSON.stringify(entry.payload)}\nExpires ${new Date(entry.expiresAt).toISOString()}\nType approve ${id}: `); }
    catch { this.drop(id); return false; }
    if (answer !== `approve ${id}` || this.now() >= entry.expiresAt) { this.drop(id); return false; }
    entry.state = 'approved'; return true;
  }
  consume(id: string): Payload {
    const entry = this.entries.get(id);
    if (!entry || entry.state !== 'approved' || this.now() >= entry.expiresAt) { if (entry && this.now() >= entry.expiresAt) this.drop(id); throw new Error('APPROVAL_REQUIRED'); }
    this.drop(id);
    return structuredClone(entry.payload);
  }
}
