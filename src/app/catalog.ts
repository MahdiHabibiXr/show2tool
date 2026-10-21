import { link, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { manifestHash, parseReviewArtifact } from '../approval/review.js';
import { manifestSchema, type Manifest } from '../contracts/manifest.js';

type SavedTool = { id: string; digest: string; origin: string; path: string };
const filenamePattern = /^([a-z][a-z0-9_]{0,63})-([a-f0-9]{64})\.json$/;
export class SavedToolCatalog {
  private readonly directory: string;
  constructor(stateDir: string) { this.directory = join(stateDir, 'tools'); }
  async save(value: unknown): Promise<SavedTool> {
    const manifest = manifestSchema.parse(value);
    if (manifest.effect !== 'read' || manifest.method !== 'GET') throw new Error('UNSUPPORTED_FEATURE');
    const text = JSON.stringify(manifest);
    if (Buffer.byteLength(text) > 32768) throw new Error('BUDGET_EXCEEDED');
    const digest = manifestHash(manifest);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = join(this.directory, `${manifest.id}-${digest}.json`);
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      try { await file.writeFile(text, 'utf8'); await file.sync(); }
      finally { await file.close(); }
      try { await link(temporary, destination); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try { await this.load(manifest.id, digest); }
        catch (error) {
          if (!(error instanceof Error) || error.message !== 'INVALID_SAVED_TOOL') throw error;
          await rename(destination, `${destination}.${randomUUID()}.invalid`);
          await link(temporary, destination);
        }
      }
    } finally { await unlink(temporary); }
    return { id: manifest.id, digest, origin: manifest.origin, path: manifest.path };
  }
  async list(): Promise<SavedTool[]> {
    let names: string[];
    try { names = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const tools: SavedTool[] = [];
    for (const name of names.sort()) {
      const match = filenamePattern.exec(name);
      if (!match) continue;
      try {
        const manifest = await this.load(match[1], match[2]);
        tools.push({ id: manifest.id, digest: match[2], origin: manifest.origin, path: manifest.path });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'INVALID_SAVED_TOOL') throw error;
      }
    }
    return tools;
  }
  async load(id: string, digest?: string): Promise<Manifest> {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(id) || (digest !== undefined && !/^[a-f0-9]{64}$/.test(digest))) throw new Error('INVALID_SAVED_TOOL');
    if (digest === undefined) {
      const matches = (await this.list()).filter(tool => tool.id === id);
      if (!matches.length) throw new Error('SAVED_TOOL_NOT_FOUND');
      if (matches.length > 1) throw new Error('SAVED_TOOL_AMBIGUOUS');
      digest = matches[0].digest;
    }
    const file = await open(join(this.directory, `${id}-${digest}.json`), 'r');
    try {
      if (!(await file.stat()).isFile()) throw new Error('INVALID_SAVED_TOOL');
      const buffer = Buffer.alloc(32769);
      let size = 0;
      while (size < buffer.length) {
        const part = await file.read(buffer, size, buffer.length - size, null);
        if (!part.bytesRead) break;
        size += part.bytesRead;
      }
      if (size > 32768) throw new Error('INVALID_SAVED_TOOL');
      let manifest: Manifest;
      try { manifest = parseReviewArtifact(buffer.subarray(0, size).toString('utf8')); }
      catch { throw new Error('INVALID_SAVED_TOOL'); }
      if (manifest.id !== id || manifestHash(manifest) !== digest || manifest.effect !== 'read' || manifest.method !== 'GET') throw new Error('INVALID_SAVED_TOOL');
      return manifest;
    } finally { await file.close(); }
  }
}
