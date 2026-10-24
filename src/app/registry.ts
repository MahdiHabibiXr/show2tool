import { runChain } from '../runtime/chain.js';
import { exportBundle } from '../workflow/bundle.js';
import { verifyFacts } from '../runtime/verify.js';
import { WriteIntents, type WriteProposal } from '../approval/intents.js';
import { manifestHash } from '../approval/review.js';
import { requestJson } from '../runtime/transport.js';
import { select, scalar } from '../runtime/pointer.js';
import { materialize } from '../workflow/candidate.js';
import { ReviewStore } from '../approval/review.js';
import { executeRead } from '../runtime/execute.js';
import type { DestinationGrant } from '../runtime/policy.js';
import type { Manifest } from '../contracts/manifest.js';
export class WorkflowRegistry {
  private readonly tools = new Map<string, { manifest: Manifest; grant: DestinationGrant }>();
  private readonly operations = new Map<string, { id: string; inputs: unknown; proposal: WriteProposal }>();
  constructor(private readonly reviews: ReviewStore, private readonly credentials?: (url: string) => Promise<Record<string, string>>, private readonly intents?: WriteIntents) {}
  register(value: unknown, grant: DestinationGrant): void {
    const manifest = this.reviews.require(value);
    if (manifest.origin !== grant.origin || (grant.paths && !grant.paths.includes(manifest.path))) throw new Error('REVIEW_REQUIRED');
    if ((grant.queryKeys && Object.keys(manifest.query).some(key => !grant.queryKeys!.includes(key))) || (grant.bodyKeys && Object.keys(manifest.body).some(key => !grant.bodyKeys!.includes(key)))) throw new Error('REVIEW_REQUIRED');
    if (manifest.pagination && (manifest.effect !== 'read' || (grant.queryKeys && !grant.queryKeys.includes(manifest.pagination.parameter)))) throw new Error('REVIEW_REQUIRED');
    if (manifest.effect === 'update') {
      const pre = manifest.mutation?.precondition;
      const target = pre && manifest.query[pre.idQuery];
      if (!pre || !target || target.source !== 'input' || target.name !== pre.idInput || Object.hasOwn(manifest.body, pre.idQuery)) throw new Error('REVIEW_REQUIRED');
    }
    if (manifest.mutation) {
      if (Object.keys(manifest.body).some(key => !Object.hasOwn(manifest.mutation!.readback.fields, key)) || Object.keys(manifest.query).some(key => manifest.effect !== 'update' || key !== manifest.mutation!.precondition?.idQuery)) throw new Error('REVIEW_REQUIRED');
      const paths = [manifest.mutation.identity.path, manifest.mutation.readback.path, ...(manifest.mutation.csrf ? [manifest.mutation.csrf.path] : []), ...(manifest.mutation.precondition ? [manifest.mutation.precondition.path] : [])];
      if (grant.paths && paths.some(path => !grant.paths!.includes(path))) throw new Error('REVIEW_REQUIRED');
      if (grant.queryKeys && (!grant.queryKeys.includes(manifest.mutation.readback.idQuery) || (manifest.mutation.precondition && !grant.queryKeys.includes(manifest.mutation.precondition.idQuery)))) throw new Error('REVIEW_REQUIRED');
    }
    this.tools.set(manifest.id, { manifest: structuredClone(manifest), grant: structuredClone(grant) });
  }
  private async proposal(id: string, inputs: unknown, credentialSnapshot?: (url: string) => Record<string, string>): Promise<WriteProposal> {
    const tool = this.tools.get(id);
    if (!tool || !this.intents) throw new Error('REVIEW_REQUIRED');
    const manifest = this.reviews.require(tool.manifest);
    if (manifest.effect === 'read' || !manifest.mutation) throw new Error('UNSUPPORTED_FEATURE');
    const request = materialize(manifest, inputs);
    const identityUrl = new URL(manifest.mutation.identity.path, manifest.origin);
    const identity = await requestJson(identityUrl, tool.grant, credentialSnapshot ? credentialSnapshot(identityUrl.href) : await this.credentials?.(identityUrl.href));
    const principal = { account: scalar(select(identity, manifest.mutation.identity.account)), tenant: scalar(select(identity, manifest.mutation.identity.tenant)) };
    let version: string | undefined;
    if (manifest.effect === 'update') {
      const pre = manifest.mutation.precondition;
      if (!pre || !inputs || typeof inputs !== 'object') throw new Error('UNSUPPORTED_FEATURE');
      const idValue = (inputs as Record<string, unknown>)[pre.idInput];
      const target = new URL(pre.path, manifest.origin); target.searchParams.set(pre.idQuery, scalar(idValue));
      const before = await requestJson(target, tool.grant, credentialSnapshot ? credentialSnapshot(target.href) : await this.credentials?.(target.href));
      if (scalar(select(before, manifest.mutation.readback.recordId)) !== String(idValue) || scalar(select(before, manifest.mutation.readback.account)) !== principal.account || scalar(select(before, manifest.mutation.readback.tenant)) !== principal.tenant) throw new Error('IDENTITY_MISMATCH');
      version = scalar(select(before, pre.version));
    }
    return { toolId: id, manifestHash: manifestHash(manifest), principal, request: { method: request.method as 'POST' | 'PUT' | 'PATCH', url: request.url, body: request.body ?? '{}', ...(version ? { version } : {}) } };
  }
  async prepareWrite(id: string, inputs: unknown): Promise<{ intentId: string; expiresAt: number; state: string }> {
    if (!this.intents) throw new Error('UNSUPPORTED_FEATURE');
    for (const [intentId] of this.operations) if (!['pending', 'approved', 'dispatching', 'unknown'].includes(this.intents.status(intentId).state)) this.operations.delete(intentId);
    if (this.operations.size >= 100) throw new Error('BUDGET_EXCEEDED');
    const tool = this.tools.get(id); if (!tool) throw new Error('REVIEW_REQUIRED');
    const preview = materialize(tool.manifest, inputs);
    const snapshot = await this.snapshot(tool.manifest, preview.url);
    const proposal = await this.proposal(id, inputs, snapshot);
    const pending = this.intents.prepare(proposal);
    this.operations.set(pending.intentId, { id, inputs: structuredClone(inputs), proposal });
    return pending;
  }
  writeStatus(id: string): { state: string } { if (!this.intents) throw new Error('UNSUPPORTED_FEATURE'); return this.intents.status(id); }
  async executeWrite(intentId: string): Promise<{ intentId: string; state: string }> {
    const operation = this.operations.get(intentId);
    if (!operation || !this.intents) throw new Error('APPROVAL_REQUIRED');
    const tool = this.tools.get(operation.id)!;
    const credentialSnapshot = await this.snapshot(tool.manifest, operation.proposal.request.url);
    const current = await this.proposal(operation.id, operation.inputs, credentialSnapshot);
    const mutation = tool.manifest.mutation!;
    const headers = { ...credentialSnapshot(current.request.url) };
    if (current.request.version) headers['if-match'] = current.request.version;
    if (mutation.csrf) {
      const csrf = await requestJson(new URL(mutation.csrf.path, tool.manifest.origin), tool.grant, credentialSnapshot(new URL(mutation.csrf.path, tool.manifest.origin).href));
      headers[mutation.csrf.header] = scalar(select(csrf, mutation.csrf.value));
    }
    return this.intents.execute(intentId, current, () => requestJson(new URL(current.request.url), tool.grant, headers, { method: current.request.method, body: current.request.body }), async response => {
      const resultId = scalar(select(response, mutation.readback.resultId));
      if (tool.manifest.effect === 'update') {
        const inputId = (operation.inputs as Record<string, unknown>)[mutation.precondition!.idInput];
        if (resultId !== String(inputId)) return false;
      }
      return this.checkWriteResult(tool, current, resultId, credentialSnapshot(new URL(mutation.readback.path, tool.manifest.origin).href));
    });
  }

