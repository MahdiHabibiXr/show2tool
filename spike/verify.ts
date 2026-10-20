import { createHash } from 'node:crypto';
import type { Task } from './contracts.js';
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
}
export function freezeContract(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function assertUnchanged(value: unknown, digest: string): void { if (freezeContract(value) !== digest) throw new Error('contract changed'); }
export function assertExpectedTasks(tasks: Task[], expectedIds: string[]): void {
  const actual = tasks.map(t => t.id).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expectedIds].sort())) throw new Error('result mismatch');
}
