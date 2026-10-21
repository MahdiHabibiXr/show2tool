import { z } from 'zod';
import { manifestSchema } from './manifest.js';
export const bundleSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('show2tool-read-bundle'),
  tools: z.array(manifestSchema.refine(manifest => manifest.effect === 'read' && manifest.method === 'GET')).min(1).max(20),
}).strict().refine(bundle => new Set(bundle.tools.map(tool => tool.id)).size === bundle.tools.length)
  .refine(bundle => Buffer.byteLength(JSON.stringify(bundle)) <= 30000 && bundle.tools.every(tool => Buffer.byteLength(JSON.stringify(tool)) <= 28000), { message: 'Bundle exceeds portable response budget.' });
