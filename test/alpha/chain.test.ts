import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { chainSchema, chainStepsSchema } from '../../src/contracts/chain.js';
import { runChain, type ChainRunner } from '../../src/runtime/chain.js';

const pin = 'a'.repeat(64);
const otherPin = 'b'.repeat(64);
const step = (id = 'catalog') => ({ id, manifestDigest: pin, inputs: {} });
const literal = (value: string | number | boolean | null) => ({ source: 'literal' as const, value });
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
afterEach(() => vi.useRealTimers());

it('runs sequential fixed reads with root, literal and prior projected-result scalar bindings', async () => {
  const calls: unknown[] = [];
  const steps = [
    { ...step(), inputs: { term: { source: 'input', pointer: '/query/text' }, limit: literal(3), active: literal(true), cursor: literal(null) } },
    { ...step('details'), manifestDigest: otherPin, inputs: { id: { source: 'step', step: 0, pointer: '/~1items/0/id' }, empty: literal('') } },
  ];
  const runner: ChainRunner = async (id, input, manifestDigest) => {
    calls.push({ id, input, manifestDigest });
    if (id === 'details') {
      expect(calls).toHaveLength(2);
      return { '/title': 'Selected' };
    }
    await Promise.resolve();
    return { '/items': [{ id: 'book-1', hidden: { id: 'unused' } }] };
  };
  const output = await runChain({ query: { text: 'book' } }, steps, runner);
  expect(calls).toEqual([
    { id: 'catalog', input: { term: 'book', limit: 3, active: true, cursor: null }, manifestDigest: pin },
    { id: 'details', input: { id: 'book-1', empty: '' }, manifestDigest: otherPin },
  ]);
  expect(output.result).toEqual({ '/title': 'Selected' });
  expect(output.evidence.steps).toEqual([
    { id: 'catalog', manifestDigest: pin, inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/), resultDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
    { id: 'details', manifestDigest: otherPin, inputDigest: digest('{"empty":"","id":"book-1"}'), resultDigest: digest('{"/title":"Selected"}') },
  ]);
  expect(output.evidence.chainDigest).toMatch(/^[a-f0-9]{64}$/);
});

it('accepts one through five reads and returns only the final projected result', async () => {
  let running = 0;
  let count = 0;
  const output = await runChain({}, Array.from({ length: 5 }, () => step()), async () => {
    expect(running++).toBe(0);
    await Promise.resolve();
    running--;
    return { '/count': ++count };
  });
  expect(output.result).toEqual({ '/count': 5 });
  expect(output.evidence.steps).toHaveLength(5);
  expect(output).not.toHaveProperty('results');
});

it.each([[], Array.from({ length: 6 }, () => step())])('rejects invalid step counts before calling the runner', async steps => {
  let calls = 0;
  await expect(runChain({}, steps, async () => { calls++; return {}; })).rejects.toThrow('INVALID_INPUT');
  expect(calls).toBe(0);
});

it.each([
  [{ ...step(), id: 'https://example.com/read' }],
  [{ ...step(), id: { source: 'input', pointer: '/id' } }],
  [{ ...step(), manifestDigest: 'unpinned' }],
  [{ ...step(), manifestDigest: 'A'.repeat(64) }],
  [{ ...step(), url: 'https://example.com' }],
  [{ ...step(), effect: 'update' }],
  [{ ...step(), script: 'return fetch(url)' }],
  [{ ...step(), inputs: { x: { source: 'literal', value: 'x', pointer: '/unexpected' } } }],
  [{ ...step(), inputs: { x: { source: 'javascript', value: '1+1' } } }],
  [{ ...step(), inputs: { x: { source: 'literal', value: {} } } }],
  [{ ...step(), inputs: { x: { source: 'literal', value: Infinity } } }],
  [{ ...step(), inputs: { x: literal('x'.repeat(201)) } }],
  [{ ...step(), inputs: { constructor: literal('x') } }],
  [{ ...step(), inputs: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`x${i}`, literal('x')])) }],
])('rejects dynamic destinations, missing pins, executable or unknown fields and invalid bindings %#', async steps => {
  expect(chainStepsSchema.safeParse(steps).success).toBe(false);
  await expect(runChain({}, steps, async () => { throw new Error('RUNNER_MUST_NOT_RUN'); })).rejects.toThrow('INVALID_INPUT');
});

it.each([
  { source: 'step', step: 0, pointer: '/id' },
  { source: 'step', step: 1, pointer: '/id' },
  { source: 'step', step: -1, pointer: '/id' },
  { source: 'step', step: 0.5, pointer: '/id' },
])('rejects self/forward/negative/fractional references before any execution %#', async binding => {
  const steps = [{ ...step(), inputs: { x: binding } }, step('details')];
  expect(chainSchema.safeParse({ inputs: {}, steps }).success).toBe(false);
  await expect(runChain({}, steps, async () => { throw new Error('RUNNER_MUST_NOT_RUN'); })).rejects.toThrow('INVALID_INPUT');
});

