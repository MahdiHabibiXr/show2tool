import { z } from 'zod';
export const inputName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).refine(name => !['constructor', 'prototype', '__proto__'].includes(name));
const binding = z.discriminatedUnion('source', [z.object({ source: z.literal('input'), name: inputName }).strict(), z.object({ source: z.literal('literal'), value: z.string().max(200) }).strict()]);
const pointer = z.string().regex(/^(\/[a-zA-Z0-9_~\-]+)+$/).max(256);
const path = z.string().regex(/^\/[a-zA-Z0-9_\-/]*$/).max(1024).refine(value => !value.startsWith('//') && !value.includes('..'));
export const mutationSchema = z.object({
  csrf: z.object({ path, value: pointer, header: z.string().regex(/^x-[a-z0-9-]{1,50}$/).refine(value => !['x-forwarded-host','x-forwarded-for'].includes(value)) }).strict().optional(),
  identity: z.object({ path, account: pointer, tenant: pointer }).strict(),
  readback: z.object({ path, idQuery: inputName, resultId: pointer, recordId: pointer, version: pointer.optional(), account: pointer, tenant: pointer, fields: z.record(inputName, pointer).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 20) }).strict(),
  precondition: z.object({ path, idQuery: inputName, idInput: inputName, version: pointer }).strict().optional(),
}).strict();
export const specificationSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  origin: z.string().url().refine(value => { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && url.origin === value && !url.username && !url.password; }),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']),
  path: z.string().regex(/^\/[a-zA-Z0-9_\-/]*$/).max(1024).refine(value => !value.startsWith('//') && !value.includes('..')),
  effect: z.enum(['read', 'create', 'update']),
  inputs: z.record(inputName, z.object({ type: z.literal('string'), maxLength: z.number().int().min(1).max(200) }).strict()).refine(value => Object.keys(value).length <= 20),
  mutation: mutationSchema.optional(),
  pagination: z.object({ parameter: inputName, items: pointer, next: pointer, maxPages: z.number().int().min(1).max(5) }).strict().optional(),
  projection: z.array(z.string().regex(/^(\/[a-zA-Z0-9_~\-]+)*$/).max(256)).min(1).max(20),
}).strict();
export const manifestSchema = specificationSchema.extend({ schemaVersion: z.literal(1), query: z.record(inputName, binding), body: z.record(inputName, binding), provenance: z.array(z.string().max(100)).min(2).max(10) }).strict();
export type Manifest = z.infer<typeof manifestSchema>;
