import { registerFixture } from '../../spike/fixture/registry.js';
import { SyntheticMutations } from '../../spike/mutations.js';
const [directory, origin] = process.argv.slice(2);
registerFixture(origin);
const coordinator = new SyntheticMutations(directory, { cookie: 'synthetic=A' });
const contract = { schemaVersion: 1, id: 'create', origin, effect: 'create', method: 'POST', path: '/api/tasks', inputs: { title: { type: 'string', maxLength: 50 } }, body: { title: { source: 'input', name: 'title' } }, principal: { path: '/api/me', pointer: '/tenant' }, readBack: { path: '/api/tasks/{createdId}', idSource: '/id', expected: { '/title': { source: 'input', name: 'title' }, '/tenant': { source: 'principal' } } } };
const intent = await coordinator.prepare(contract, { title: 'synthetic crash' });
// Controlled test adapter only; never used by the human host or public commands.
await coordinator.approve(intent.id, { interactive: true, ask: async () => `approve ${intent.id}` });
console.log(JSON.stringify({ intentId: intent.id }));
await coordinator.dispatch(intent.id);
