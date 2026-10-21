import { ReviewStore } from '../approval/review.js';
import { executeRead } from '../runtime/execute.js';
import type { DestinationGrant } from '../runtime/policy.js';
import type { Manifest } from '../contracts/manifest.js';
export class WorkflowRegistry {
  private readonly tools = new Map<string, { manifest: Manifest; grant: DestinationGrant }>();
  constructor(private readonly reviews: ReviewStore, private readonly credentials?: (url: string) => Promise<Record<string, string>>) {}
  register(value: unknown, grant: DestinationGrant): void {
    const manifest = this.reviews.require(value);
    if (manifest.origin !== grant.origin || (grant.paths && !grant.paths.includes(manifest.path))) throw new Error('REVIEW_REQUIRED');
    if ((grant.queryKeys && Object.keys(manifest.query).some(key => !grant.queryKeys!.includes(key))) || (grant.bodyKeys && Object.keys(manifest.body).some(key => !grant.bodyKeys!.includes(key)))) throw new Error('REVIEW_REQUIRED');
    this.tools.set(manifest.id, { manifest: structuredClone(manifest), grant: structuredClone(grant) });
  }
  list(): { id: string; effect: string; inputs: Manifest['inputs'] }[] {
    return [...this.tools.values()].map(({ manifest }) => ({ id: manifest.id, effect: manifest.effect, inputs: structuredClone(manifest.inputs) }));
  }
  async run(id: string, inputs: unknown): Promise<unknown> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error('REVIEW_REQUIRED');
    this.reviews.require(tool.manifest);
    const { materialize } = await import('../workflow/candidate.js');
    const request = materialize(tool.manifest, inputs);
    return executeRead(tool.manifest, inputs, tool.grant, await this.credentials?.(request.url));
  }
}