  private async snapshot(manifest: Manifest, mutationUrl: string): Promise<(url: string) => Record<string, string>> {
    const recipe = manifest.mutation!;
    const urls = [mutationUrl, new URL(recipe.identity.path, manifest.origin).href, new URL(recipe.readback.path, manifest.origin).href, ...(recipe.precondition ? [new URL(recipe.precondition.path, manifest.origin).href] : []), ...(recipe.csrf ? [new URL(recipe.csrf.path, manifest.origin).href] : [])];
    const entries = await Promise.all(urls.map(async url => [new URL(url).pathname, { ...await this.credentials?.(url) }] as const));
    const map = new Map(entries);
    const normalize = (headers: Record<string,string>) => JSON.stringify(Object.entries(headers).sort(([a],[b]) => a.localeCompare(b)));
    if (new Set([...map.values()].map(normalize)).size > 1) throw new Error('UNSUPPORTED_AUTH');
    return url => { const target = new URL(url); if (target.origin !== manifest.origin || !map.has(target.pathname)) throw new Error('REVIEW_REQUIRED'); return { ...map.get(target.pathname)! }; };
  }
  private async checkWriteResult(tool: { manifest: Manifest; grant: DestinationGrant }, proposal: WriteProposal, resultId: string, headers: Record<string, string>): Promise<boolean> {
    const mutation = tool.manifest.mutation!;
    const url = new URL(mutation.readback.path, tool.manifest.origin); url.searchParams.set(mutation.readback.idQuery, resultId);
    const record = await requestJson(url, tool.grant, headers);
    if (scalar(select(record, mutation.readback.recordId)) !== resultId || scalar(select(record, mutation.readback.account)) !== proposal.principal.account || scalar(select(record, mutation.readback.tenant)) !== proposal.principal.tenant) return false;
    if (proposal.request.version && mutation.readback.version && scalar(select(record, mutation.readback.version)) === proposal.request.version) return false;
    const body = JSON.parse(proposal.request.body) as Record<string, unknown>;
    return Object.entries(mutation.readback.fields).every(([field, pointer]) => Object.hasOwn(body, field) && select(record, pointer) === body[field]);
  }
  async reconcileWrite(intentId: string, resultId: string, recovery?: { id: string; inputs: unknown; version?: string }): Promise<unknown> {
    let operation = this.operations.get(intentId);
    if (!operation && recovery && this.intents) { const proposal = await this.proposal(recovery.id, recovery.inputs); if (recovery.version) proposal.request.version = recovery.version; operation = { id: recovery.id, inputs: recovery.inputs, proposal }; }
    if (!operation || !this.intents || !resultId || resultId.length > 200) throw new Error('INTENT_CHANGED');
    const tool = this.tools.get(operation.id); if (!tool || manifestHash(this.reviews.require(tool.manifest)) !== operation.proposal.manifestHash) throw new Error('REVIEW_REQUIRED');
    if (tool.manifest.effect === 'update' && resultId !== String((operation.inputs as Record<string, unknown>)[tool.manifest.mutation!.precondition!.idInput])) throw new Error('INTENT_CHANGED');
    const frozen = await this.snapshot(tool.manifest, operation.proposal.request.url);
    const identity = tool.manifest.mutation!.identity;
    const identityUrl = new URL(identity.path, tool.manifest.origin);
    const principal = await requestJson(identityUrl, tool.grant, frozen(identityUrl.href));
    if (scalar(select(principal, identity.account)) !== operation.proposal.principal.account || scalar(select(principal, identity.tenant)) !== operation.proposal.principal.tenant) throw new Error('INTENT_CHANGED');
    return this.intents.reconcile(intentId, operation.proposal, () => this.checkWriteResult(tool, operation.proposal, resultId, frozen(new URL(tool.manifest.mutation!.readback.path, tool.manifest.origin).href)));
  }

