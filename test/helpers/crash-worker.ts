import { createJournal } from '../../spike/journal.js';
const journal = await createJournal(process.argv[2]);
await journal.record('interrupted', 'dispatching');
process.stdout.write('durable\n');
setInterval(() => {}, 1000);
