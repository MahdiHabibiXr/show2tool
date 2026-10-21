import { createHash } from 'node:crypto';
import { z } from 'zod';
import { inputName } from './manifest.js';
import { pathInputs, pathSchema, resolvePath } from './paths.js';
const pointer = z.string().max(256).regex(/^(\/[a-zA-Z0-9_~\-]+)+$/).refine(value => !value.split('/').some(key => ['__proto__', 'constructor', 'prototype'].includes(key.replace(/~1/g, '/').replace(/~0/g, '~'))));
const valueBinding = z.discriminatedUnion('source', [z.object({ source: z.literal('input'), name: inputName }).strict(), z.object({ source: z.literal('literal'), value: z.string().max(200) }).strict()]);
const expectation = z.union([valueBinding, z.object({ source: z.literal('principal') }).strict()]);
export const mutationSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  origin: z.string().url().refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.origin === value && !url.username && !url.password; }),
  effect: z.enum(['create', 'update']), method: z.enum(['POST', 'PATCH', 'PUT']), path: pathSchema,
  inputs: z.record(inputName, z.object({ type: z.literal('string'), maxLength: z.number().int().min(1).max(200) }).strict()).refine(value => Object.keys(value).length <= 20),
  body: z.record(inputName, valueBinding).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 20),
  principal: z.object({ path: pathSchema, pointer }).strict(),
  csrf: z.object({ path: pathSchema, pointer, header: z.enum(['x-csrf-token', 'x-xsrf-token']) }).strict().optional(),
  precondition: z.object({ path: pathSchema, pointer, header: z.literal('if-match') }).strict().optional(),
  readBack: z.object({ path: pathSchema, idSource: pointer.optional(), expected: z.record(pointer, expectation).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 20) }).strict(),
}).strict().refine(contract => {
  if (contract.effect === 'create' && (contract.method !== 'POST' || !contract.readBack.idSource || !pathInputs(contract.readBack.path).includes('createdId'))) return false;
  if (contract.effect === 'update' && (!['PATCH', 'PUT'].includes(contract.method) || !contract.precondition || contract.readBack.idSource || contract.precondition.path !== contract.path || contract.readBack.path !== contract.path)) return false;
  const paths = [contract.path, contract.principal.path, ...(contract.csrf ? [contract.csrf.path] : []), ...(contract.precondition ? [contract.precondition.path] : [])];
  if (paths.flatMap(pathInputs).some(name => !Object.hasOwn(contract.inputs, name))) return false;
  if (pathInputs(contract.readBack.path).some(name => name !== 'createdId' && !Object.hasOwn(contract.inputs, name))) return false;
  return [...Object.values(contract.body), ...Object.values(contract.readBack.expected)].every(binding => binding.source !== 'input' || Object.hasOwn(contract.inputs, binding.name));
});
export type MutationContract = z.infer<typeof mutationSchema>;
export function prepareMutation(value: unknown, inputs: unknown, evidence: { principal: string; precondition?: string }) {
  const contract = mutationSchema.parse(value);
  const checked = z.object(Object.fromEntries(Object.entries(contract.inputs).map(([name, rule]) => [name, z.string().max(rule.maxLength)]))).strict().parse(inputs);
  const principal = z.string().min(1).max(200).parse(evidence.principal);
  const precondition = contract.precondition ? z.string().min(1).max(200).regex(/^[\x20-\x7e]+$/).refine(value => value.trim() !== '*' && !value.includes(',') && !value.startsWith('W/')).parse(evidence.precondition) : undefined;
  for (const path of [contract.path, contract.principal.path, ...(contract.csrf ? [contract.csrf.path] : []), ...(contract.precondition ? [contract.precondition.path] : [])]) resolvePath(path, checked);
  const readBackInputs = contract.effect === 'create' ? { ...checked, createdId: 'pending' } : checked;
  resolvePath(contract.readBack.path, readBackInputs);
  const body = Object.fromEntries(Object.entries(contract.body).map(([key, binding]) => [key, binding.source === 'literal' ? binding.value : checked[binding.name]]));
  return { manifestDigest: createHash('sha256').update(JSON.stringify(contract)).digest('hex'), principal, method: contract.method, url: new URL(resolvePath(contract.path, checked), contract.origin).href, body, ...(precondition ? { precondition } : {}) };
}