it.each(['/__proto__/x', '/constructor', '/x/prototype/y', '/~1items/0/__proto__', '/bad~2escape', 'not/a/pointer'])('rejects unsafe or malformed JSON pointers %s', pointer => {
  expect(chainStepsSchema.safeParse([{ ...step(), inputs: { x: { source: 'input', pointer } } }]).success).toBe(false);
  expect(chainStepsSchema.safeParse([step(), { ...step(), inputs: { x: { source: 'step', step: 0, pointer } } }]).success).toBe(false);
});

it('supports RFC6901 escapes, empty keys, and root scalar result pointers', async () => {
  const steps = [
    { ...step(), inputs: { x: { source: 'input', pointer: '/a~1b/~0key/' } } },
    { ...step('details'), inputs: { x: { source: 'step', step: 0, pointer: '' } } },
  ];
  const values: unknown[] = [];
  await runChain({ 'a/b': { '~key': { '': 'escaped' } } }, steps, async (_id, inputs) => { values.push(inputs.x); return 'scalar'; });
  expect(values).toEqual(['escaped', 'scalar']);
});

it.each(['/missing', '/object', '/array', '/inherited'])('rejects missing, inherited or non-scalar root selections %s', async pointer => {
  const inputs = { object: {}, array: [] };
  await expect(runChain(inputs, [{ ...step(), inputs: { x: { source: 'input', pointer } } }], async () => ({}))).rejects.toThrow('INVALID_INPUT');
});

it.each(['/raw/id', '/~1items', '/~1items/0/id', '/toString'])('cannot reference unprojected, non-scalar, missing or inherited prior data %s', async pointer => {
  let calls = 0;
  await expect(runChain({}, [step(), { ...step('details'), inputs: { x: { source: 'step', step: 0, pointer } } }], async () => {
    calls++;
    return { '/items': [{ id: { nested: 'not a scalar' } }] };
  })).rejects.toThrow('INVALID_INPUT');
  expect(calls).toBe(1);
});

it('treats array pointers as JSON indices, never as JavaScript properties', async () => {
  for (const pointer of ['/items/length', '/items/01', '/items/-', '/items/-1']) {
    await expect(runChain({ items: ['value'] }, [{ ...step(), inputs: { x: { source: 'input', pointer } } }], async () => ({}))).rejects.toThrow('INVALID_INPUT');
  }
  await expect(runChain({}, [step(), { ...step('details'), inputs: { x: { source: 'step', step: 0, pointer: '/~1items/length' } } }], async () => ({ '/items': ['value'] }))).rejects.toThrow('INVALID_INPUT');
});

it('rejects array subclasses without executing inherited serializers', async () => {
  let serialized = false;
  class ExecutableArray extends Array<string> {
    toJSON() { serialized = true; return 'executed'; }
  }
  await expect(runChain({}, [step()], async () => new ExecutableArray('value'))).rejects.toThrow('INVALID_INPUT');
  expect(serialized).toBe(false);
});

it('rejects accessors without executing them and rejects sparse arrays', async () => {
  let accessed = false;
  const object = Object.defineProperty({}, 'secret', { enumerable: true, get() { accessed = true; return 'executed'; } });
  for (const result of [object, new Array(2), Object.assign(['x'], { extra: 'not JSON' })]) {
    await expect(runChain({}, [step()], async () => result)).rejects.toThrow('INVALID_INPUT');
  }
  expect(accessed).toBe(false);
});

it('uses a strict top-level schema with an object root and preserves caller-owned values', async () => {
  for (const inputs of [null, [], 'root', undefined, { x: undefined }, { x: Infinity }]) {
    expect(chainSchema.safeParse({ inputs, steps: [step()] }).success).toBe(false);
    await expect(runChain(inputs, [step()], async () => ({}))).rejects.toThrow('INVALID_INPUT');
  }
  expect(chainSchema.safeParse({ inputs: {}, steps: [step()], expression: 'code' }).success).toBe(false);
});

it('propagates runner review/hash/effect failures and never starts subsequent steps', async () => {
  for (const message of ['REVIEW_REQUIRED', 'INTENT_CHANGED', 'UNSUPPORTED_FEATURE']) {
    let calls = 0;
    await expect(runChain({}, [step(), step('details')], async () => { calls++; throw new Error(message); })).rejects.toThrow(message);
    expect(calls).toBe(1);
  }
});

