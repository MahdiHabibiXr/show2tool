import { MutationJournal } from '../../src/approval/journal.js';
const [directory, id] = process.argv.slice(2);
const journal = new MutationJournal(directory);
if (!await journal.claim(id)) throw new Error('claim failed');
console.log('durable');
setInterval(() => {}, 1000);
