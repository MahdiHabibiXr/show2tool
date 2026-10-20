// Process-local capability for this synthetic probe only. Not a production origin policy.
const active = new Set<string>();
export function registerFixture(origin: string): void { active.add(origin); }
export function unregisterFixture(origin: string): void { active.delete(origin); }
export function requireFixture(origin: string): void { if (!active.has(origin)) throw new Error('unregistered fixture'); }
