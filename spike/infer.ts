export type Binding = { slot: string; input: string; evidence: string[] };
export type Candidate = { bindings: Binding[]; unresolved: string[] };
export function infer(demos: ReadonlyArray<{ inputs: Record<string, string>; approvedSlots: Record<string, string> }>): Candidate {
  const result: Candidate = { bindings: [], unresolved: [] };
  if (demos.length < 2) throw new Error('two demonstrations required');
  const slots = new Set(demos.flatMap(d => Object.keys(d.approvedSlots)));
  for (const slot of slots) {
    const values = demos.map(d => d.approvedSlots[slot]);
    const matches = Object.keys(demos[0].inputs).filter(input => demos.every(d => Object.hasOwn(d.approvedSlots, slot) && Object.hasOwn(d.inputs, input) && d.inputs[input] === d.approvedSlots[slot]));
    if (matches.length !== 1 || new Set(values).size < 2) result.unresolved.push(slot);
    else result.bindings.push({ slot, input: matches[0], evidence: demos.map((_, i) => `demo:${i}`) });
  }
  return result;
}
