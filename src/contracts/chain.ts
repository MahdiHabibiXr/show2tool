import { z } from 'zod';
import { inputName, manifestSchema } from './manifest.js';

export type ChainJson = null | boolean | number | string | ChainJson[] | { [key: string]: ChainJson };
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

// Check before recursive serialization: no cycles, accessors, prototypes with
// behavior, non-JSON values or unbounded nesting (including runner output).
function isJson(value: unknown, depth = 0, ancestors = new Set<object>()): value is ChainJson {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth >= 32 || ancestors.has(value)) return false;
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  const valid = (!array || keys.length === value.length + 1) && keys.every(key => {
    if (array && key === 'length') return true;
    if (typeof key !== 'string' || (array && !/^(0|[1-9][0-9]*)$/.test(key))) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return descriptor.enumerable && 'value' in descriptor && isJson(descriptor.value, depth + 1, ancestors);
  });
  ancestors.delete(value);
  return valid;
}

export const chainJsonSchema = z.custom<ChainJson>(isJson);
export const chainScalarSchema = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);
export type ChainScalar = z.infer<typeof chainScalarSchema>;
export const chainPointerSchema = z.string().max(256).refine(pointer =>
  (pointer === '' || pointer.startsWith('/')) && !/~(?:[^01]|$)/.test(pointer) &&
  pointer.split('/').slice(1).every(part => !forbidden.has(part.replace(/~1/g, '/').replace(/~0/g, '~'))),
);
export const chainBindingSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('input'), pointer: chainPointerSchema }).strict(),
  z.object({ source: z.literal('literal'), value: chainScalarSchema }).strict(),
  z.object({ source: z.literal('step'), step: z.number().int().min(0).max(4), pointer: chainPointerSchema }).strict(),
]);
export const chainStepSchema = z.object({
  id: manifestSchema.shape.id,
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  inputs: z.record(inputName, chainBindingSchema).refine(inputs => Object.keys(inputs).length <= 20),
}).strict();
export const chainStepsSchema = z.array(chainStepSchema).min(1).max(5).superRefine((steps, context) => {
  steps.forEach((step, index) => {
    for (const [name, binding] of Object.entries(step.inputs)) {
      if (binding.source === 'step' && binding.step >= index) context.addIssue({
        code: 'custom', message: 'Step references must point to an earlier projected result.', path: [index, 'inputs', name, 'step'],
      });
    }
  });
});
export const chainInputsSchema = chainJsonSchema.refine(value => value !== null && typeof value === 'object' && !Array.isArray(value));
export const chainSchema = z.object({ inputs: chainInputsSchema, steps: chainStepsSchema }).strict();
export type ChainBinding = z.infer<typeof chainBindingSchema>;
export type ChainStep = z.infer<typeof chainStepSchema>;
export type Chain = z.infer<typeof chainSchema>;
