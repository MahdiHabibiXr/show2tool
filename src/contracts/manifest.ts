import { z } from 'zod';
export const inputName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).refine(name => !['constructor', 'prototype', '__proto__'].includes(name));
const binding = z.discriminatedUnion('source', [z.object({ source: z.literal('input'), name: inputName }).strict(), z.object({ source: z.literal('literal'), value: z.string().max(200) }).strict()]);
export const specificationSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  origin: z.string().url().refine(value => { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && url.origin === value && !url.username && !url.password; }),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']),
  path: z.string().regex(/^\/[a-zA-Z0-9_\-/]*$/).max(1024).refine(value => !value.startsWith('//') && !value.includes('..')),
  effect: z.enum(['read', 'create', 'update']),
  inputs: z.record(inputName, z.object({ type: z.literal('string'), maxLength: z.number().int().min(1).max(200) }).strict()).refine(value => Object.keys(value).length <= 20),
  projection: z.array(z.string().regex(/^(\/[a-zA-Z0-9_~\-]+)*$/).max(256)).min(1).max(20),
}).strict();
const paginationSchema = z.object({ cursorQuery: inputName, itemsPointer: z.string().regex(/^(\/[a-zA-Z0-9_~\-]+)+$/).max(256), nextPointer: z.string().regex(/^(\/[a-zA-Z0-9_~\-]+)+$/).max(256), maxPages: z.number().int().min(1).max(5) }).strict();
export const manifestSchema = specificationSchema.extend({ schemaVersion: z.literal(1), query: z.record(inputName, binding), body: z.record(inputName, binding), provenance: z.array(z.string().max(100)).min(2).max(10), pagination: paginationSchema.optional() }).strict();
export type Manifest = z.infer<typeof manifestSchema>;
