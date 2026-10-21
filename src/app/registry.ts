import { createHash } from 'node:crypto';
import { manifestHash, ReviewStore } from '../approval/review.js';
import { executeRead } from '../runtime/execute.js';
import type { DestinationGrant } from '../runtime/policy.js';
import type { Manifest } from '../contracts/manifest.js';
import { containsPath } from '../contracts/paths.js';
import { withinDeadline } from '../runtime/deadline.js';
export class WorkflowRegistry {
  private readonly tools = new Map<string, { manifest: Manifest; grant: DestinationGrant }>();
  constructor(private readonly reviews: ReviewStore, private readonly credentials?: (url: string) => Promise<Record<string, string>>) {}
  register(value: unknown, grant: DestinationGrant): void {
    const manifest = this.reviews.require(value);
    if (manifest.origin !== grant.origin || (grant.paths && !grant.paths.some(path => containsPath(path, manifest.path)))) throw new Error('REVIEW_REQUIRED');
    if ((grant.queryKeys && Object.keys(manifest.query).some(key => !grant.queryKeys!.includes(key))) || (grant.bodyKeys && Object.keys(manifest.body).some(key => !grant.bodyKeys!.includes(key)))) throw new Error('REVIEW_REQUIRED');
    if (manifest.pagination && grant.queryKeys && !grant.queryKeys.includes(manifest.pagination.cursorQuery)) throw new Error('REVIEW_REQUIRED');
    this.tools.set(manifest.id, { manifest: structuredClone(manifest), grant: structuredClone(grant) });
  }
  list(): { id: string; effect: string; inputs: Manifest['inputs']; manifestDigest: string; chainSupported: boolean }[] {
    return [...this.tools.values()].map(({ manifest }) => ({ id: manifest.id, effect: manifest.effect, inputs: structuredClone(manifest.inputs), manifestDigest: manifestHash(manifest), chainSupported: !manifest.pagination }));
  }
  exportDefinitions(ids: string[]): Manifest[] {
    return ids.map(id => {
      const tool = this.tools.get(id);
      if (!tool) throw new Error('REVIEW_REQUIRED');
      return structuredClone(this.reviews.require(tool.manifest));
    });
  }
  async runChain(inputs: Record<string, string>, steps: import('../contracts/chain.js').ChainSteps): Promise<unknown> {
    const snapshots = steps.map(step => {
      const tool = this.tools.get(step.id);
      if (!tool || manifestHash(this.reviews.require(tool.manifest)) !== step.manifestDigest) throw new Error('REVIEW_REQUIRED');
      return tool;
    });
    if (snapshots.some(tool => tool.manifest.pagination)) throw new Error('UNSUPPORTED_FEATURE');
    const results: Record<string, unknown>[] = [];
    const signal = AbortSignal.timeout(50000);
    for (const [index, step] of steps.entries()) {
      if (signal.aborted) throw new Error('BUDGET_EXCEEDED');
      const resolved: Record<string, string> = Object.create(null);
      for (const [name, binding] of Object.entries(step.inputs)) {
        let value: unknown;
        if (binding.source === 'literal') value = binding.value;
        else if (binding.source === 'input') value = Object.hasOwn(inputs, binding.name) ? inputs[binding.name] : undefined;
        else {
          if (binding.step >= index || !Object.hasOwn(results[binding.step], binding.projection)) throw new Error('INVALID_INPUT');
          value = results[binding.step][binding.projection];
          for (const part of binding.pointer.split('/').slice(1)) {
            const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
            if (['__proto__', 'constructor', 'prototype'].includes(key) || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error('INVALID_INPUT');
            value = (value as Record<string, unknown>)[key];
          }
        }
        if (typeof value !== 'string' || value.length > 200) throw new Error('INVALID_INPUT');
        resolved[name] = value;
      }
      results.push(await this.run(step.id, resolved, step.manifestDigest, signal) as Record<string, unknown>);
    }
    return results[results.length - 1];
  }
  async verifyChain(inputs: Record<string, string>, steps: import('../contracts/chain.js').ChainSteps, expected: import('../runtime/verify.js').Expectations, stateDir: string): Promise<unknown> {
    const last = steps[steps.length - 1];
    const tool = this.tools.get(last.id);
    if (!tool || manifestHash(this.reviews.require(tool.manifest)) !== last.manifestDigest) throw new Error('REVIEW_REQUIRED');
    const manifest = structuredClone(tool.manifest);
    const digest = createHash('sha256').update(JSON.stringify(steps)).digest('hex');
    const { verifyRead } = await import('../runtime/verify.js');
    return verifyRead(manifest, inputs, expected, () => this.runChain(inputs, steps), stateDir, digest);
  }
  async verify(id: string, inputs: unknown, expected: import('../runtime/verify.js').Expectations, stateDir: string): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error('REVIEW_REQUIRED');
    const manifest = structuredClone(this.reviews.require(tool.manifest));
    const { verifyRead } = await import('../runtime/verify.js');
    return verifyRead(manifest, inputs, expected, () => this.run(id, inputs), stateDir);
  }
  async run(id: string, inputs: unknown, expectedDigest?: string, signal: AbortSignal = AbortSignal.timeout(60000)): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error('REVIEW_REQUIRED');
    this.reviews.require(tool.manifest);
    if (expectedDigest !== undefined && manifestHash(tool.manifest) !== expectedDigest) throw new Error('REVIEW_REQUIRED');
    const { materialize } = await import('../workflow/candidate.js');
    const request = materialize(tool.manifest, inputs);
    const headers = await withinDeadline(Promise.resolve(this.credentials?.(request.url)), signal);
    if (signal.aborted) throw new Error('BUDGET_EXCEEDED');
    return executeRead(tool.manifest, inputs, tool.grant, headers, signal);
  }
}