it('binds deterministic evidence to the plan, pins, resolved inputs and projected results', async () => {
  const first = await runChain({ a: 'A', b: 'B' }, [step()], async () => ({ b: 2, a: 1 }));
  const reordered = await runChain({ b: 'B', a: 'A' }, [step()], async () => ({ a: 1, b: 2 }));
  expect(reordered).toEqual(first);
  const differentPin = await runChain({ a: 'A', b: 'B' }, [{ ...step(), manifestDigest: otherPin }], async () => ({ a: 1, b: 2 }));
  const differentInput = await runChain({ a: 'changed', b: 'B' }, [step()], async () => ({ a: 1, b: 2 }));
  const differentResult = await runChain({ a: 'A', b: 'B' }, [step()], async () => ({ a: 2, b: 2 }));
  for (const value of [differentPin, differentInput, differentResult]) expect(value.evidence.chainDigest).not.toBe(first.evidence.chainDigest);
  const left = await runChain({}, [{ ...step(), inputs: { x: literal('same') } }, { ...step('details'), inputs: { x: { source: 'step', step: 0, pointer: '/x' } } }], async () => ({ x: 'same' }));
  const right = await runChain({}, [{ ...step(), inputs: { x: literal('same') } }, { ...step('details'), inputs: { x: literal('same') } }], async () => ({ x: 'same' }));
  expect(left.evidence.steps).toEqual(right.evidence.steps);
  expect(left.evidence.chainDigest).not.toBe(right.evidence.chainDigest);
});

it('snapshots plans, inputs and projected results rather than mutating or trusting caller-owned objects', async () => {
  const inputs = { term: 'original' };
  const steps = [
    { ...step(), inputs: { x: { source: 'input' as const, pointer: '/term' } } },
    { ...step('details'), inputs: { x: { source: 'step' as const, step: 0, pointer: '/id' } } },
  ];
  const first = { id: 'original' };
  const output = await runChain(inputs, steps, async (id, values) => {
    if (id === 'catalog') {
      expect(values).toEqual({ x: 'original' });
      inputs.term = 'changed';
      steps[1].id = 'changed';
      steps[1].manifestDigest = otherPin;
      return first;
    }
    expect(id).toBe('details');
    expect(values).toEqual({ x: 'original' });
    first.id = 'changed';
    return { id: values.x };
  });
  expect(output.result).toEqual({ id: 'original' });
  const frozenSteps = Object.freeze([Object.freeze(step())]);
  await expect(runChain(Object.freeze({}), frozenSteps, async () => Object.freeze({ ok: true }))).resolves.toHaveProperty('result', { ok: true });
});

it.each([undefined, () => 'code', 1n, NaN, new Date(), { missing: undefined }])('rejects non-JSON runner results %#', async value => {
  await expect(runChain({}, [step()], async () => value)).rejects.toThrow('INVALID_INPUT');
});

it('rejects cyclic and excessively nested JSON without invoking later steps', async () => {
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  let nested: unknown = 'leaf';
  for (let i = 0; i < 40; i++) nested = { next: nested };
  for (const result of [cyclic, nested]) await expect(runChain({}, [step()], async () => result)).rejects.toThrow('INVALID_INPUT');
});

it('bounds UTF-8 output bytes including evidence, not just characters or the final result', async () => {
  await expect(runChain({}, [step()], async () => ({ text: 'é'.repeat(17000) }))).rejects.toThrow('BUDGET_EXCEEDED');
  await expect(runChain({}, [step()], async () => ({ text: 'x'.repeat(32500) }))).rejects.toThrow('BUDGET_EXCEEDED');
  const output = await runChain({}, [step()], async () => ({ text: 'x'.repeat(30000) }));
  expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(32768);
});

it('caps intermediate projected results even if the final result would be small', async () => {
  let calls = 0;
  await expect(runChain({}, [step(), step('details')], async () => { calls++; return { text: 'x'.repeat(32768) }; })).rejects.toThrow('BUDGET_EXCEEDED');
  expect(calls).toBe(1);
});

it('rejects oversized root input before executing a runner', async () => {
  let calls = 0;
  await expect(runChain({ text: 'x'.repeat(32769) }, [step()], async () => { calls++; return {}; })).rejects.toThrow('BUDGET_EXCEEDED');
  expect(calls).toBe(0);
});

it('times out a hanging runner at the total 30-second deadline and ignores late completion', async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  let calls = 0;
  const pending = runChain({}, [step(), step('details')], async () => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  });
  const assertion = expect(pending).rejects.toThrow('BUDGET_EXCEEDED');
  await vi.advanceTimersByTimeAsync(29999);
  expect(calls).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  await assertion;
  finish({ id: 'late' });
  await Promise.resolve();
  expect(calls).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('uses a chain-wide deadline rather than resetting the 30 seconds per step', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const pending = runChain({}, [step(), step('details'), step('third')], async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 20000));
    return {};
  });
  const assertion = expect(pending).rejects.toThrow('BUDGET_EXCEEDED');
  await vi.advanceTimersByTimeAsync(30000);
  await assertion;
  expect(calls).toBe(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(calls).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('clears its deadline timer on success and failure', async () => {
  vi.useFakeTimers();
  await runChain({}, [step()], async () => ({}));
  expect(vi.getTimerCount()).toBe(0);
  await expect(runChain({}, [step()], async () => { throw new Error('REVIEW_REQUIRED'); })).rejects.toThrow('REVIEW_REQUIRED');
  expect(vi.getTimerCount()).toBe(0);
});
