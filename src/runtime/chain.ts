import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { chainJsonSchema, chainScalarSchema, chainSchema, type ChainJson, type ChainScalar } from '../contracts/chain.js';

export type { ChainScalar } from '../contracts/chain.js';
/** Trusted adapter: require a currently reviewed, pinned GET/read tool, then
 * return ONLY its projected result. This core cannot establish review authority. */
export type ChainRunner = (id: string, input: Record<string, ChainScalar>, manifestDigest: string) => Promise<unknown>;
export interface ChainEvidenceStep { id: string; manifestDigest: string; inputDigest: string; resultDigest: string }
export interface ChainResult { result: ChainJson; evidence: { steps: ChainEvidenceStep[]; chainDigest: string } }
const MAX_BYTES = 32768;
const DEADLINE_MS = 30000;

function canonical(value: ChainJson): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value as ChainJson)).digest('hex');
}
function snapshot(value: unknown): ChainJson {
  if (!chainJsonSchema.safeParse(value).success) throw new Error('INVALID_INPUT');
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('BUDGET_EXCEEDED');
  return JSON.parse(text) as ChainJson;
}
function scalarAt(value: ChainJson, pointer: string): ChainScalar {
  let selected: ChainJson = value;
  for (const part of pointer.split('/').slice(1)) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (selected === null || typeof selected !== 'object' ||
        (Array.isArray(selected) && !/^(0|[1-9][0-9]*)$/.test(key)) ||
        !Object.hasOwn(selected, key)) throw new Error('INVALID_INPUT');
    selected = (selected as Record<string, ChainJson>)[key];
  }
  const checked = chainScalarSchema.safeParse(selected);
  if (!checked.success) throw new Error('INVALID_INPUT');
  return checked.data;
}

/** No I/O except the supplied read capability. No retries, dynamic dispatch,
 * expressions, mutation operations, or exposure of intermediate result bodies.
 * A deadline rejects/halts this chain; the three-argument runner has no abort
 * channel, so an already-started read may still complete in its own adapter. */
export async function runChain(inputs: unknown, steps: unknown, runner: ChainRunner): Promise<ChainResult> {
  const deadline = performance.now() + DEADLINE_MS;
  const checkDeadline = () => { if (performance.now() >= deadline) throw new Error('BUDGET_EXCEEDED'); };
  const checked = chainSchema.safeParse({ inputs, steps });
  if (!checked.success || typeof runner !== 'function') throw new Error('INVALID_INPUT');
  const root = snapshot(checked.data.inputs);
  const plan = JSON.parse(JSON.stringify(checked.data.steps)) as typeof checked.data.steps;
  // Resolve every root binding before invoking the first external capability.
  for (const step of plan) for (const binding of Object.values(step.inputs)) {
    if (binding.source === 'input') scalarAt(root, binding.pointer);
  }
  const results: ChainJson[] = [];
  const evidence: ChainEvidenceStep[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('BUDGET_EXCEEDED')), Math.max(0, deadline - performance.now()));
  });
  try {
    for (const step of plan) {
      checkDeadline();
      const resolved: Record<string, ChainScalar> = Object.create(null);
      for (const [name, binding] of Object.entries(step.inputs)) {
        resolved[name] = binding.source === 'literal' ? binding.value :
          binding.source === 'input' ? scalarAt(root, binding.pointer) : scalarAt(results[binding.step], binding.pointer);
      }
      const inputDigest = hash(resolved);
      // Snapshot each result before exposing the next callback to caller state.
      const projected = snapshot(await Promise.race([Promise.resolve().then(() => runner(step.id, resolved, step.manifestDigest)), timeout]));
      checkDeadline();
      results.push(projected);
      evidence.push({ id: step.id, manifestDigest: step.manifestDigest, inputDigest, resultDigest: hash(projected) });
    }
    const output: ChainResult = {
      result: results[results.length - 1],
      evidence: { steps: evidence, chainDigest: hash({ inputs: root, steps: plan, evidence }) },
    };
    if (Buffer.byteLength(JSON.stringify(output)) > MAX_BYTES) throw new Error('BUDGET_EXCEEDED');
    checkDeadline();
    return output;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
