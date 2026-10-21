import { z } from 'zod';
import { specificationSchema } from './manifest.js';
import { expectationsSchema } from '../runtime/verify.js';
const fields = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), z.string().max(200)).refine(value => Object.keys(value).length <= 20);
export const commandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('commands') }).strict(),
  z.object({ command: z.literal('doctor') }).strict(),
  z.object({ command: z.literal('tools') }).strict(),
  z.object({ command: z.literal('record_start'), inputs: fields }).strict(),
  z.object({ command: z.literal('record_stop') }).strict(),
  z.object({ command: z.literal('compile_recordings'), ids: z.array(z.string().uuid()).min(2).max(10), requestIds: z.array(z.string().max(100)).min(2).max(10), specification: specificationSchema }).strict(),
  z.object({ command: z.literal('recording'), id: z.string().uuid() }).strict(),
  z.object({ command: z.literal('run'), id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), inputs: fields }).strict(),
  z.object({ command: z.literal('verify'), id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), inputs: fields, expected: expectationsSchema }).strict(),
  z.object({ command: z.literal('schema') }).strict(),
  z.object({ command: z.literal('candidate'), specification: specificationSchema, demonstrations: z.array(z.unknown()).min(2).max(10) }).strict(),
  z.object({ command: z.literal('inspect'), recording: z.array(z.unknown()).max(100) }).strict(),
  z.object({ command: z.literal('infer'), demonstrations: z.array(z.object({ inputs: fields, approvedSlots: fields }).strict()).min(2).max(10) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const discovery = [
  { name: 'doctor', description: 'Check Node and standard Chrome installation paths without opening a browser or returning local paths.', effects: 'none' },
  { name: 'compile_recordings', description: 'Compile selected broker-owned recording request IDs into an executable candidate.', effects: 'none' },
  { name: 'record_start', description: 'Begin passive recording in a human-scoped dedicated Chrome session.', effects: 'capture' },
  { name: 'record_stop', description: 'Stop recording and return an opaque evidence identifier.', effects: 'capture' },
  { name: 'recording', description: 'Read explicitly approved compact recording fields by identifier.', effects: 'none' },
  { name: 'tools', description: 'List reviewed executable workflows; requires broker.', effects: 'none' },
  { name: 'run', description: 'Run a reviewed read workflow with typed inputs; requires broker.', effects: 'reviewed-read' },
  { name: 'verify', description: 'Check a reviewed read against independent scalar expectations and save digest-bound evidence; does not prove an input was unseen.', effects: 'reviewed-read-and-local-evidence' },
  { name: 'candidate', description: 'Compile captured scalar examples into a reviewed-candidate manifest; does not execute it.', effects: 'none' },
  { name: 'commands', description: 'List supported commands without browser or network access.', effects: 'none' },
  { name: 'schema', description: 'Return the versioned input schema.', effects: 'none' },
  { name: 'inspect', description: 'Summarize scoped recording metadata without returning approved field values.', effects: 'none' },
  { name: 'infer', description: 'Find unambiguous varying scalar bindings in annotated demonstrations.', effects: 'none' },
];
