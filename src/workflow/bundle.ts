import { z } from 'zod';
import { manifestSchema, type Manifest } from '../contracts/manifest.js';
import { manifestHash } from '../approval/review.js';
export const bundleSchema = z.object({ schemaVersion: z.literal(1), runtime: z.literal('show2tool/1'), tools: z.array(manifestSchema).min(1).max(20), digests: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(20) }).strict();
export function exportBundle(values: unknown[]): z.infer<typeof bundleSchema> {
  const tools = values.map(value => manifestSchema.parse(value));
  return bundleSchema.parse({ schemaVersion: 1, runtime: 'show2tool/1', tools, digests: tools.map(manifestHash) });
}
export function importBundle(value: unknown): Manifest[] {
  const bundle = bundleSchema.parse(value);
  if (bundle.tools.length !== bundle.digests.length || bundle.tools.some((tool, index) => manifestHash(tool) !== bundle.digests[index]) || new Set(bundle.tools.map(tool => tool.id)).size !== bundle.tools.length) throw new Error('BUNDLE_CHANGED');
  return structuredClone(bundle.tools);
}
