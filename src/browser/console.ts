import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SavedToolCatalog } from '../app/catalog.js';
import { WorkflowRegistry } from '../app/registry.js';
import { parseReviewArtifact, ReviewStore } from '../approval/review.js';
import type { DestinationGrant } from '../runtime/policy.js';

export const consoleHelp = 'Commands: review <manifest-file>, saved, load <tool-id> [digest], quit.';
export async function handleConsoleCommand(command: string, context: {
  catalog: SavedToolCatalog;
  registry: WorkflowRegistry;
  reviews: ReviewStore;
  scope: DestinationGrant;
  terminal: { interactive: boolean; ask(prompt: string): Promise<string> };
}): Promise<string> {
  try {
    if (command === 'saved') {
      const saved = await context.catalog.list();
      return saved.length ? JSON.stringify(saved, null, 2) + '\nDefinitions only; use load <tool-id> [digest] for fresh human review. Invalid saved files are omitted.' : 'No valid saved tools found. Invalid saved files are omitted.';
    }
    const load = /^load ([a-z][a-z0-9_]{0,63})(?: ([a-f0-9]{64}))?$/.exec(command);
    if (!command.startsWith('review ') && !load) return consoleHelp;
    const manifest = load
      ? await context.catalog.load(load[1], load[2])
      : parseReviewArtifact(await readFile(resolve(command.slice(7)), 'utf8'));
    if (!await context.reviews.review(manifest, context.terminal)) return 'Not granted.';
    context.registry.register(manifest, context.scope);
    try { await context.catalog.save(manifest); }
    catch { return 'Reviewed read tool registered for this session, but saving failed. Keep the original manifest file.'; }
    return 'Reviewed read tool registered and definition saved. Restart requires fresh review.';
  } catch (error) {
    if (error instanceof Error && error.message === 'SAVED_TOOL_AMBIGUOUS') return 'Multiple saved versions; use saved, then load <tool-id> <digest>.';
    if (error instanceof Error && error.message === 'SAVED_TOOL_NOT_FOUND') return 'No saved tool with that ID. Use saved to list definitions.';
    return 'Review or catalog operation failed; check the manifest, saved definition and scoped destination.';
  }
}
