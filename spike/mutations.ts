import { mutationSchema, prepareMutation, type MutationContract } from '../src/contracts/mutation.js';
import { PendingIntents } from '../src/approval/pending.js';
import { MutationJournal } from '../src/approval/journal.js';
import { resolvePath } from '../src/contracts/paths.js';
import { fixtureJson, type Auth } from './replay.js';
function pointer(data: unknown, path: string): unknown {
  let value = data;
  for (const part of path.split('/').slice(1)) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (['__proto__', 'constructor', 'prototype'].includes(key) || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('CONTRACT_MISMATCH');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
export class SyntheticMutations {
  private readonly intents = new PendingIntents();
  private readonly journal: MutationJournal;
  private readonly contexts = new Map<string, { contract: MutationContract; inputs: Record<string, string>; expiresAt: number }>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private drop(id: string): void { this.contexts.delete(id); clearTimeout(this.timers.get(id)); this.timers.delete(id); }
  constructor(stateDir: string, private readonly auth: Auth) { this.journal = new MutationJournal(stateDir); }
  async prepare(value: unknown, inputs: Record<string, string>) {
    const contract = mutationSchema.parse(value);
    const principal = pointer(await fixtureJson(contract.origin, resolvePath(contract.principal.path, inputs), this.auth), contract.principal.pointer);
    if (typeof principal !== 'string') throw new Error('AUTH_REQUIRED');
    const version = contract.precondition ? pointer(await fixtureJson(contract.origin, resolvePath(contract.precondition.path, inputs), this.auth), contract.precondition.pointer) : undefined;
    const prepared = prepareMutation(contract, inputs, { principal, ...(version !== undefined ? { precondition: String(version) } : {}) });
    const intent = this.intents.prepare(prepared);
    for (const [id, context] of this.contexts) if (Date.now() >= context.expiresAt) this.drop(id);
    this.contexts.set(intent.id, { contract: structuredClone(contract), inputs: structuredClone(inputs), expiresAt: intent.expiresAt });
    const timer = setTimeout(() => this.drop(intent.id), 60000); timer.unref(); this.timers.set(intent.id, timer);
    return intent;
  }
  async approve(id: string, terminal: { interactive: boolean; ask(prompt: string): Promise<string> }) {
    const approved = await this.intents.approve(id, terminal);
    if (!approved) this.drop(id);
    return approved;
  }
  async dispatch(id: string): Promise<{ status: 'confirmed' | 'unknown' }> {
    const payload = this.intents.consume(id);
    const context = this.contexts.get(id); this.drop(id);
    if (!context) throw new Error('APPROVAL_REQUIRED');
    const { contract, inputs } = context;
    const principal = pointer(await fixtureJson(contract.origin, resolvePath(contract.principal.path, inputs), this.auth), contract.principal.pointer);
    if (principal !== payload.principal) throw new Error('AUTH_REQUIRED');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (contract.precondition) {
      const version = pointer(await fixtureJson(contract.origin, resolvePath(contract.precondition.path, inputs), this.auth), contract.precondition.pointer);
      if (String(version) !== payload.precondition) throw new Error('PRECONDITION_FAILED');
      headers['if-match'] = payload.precondition!;
    }
    if (contract.csrf) {
      const token = pointer(await fixtureJson(contract.origin, resolvePath(contract.csrf.path, inputs), this.auth), contract.csrf.pointer);
      if (typeof token !== 'string' || !token.length || token.length > 200 || /[\r\n]/.test(token)) throw new Error('AUTH_REQUIRED');
      headers[contract.csrf.header] = token;
    }
    if (Date.now() >= context.expiresAt) throw new Error('APPROVAL_REQUIRED');
    if (!await this.journal.claim(id)) throw new Error('APPROVAL_REQUIRED');
    try {
      if (Date.now() >= context.expiresAt) { await this.journal.finish(id, 'rejected'); throw new Error('APPROVAL_REQUIRED'); }
      const result = await fixtureJson(contract.origin, new URL(payload.url).pathname, this.auth, { method: payload.method, headers, body: JSON.stringify(payload.body) });
      const createdId = contract.readBack.idSource ? pointer(result, contract.readBack.idSource) : undefined;
      if (createdId !== undefined && typeof createdId !== 'string') throw new Error('CONTRACT_MISMATCH');
      const backInputs = { ...inputs, ...(typeof createdId === 'string' ? { createdId } : {}) };
      const verified = await fixtureJson(contract.origin, resolvePath(contract.readBack.path, backInputs), this.auth);
      const resultId = pointer(result, '/id');
      const readId = pointer(verified, '/id');
      const targetId = contract.effect === 'create' ? createdId : new URL(payload.url).pathname.split('/').at(-1);
      if (resultId !== targetId || readId !== targetId) throw new Error('CONTRACT_MISMATCH');
      if (contract.effect === 'update' && pointer(verified, '/version') !== Number(payload.precondition) + 1) throw new Error('CONTRACT_MISMATCH');
      const correct = Object.entries(contract.readBack.expected).every(([path, expected]) => pointer(verified, path) === (expected.source === 'principal' ? payload.principal : expected.source === 'input' ? inputs[expected.name] : expected.value));
      const status = correct ? 'confirmed' : 'unknown';
      await this.journal.finish(id, status);
      return { status };
    } catch {
      try { await this.journal.finish(id, 'unknown'); } catch {}
      return { status: 'unknown' };
    }
  }
}