  async chain(inputs: unknown, steps: unknown): Promise<unknown> {
    return runChain(inputs, steps, async (id, values, digest) => {
      const description = this.describe(id); if (description.effect !== 'read') throw new Error('UNSUPPORTED_FEATURE');
      if (Object.values(values).some(value => typeof value !== 'string')) throw new Error('INVALID_INPUT');
      return this.run(id, values, digest);
    });
  }
  describe(id: string) {
    const entry = this.tools.get(id); if (!entry) throw new Error('REVIEW_REQUIRED');
    const manifest = this.reviews.require(entry.manifest);
    return { id: manifest.id, effect: manifest.effect, inputs: structuredClone(manifest.inputs), projection: [...manifest.projection], manifestDigest: manifestHash(manifest) };
  }
  list() {
    return [...this.tools.keys()].map(id => this.describe(id));
  }
  export(ids: string[]): unknown {
    return exportBundle(ids.map(id => { const entry = this.tools.get(id); if (!entry) throw new Error('REVIEW_REQUIRED'); return this.reviews.require(entry.manifest); }));
  }
  async verify(id: string, inputs: unknown, expected: unknown): Promise<unknown> {
    const tool = this.tools.get(id); if (!tool) throw new Error('REVIEW_REQUIRED');
    const result = await this.run(id, inputs);
    return { ...verifyFacts(result, expected), manifestDigest: manifestHash(tool.manifest), testedAt: new Date().toISOString() };
  }
  async run(id: string, inputs: unknown, expectedDigest?: string): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error('REVIEW_REQUIRED');
    this.reviews.require(tool.manifest);
    if (expectedDigest && manifestHash(tool.manifest) !== expectedDigest) throw new Error('CONTRACT_CHANGED');
    const { materialize } = await import('../workflow/candidate.js');
    const request = materialize(tool.manifest, inputs);
    return executeRead(tool.manifest, inputs, tool.grant, await this.credentials?.(request.url));
  }
}
