import { z } from 'zod';
import { select } from './pointer.js';
export const expectationsSchema = z.array(z.object({ pointer: z.string().regex(/^(\/[a-zA-Z0-9_~\-]+)+$/).max(256), equals: z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]) }).strict()).min(1).max(20);
export function verifyFacts(result: unknown, expectations: unknown): { passed: boolean; checked: number } {
  const expected = expectationsSchema.parse(expectations);
  let passed = true;
  for (const fact of expected) { try { if (select(result, fact.pointer) !== fact.equals) passed = false; } catch { passed = false; } }
  return { passed, checked: expected.length };
}
