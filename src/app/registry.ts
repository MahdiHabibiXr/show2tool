import { manifestHash, ReviewStore } from '../approval/review.js';
import { executeRead } from '../runtime/execute.js';
import type { DestinationGrant } from '../runtime/policy.js';
import type { Manifest } from '../contracts/manifest.js';
import { containsPath } from '../contracts/paths.js';
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
  list(): { id: string; effect: string; inputs: Manifest['inputs']; manifestDigest: string }[] {
    return [...this.tools.values()].map(({ manifest }) => ({ id: manifest.id, effect: manifest.effect, inputs: structuredClone(manifest.inputs), manifestDigest: manifestHash(manifest) }));
  }
  async verify(id: string, inputs: unknown, expected: import('../runtime/verify.js').Expectations, stateDir: string): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error('REVIEW_REQUIRED');
    const manifest = structuredClone(this.reviews.require(tool.manifest));
    const { verifyRead } = await import('../runtime/verify.js');
    return verifyRead(manifest, inputs, expected, () => this.run(id, inputs), stateDir);
  }
  async run(id: string, inputs: unknown, expectedDigest?: string): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error('REVIEW_REQUIRED');
    this.reviews.require(tool.manifest);
    if (expectedDigest !== undefined && manifestHash(tool.manifest) !== expectedDigest) throw new Error('REVIEW_REQUIRED');
    const { materialize } = await import('../workflow/candidate.js');
    const request = materialize(tool.manifest, inputs);
    return executeRead(tool.manifest, inputs, tool.grant, await this.credentials?.(request.url));
  }
}
