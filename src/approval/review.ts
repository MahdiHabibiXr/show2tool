import { createHash } from 'node:crypto';
import { z } from 'zod';
import { manifestSchema, type Manifest } from '../contracts/manifest.js';
const candidateArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  ok: z.literal(true),
  data: manifestSchema,
  meta: z.object({ complete: z.literal(true) }).strict(),
}).strict();
export function parseReviewArtifact(text: string): Manifest {
  if (Buffer.byteLength(text) > 32768) throw new Error('BUDGET_EXCEEDED');
  const value: unknown = JSON.parse(text.replace(/^﻿/, ''));
  const manifest = manifestSchema.safeParse(value);
  return manifest.success ? manifest.data : candidateArtifactSchema.parse(value).data;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
}
export function manifestHash(value: unknown): string { return createHash('sha256').update(canonical(manifestSchema.parse(value))).digest('hex'); }
// Internal capability store. Never expose review() as an agent command or trust an IPC interactive flag.
export class ReviewStore {
  private readonly grants = new Set<string>();
  async review(value: unknown, terminal: { interactive: boolean; ask(prompt: string): Promise<string> }): Promise<boolean> {
    const manifest = manifestSchema.parse(value);
    if (!terminal.interactive || manifest.effect !== 'read' || manifest.method !== 'GET') return false;
    const hash = manifestHash(manifest);
    const answer = await terminal.ask(`Review read workflow ${JSON.stringify(manifest)}\nDigest ${hash}\nType review ${manifest.id}: `);
    if (answer !== `review ${manifest.id}`) return false;
    this.grants.add(hash); return true;
  }
  require(value: unknown): Manifest {
    const manifest = manifestSchema.parse(value);
    if (!this.grants.has(manifestHash(manifest))) throw new Error('REVIEW_REQUIRED');
    return manifest;
  }
}
