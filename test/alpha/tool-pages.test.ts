import { it, expect } from 'vitest';
import { ReviewStore } from '../../src/approval/review.js';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { handle } from '../../src/app/handlers.js';
it('pages large reviewed catalogs within the IPC result budget', async () => {
  const reviews = new ReviewStore();
  const registry = new WorkflowRegistry(reviews);
  const inputs = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`field_${index}_${'x'.repeat(50)}`, { type: 'string', maxLength: 200 }]));
  for (let index = 0; index < 25; index++) {
    const manifest = { schemaVersion: 1, id: `tool_${index}`, origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', inputs, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
    await reviews.review(manifest, { interactive: true, ask: async () => `review tool_${index}` });
    registry.register(manifest, { origin: manifest.origin });
  }
  let offset: number | null = 0;
  const ids: string[] = [];
  while (offset !== null) {
    const result = await handle({ command: 'tools', offset }, registry);
    expect(result.ok).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(32768);
    if (!result.ok) throw new Error('page failed');
    const page = result.data as { tools: { id: string }[]; nextOffset: number | null };
    ids.push(...page.tools.map(tool => tool.id));
    offset = page.nextOffset;
  }
  expect(new Set(ids).size).toBe(25);
});
