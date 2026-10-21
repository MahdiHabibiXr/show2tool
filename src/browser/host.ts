import { createInterface } from 'node:readline/promises';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BrowserSession, scopeSchema } from './session.js';
import { ReviewStore } from '../approval/review.js';
import { SavedToolCatalog } from '../app/catalog.js';
import { consoleHelp, handleConsoleCommand } from './console.js';
import { WorkflowRegistry } from '../app/registry.js';
import { acquireOwnership } from '../broker/ownership.js';
import { startBroker } from '../broker/server.js';
import { failure } from '../contracts/results.js';
export function defaultStateDir(): string { return join(homedir(), '.show2tool'); }
export async function host(scopeFile: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(JSON.stringify(failure('REVIEW_REQUIRED', 'Start host from a real interactive terminal to review scope.')));
    process.exitCode = 3; return;
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
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
    const reviews = new ReviewStore();
    const owned = session;
    const registry = new WorkflowRegistry(reviews, url => owned.headers(url));
    broker = await startBroker(dir, registry, session);
    const catalog = new SavedToolCatalog(dir);
    console.log(`Agent broker ready. ${consoleHelp} No approval command is exposed through MCP.`);
    while (true) {
      const command = await terminal.question('show2tool> ');
      if (command === 'quit') break;
      console.log(await handleConsoleCommand(command, { catalog, registry, reviews, scope, terminal: { interactive: true, ask: prompt => terminal.question(prompt) } }));
    }
  } catch { console.error('Host could not start; check scope input and Chrome availability.'); process.exitCode = 4; }
  finally { terminal.close(); await broker?.close(); await session?.close(); await owner?.release(); }
}
