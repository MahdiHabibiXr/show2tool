import { z } from 'zod';
import { inputName } from './manifest.js';
const sourceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('input'), name: inputName }).strict(),
  z.object({ source: z.literal('literal'), value: z.string().max(200) }).strict(),
  z.object({ source: z.literal('step'), step: z.number().int().min(0).max(4), projection: z.string().max(256), pointer: z.string().max(256).regex(/^(\/(?:[^~/]|~[01])*)*$/) }).strict(),
]);
export const chainStepsSchema = z.array(z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  inputs: z.record(inputName, sourceSchema).refine(value => Object.keys(value).length <= 20),
}).strict()).min(1).max(5).refine(steps => steps.every((step, index) => Object.values(step.inputs).every(binding => binding.source !== 'step' || binding.step < index)));
export type ChainSteps = z.infer<typeof chainStepsSchema>;
