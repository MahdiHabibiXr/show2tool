import { it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultStateDir } from '../../src/browser/host.js';
it('uses an explicitly configured local state directory instead of filling the home drive', () => {
  const old = process.env.SHOW2TOOL_STATE_DIR;
  const target = join(tmpdir(), 'show2tool-configured-state');
  try {
    process.env.SHOW2TOOL_STATE_DIR = target;
    expect(defaultStateDir()).toBe(target);
  } finally { if (old === undefined) delete process.env.SHOW2TOOL_STATE_DIR; else process.env.SHOW2TOOL_STATE_DIR = old; }
});
