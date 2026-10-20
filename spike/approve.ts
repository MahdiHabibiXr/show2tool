import type { IntentStore, Prepared } from './intents.js';
export async function approveIntent(store: IntentStore, intent: Prepared, terminal: { interactive: boolean; ask(prompt: string): Promise<string> }): Promise<boolean> {
  if (!terminal.interactive) return false;
  const preview = JSON.stringify(store.preview(intent.id, intent.digest));
  const answer = await terminal.ask(`Synthetic mutation ${intent.id}; destination ${JSON.stringify(store.destination(intent.id, intent.digest) ?? 'unbound; cannot dispatch')}; principal ${JSON.stringify(store.principal(intent.id, intent.digest))}; change ${preview}. Type approve ${intent.id}: `);
  if (answer !== `approve ${intent.id}`) return false;
  store.confirm(intent.id, intent.digest);
  return true;
}
