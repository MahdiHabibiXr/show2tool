import { z } from 'zod';
import { manifestSchema, specificationSchema, type Manifest } from '../contracts/manifest.js';
const scalarFields = z.record(z.string(), z.string().max(200));
const demoSchema = z.object({ inputs: scalarFields, request: z.object({ id: z.string().max(100), method: z.string(), path: z.string(), status: z.number(), shape: z.unknown(), queryKeys: z.array(z.string()), approvedQuery: scalarFields.optional(), approvedBody: scalarFields.optional(), omittedReason: z.string().optional(), requestOmittedReason: z.string().optional() }).strict() }).strict();
export function compileTool(demonstrations: unknown, specification: unknown): Manifest {
  const spec = specificationSchema.parse(specification);
  const demos = z.array(demoSchema).min(2).max(10).parse(demonstrations);
  for (const demo of demos) {
    if (demo.request.omittedReason || demo.request.requestOmittedReason || demo.request.shape == null || demo.request.status < 200 || demo.request.status >= 300) throw new Error('INCOMPLETE_EVIDENCE');
    if (demo.request.method !== spec.method || demo.request.path !== spec.path) throw new Error('INVALID_INPUT');
    if (demo.request.queryKeys.some(key => !Object.hasOwn(demo.request.approvedQuery ?? {}, key))) throw new Error('INCOMPLETE_EVIDENCE');
  }
  const bind = (kind: 'approvedQuery' | 'approvedBody'): Manifest['query'] => {
    const result: Manifest['query'] = Object.create(null);
    const keys = new Set(demos.flatMap(demo => Object.keys(demo.request[kind] ?? {})));
    for (const key of keys) {
      const values = demos.map(demo => demo.request[kind]?.[key]);
      if (values.some(value => value === undefined)) throw new Error('INCOMPLETE_EVIDENCE');
      const matches = Object.keys(spec.inputs).filter(name => demos.every((demo, index) => demo.inputs[name] === values[index]));
      if (new Set(values).size > 1) {
        if (matches.length !== 1) throw new Error('AMBIGUOUS_BINDING');
        result[key] = { source: 'input', name: matches[0] };
      } else result[key] = { source: 'literal', value: values[0]! };
    }
    return result;
  };
  const query = bind('approvedQuery');
  const body = bind('approvedBody');
  const used = new Set([...Object.values(query), ...Object.values(body)].flatMap(binding => binding.source === 'input' ? [binding.name] : []));
  if (Object.keys(spec.inputs).some(name => !used.has(name))) throw new Error('AMBIGUOUS_BINDING');
  return manifestSchema.parse({ ...spec, schemaVersion: 1, query, body, provenance: demos.map(demo => demo.request.id) });
}
export function materialize(manifest: Manifest, inputs: unknown): { method: string; url: string; body?: string } {
  const contract = manifestSchema.parse(manifest);
  if ((contract.method === 'GET' && contract.effect !== 'read') || (contract.effect === 'read' && contract.method !== 'GET')) throw new Error('UNSUPPORTED_FEATURE');
  const schema = z.object(Object.fromEntries(Object.entries(contract.inputs).map(([name, rule]) => [name, z.string().max(rule.maxLength)]))).strict();
  const checked = schema.safeParse(inputs);
  if (!checked.success) throw new Error('INVALID_INPUT');
  const resolve = (binding: Manifest['query'][string]) => {
    if (binding.source === 'literal') return binding.value;
    if (!Object.hasOwn(checked.data, binding.name)) throw new Error('INVALID_INPUT');
    return checked.data[binding.name];
  };
  const url = new URL(contract.path, contract.origin);
  for (const [key, value] of Object.entries(contract.query)) url.searchParams.set(key, resolve(value));
  const body = Object.fromEntries(Object.entries(contract.body).map(([key, value]) => [key, resolve(value)]));
  if (contract.method === 'GET' && Object.keys(body).length) throw new Error('INVALID_INPUT');
  return { method: contract.method, url: url.href, ...(Object.keys(body).length ? { body: JSON.stringify(body) } : {}) };
}
