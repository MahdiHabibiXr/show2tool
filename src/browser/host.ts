import { createInterface } from 'node:readline/promises';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { BrowserSession, scopeSchema } from './session.js';
import { DurableJournal } from '../approval/journal.js';
import { WriteIntents } from '../approval/intents.js';
import { ReviewStore } from '../approval/review.js';
import { WorkflowRegistry } from '../app/registry.js';
import { acquireOwnership } from '../broker/ownership.js';
import { startBroker } from '../broker/server.js';
import { failure } from '../contracts/results.js';
export function defaultStateDir(): string { return process.env.SHOW2TOOL_STATE_DIR ? resolve(process.env.SHOW2TOOL_STATE_DIR) : join(homedir(), '.show2tool'); }
export async function host(scopeFile: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(JSON.stringify(failure('REVIEW_REQUIRED', 'Start host from a real interactive terminal to review scope.')));
    process.exitCode = 3; return;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let journal: DurableJournal | undefined;
  let owner: Awaited<ReturnType<typeof acquireOwnership>> | undefined;
  let session: BrowserSession | undefined;
  let broker: Awaited<ReturnType<typeof startBroker>> | undefined;
  try {
    const text = await readFile(scopeFile, 'utf8');
    if (Buffer.byteLength(text) > 16384) throw new Error();
    const scope = scopeSchema.parse(JSON.parse(text));
    console.log('Dedicated profile stores login state locally. Do not approve sensitive fields.');
    console.log(JSON.stringify(scope, null, 2));
    if (await terminal.question('Type authorize to open this scoped browser: ') !== 'authorize') return;
    const dir = defaultStateDir(); await mkdir(dir, { recursive: true, mode: 0o700 });
    owner = await acquireOwnership(dir);
    session = await BrowserSession.open(dir, scope);
    await terminal.question('Log in manually in Chrome. Press Enter only when ready to record: ');
    journal = await DurableJournal.open(join(dir, 'dispatch.jsonl'));
    const intents = new WriteIntents(journal);
    const reviews = new ReviewStore();
    const owned = session;
    const registry = new WorkflowRegistry(reviews, url => owned.headers(url), intents);
    broker = await startBroker(dir, registry, session);
    console.log('Agent broker ready. Commands: review <manifest-file>, approve <intent-id>, quit. No approval command is exposed through MCP.');
    while (true) {
      const command = await terminal.question('show2tool> ');
      if (command === 'quit') break;
      if (command.startsWith('approve ')) {
        try { console.log(await intents.approve(command.slice(8).trim(), { interactive: true, ask: prompt => terminal.question(prompt) }) ? 'One-use write approved.' : 'Not approved.'); } catch { console.log('Approval unavailable, changed or expired.'); }
      } else if (command.startsWith('review ')) {
        try {
          const source = await readFile(resolve(command.slice(7)), 'utf8');
          if (Buffer.byteLength(source) > 32768) throw new Error();
          const manifest: unknown = JSON.parse(source);
          if (await reviews.review(manifest, { interactive: true, ask: prompt => terminal.question(prompt) })) {
            registry.register(manifest, scope);
            console.log('Reviewed tool registered; writes still need per-invocation approval.');
          } else console.log('Not granted.');
        } catch { console.log('Review failed; check the manifest and scoped destination.'); }
      } else console.log('Use review <manifest-file>, approve <intent-id> or quit.');
    }
  } catch { console.error('Host could not start; check scope input and Chrome availability.'); process.exitCode = 4; }
  finally { terminal.close(); await broker?.close(); await session?.close(); await journal?.close(); await owner?.release(); }
}
