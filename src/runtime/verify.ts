import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { manifestHash } from '../approval/review.js';
import type { Manifest } from '../contracts/manifest.js';

const pointer = z.string().max(256).regex(/^(\/(?:[^~/]|~[01])*)*$/).refine(value => !value.split('/').some(key => ['__proto__', 'prototype', 'constructor'].includes(key.replace(/~1/g, '/').replace(/~0/g, '~'))));
export const expectationsSchema = z.record(pointer, z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()])).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 20);
export type Expectations = z.infer<typeof expectationsSchema>;

export async function verifyRead(manifest: Manifest, inputs: unknown, expected: Expectations, execute: () => Promise<unknown>, stateDir: string) {
  const output = await execute() as Record<string, unknown>;
  const assertions = Object.entries(expected).map(([pointer, expectedValue]) => {
    const projection = manifest.projection.filter(prefix => pointer === prefix || pointer.startsWith(prefix + '/')).sort((a, b) => b.length - a.length)[0];
    let value: unknown = projection === undefined ? undefined : output[projection];
    if (projection !== undefined) {
      for (const escaped of pointer.slice(projection.length).split('/').slice(1)) {
        const key = escaped.replace(/~1/g, '/').replace(/~0/g, '~');
        if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) { value = undefined; break; }
        value = (value as Record<string, unknown>)[key];
      }
    }
    return { pointer, passed: value === expectedValue };
  });
  const evidenceId = randomUUID();
  const report = {
    schemaVersion: 1,
    evidenceId,
    toolId: manifest.id,
    manifestDigest: manifestHash(manifest),
    caseDigest: createHash('sha256').update(JSON.stringify({ inputs, expected })).digest('hex'),
    timestamp: new Date().toISOString(),
    status: assertions.every(assertion => assertion.passed) ? 'passed' : 'failed',
    assertions,
  };
  try {
    await mkdir(join(stateDir, 'verification'), { recursive: true, mode: 0o700 });
    const file = await open(join(stateDir, 'verification', `${evidenceId}.json`), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(report), 'utf8'); await file.sync(); }
    finally { await file.close(); }
  } catch { throw new Error('EVIDENCE_SAVE_FAILED'); }
  return report;
}
