import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { chainDefinitionSchema, type ChainDefinition } from '../contracts/chain.js';
function digest(definition: ChainDefinition): string { return createHash('sha256').update(JSON.stringify(definition)).digest('hex'); }
export class SavedChains {
  private readonly directory: string;
  constructor(stateDir: string) { this.directory = join(stateDir, 'chains'); }
  async save(value: unknown) {
    const definition = chainDefinitionSchema.parse(value);
    const text = JSON.stringify(definition);
    if (Buffer.byteLength(text) > 32768) throw new Error('BUDGET_EXCEEDED');
    const hash = digest(definition);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      try { await file.writeFile(text, 'utf8'); await file.sync(); } finally { await file.close(); }
      try { await link(temporary, join(this.directory, `${definition.id}-${hash}.json`)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; await this.load(definition.id, hash); }
    } finally { await unlink(temporary); }
    return { id: definition.id, digest: hash, permissionGranted: false };
  }
  async load(id: string, hash: string): Promise<ChainDefinition> {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(id) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('INVALID_INPUT');
    const file = await open(join(this.directory, `${id}-${hash}.json`), 'r');
    try {
      if (!(await file.stat()).isFile()) throw new Error('INVALID_INPUT');
      const buffer = Buffer.alloc(32769); let size = 0;
      while (size < buffer.length) { const chunk = await file.read(buffer, size, buffer.length - size, null); if (!chunk.bytesRead) break; size += chunk.bytesRead; }
      if (size > 32768) throw new Error('BUDGET_EXCEEDED');
      const definition = chainDefinitionSchema.parse(JSON.parse(buffer.subarray(0, size).toString('utf8')));
      if (definition.id !== id || digest(definition) !== hash) throw new Error('INVALID_INPUT');
      return definition;
    } finally { await file.close(); }
  }
  async list() {
    let files: string[];
    try { files = await readdir(this.directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const found = [];
    for (const name of files.sort()) {
      const match = /^([a-z][a-z0-9_]{0,63})-([a-f0-9]{64})\.json$/.exec(name);
      if (!match) continue;
      try { const definition = await this.load(match[1], match[2]); found.push({ id: definition.id, digest: match[2], inputs: definition.inputs }); } catch {}
    }
    return found;
  }
  inputs(definition: ChainDefinition, value: unknown): Record<string, string> {
    return z.object(Object.fromEntries(Object.entries(definition.inputs).map(([name, rule]) => [name, z.string().max(rule.maxLength)]))).strict().parse(value);
  }
}
