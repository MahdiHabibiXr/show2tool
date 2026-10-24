import { z } from 'zod';
import { bundleSchema } from '../workflow/bundle.js';
import { chainStepsSchema } from './chain.js';
import { expectationsSchema } from '../runtime/verify.js';
import { specificationSchema } from './manifest.js';
const fields = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/), z.string().max(200)).refine(value => Object.keys(value).length <= 20);
export const commandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('commands') }).strict(),
  z.object({ command: z.literal('doctor') }).strict(),
  z.object({ command: z.literal('tools') }).strict(),
  z.object({ command: z.literal('describe'), id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/) }).strict(),
  z.object({ command: z.literal('prepare_write'), id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), inputs: fields }).strict(),
  z.object({ command: z.literal('execute_write'), intentId: z.string().uuid() }).strict(),
  z.object({ command: z.literal('reconcile_write'), intentId: z.string().uuid(), resultId: z.string().min(1).max(200), recovery: z.object({ id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), inputs: fields, version: z.string().max(200).optional() }).strict().optional() }).strict(),
  z.object({ command: z.literal('write_status'), intentId: z.string().uuid() }).strict(),
  z.object({ command: z.literal('record_start'), inputs: fields }).strict(),
  z.object({ command: z.literal('record_stop') }).strict(),
  z.object({ command: z.literal('compile_recordings'), ids: z.array(z.string().uuid()).min(2).max(10), requestIds: z.array(z.string().max(100)).min(2).max(10), specification: specificationSchema }).strict(),
  z.object({ command: z.literal('recording'), id: z.string().uuid() }).strict(),
  z.object({ command: z.literal('run'), id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), inputs: fields, manifestDigest: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
  z.object({ command: z.literal('schema') }).strict(),
  z.object({ command: z.literal('run_chain'), inputs: fields, steps: chainStepsSchema }).strict(),
  z.object({ command: z.literal('export_bundle'), ids: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).min(1).max(20) }).strict(),
  z.object({ command: z.literal('import_bundle'), bundle: bundleSchema }).strict(),
  z.object({ command: z.literal('verify'), id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), inputs: fields, expected: expectationsSchema }).strict(),
  z.object({ command: z.literal('candidate'), specification: specificationSchema, demonstrations: z.array(z.unknown()).min(2).max(10) }).strict(),
  z.object({ command: z.literal('inspect'), recording: z.array(z.unknown()).max(100) }).strict(),
  z.object({ command: z.literal('infer'), demonstrations: z.array(z.object({ inputs: fields, approvedSlots: fields }).strict()).min(2).max(10) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const discovery = [
  { name: 'doctor', description: 'Check runtime and standard Chrome availability without opening a browser or exposing local paths.', effects: 'none' },
  { name: 'run_chain', description: 'Compose up to five digest-pinned reviewed reads using only projected prior values. Never writes.', effects: 'reviewed-read' },
  { name: 'describe', description: 'Describe one reviewed tool input/output contract and manifest digest.', effects: 'none' },
  { name: 'reconcile_write', description: 'Check a known result ID using reviewed reads only; never resends a mutation.', effects: 'reviewed-read' },
  { name: 'export_bundle', description: 'Export reviewed definitions without credentials or inherited approvals; inspect literals before sharing.', effects: 'none' },
  { name: 'import_bundle', description: 'Validate imported definitions without granting authority; human review required at destination.', effects: 'none' },
  { name: 'verify', description: 'Run a reviewed read and compare independent scalar expectations; does not prove input was unseen.', effects: 'reviewed-read' },
  { name: 'prepare_write', description: 'Prepare one reviewed create/update and return an opaque pending intent; never approves or dispatches.', effects: 'preflight-read' },
  { name: 'execute_write', description: 'Execute an exact one-use human-approved intent once; uncertain outcomes are never retried.', effects: 'confirmed-write' },
  { name: 'write_status', description: 'Read durable status of a mutation intent without network calls.', effects: 'none' },
  { name: 'compile_recordings', description: 'Compile selected broker-owned recording request IDs into an executable candidate.', effects: 'none' },
  { name: 'record_start', description: 'Begin passive recording in a human-scoped dedicated Chrome session.', effects: 'capture' },
  { name: 'record_stop', description: 'Stop recording and return an opaque evidence identifier.', effects: 'capture' },
  { name: 'recording', description: 'Read explicitly approved compact recording fields by identifier.', effects: 'none' },
  { name: 'tools', description: 'List reviewed executable workflows; requires broker.', effects: 'none' },
  { name: 'run', description: 'Run a reviewed read workflow with typed inputs; requires broker.', effects: 'reviewed-read' },
  { name: 'candidate', description: 'Compile captured scalar examples into a reviewed-candidate manifest; does not execute it.', effects: 'none' },
  { name: 'commands', description: 'List supported commands without browser or network access.', effects: 'none' },
  { name: 'schema', description: 'Return the versioned input schema.', effects: 'none' },
  { name: 'inspect', description: 'Summarize scoped recording metadata without returning approved field values.', effects: 'none' },
  { name: 'infer', description: 'Find unambiguous varying scalar bindings in annotated demonstrations.', effects: 'none' },
];
