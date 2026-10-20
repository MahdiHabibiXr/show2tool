import { registerFixture } from '../../spike/fixture/registry.js';
import { createIntentStore, dispatchFixtureWrite } from '../../spike/intents.js';
import { createJournal } from '../../spike/journal.js';
const [path, origin] = process.argv.slice(2);
registerFixture(origin);
const store = createIntentStore();
const intent = store.prepare({ kind: 'create', title: 'committed before crash' }, 'tenant:A', origin);
store.confirm(intent.id, intent.digest);
const journal = await createJournal(path);
await dispatchFixtureWrite(origin, store, intent, { bearer: 'synthetic' }, {
  state: () => journal.state('crash-write'),
  record: (_id, state) => journal.record('crash-write', state),
});
