import { open } from 'node:fs/promises';
import { inspectRecording } from './inspect.js';
import { infer } from './infer.js';

async function readJson(path: string): Promise<unknown> {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error();
    const buffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    let used = 0;
    while (used < buffer.length) {
      const result = await handle.read(buffer, used, buffer.length - used, null);
      if (result.bytesRead === 0) break;
      used += result.bytesRead;
    }
    if (used > 10 * 1024 * 1024) throw new Error();
    return JSON.parse(buffer.subarray(0, used).toString('utf8'));
  } finally { await handle.close(); }
}
const [command, path, ...extra] = process.argv.slice(2);
try {
  if (!path || extra.length || !['inspect', 'infer'].includes(command)) throw new Error();
  const value = await readJson(path);
  let output: unknown;
  if (command === 'inspect') output = inspectRecording(value);
  else {
    if (!Array.isArray(value) || value.length < 2 || value.length > 10) throw new Error();
    for (const demo of value) {
      if (!demo || typeof demo !== 'object') throw new Error();
      for (const field of ['inputs', 'approvedSlots']) {
        const fields = demo[field];
        if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length > 20 ||
          !Object.entries(fields).every(([key, item]) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) && typeof item === 'string' && item.length <= 200)) throw new Error();
      }
    }
    output = infer(value);
  }
  console.log(JSON.stringify(output, null, 2));
} catch {
  console.error('invalid input; usage: npm run cli -- inspect <recording.json> | infer <demos.json>');
  process.exitCode = 2;
}
