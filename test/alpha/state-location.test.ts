import { it, expect } from 'vitest';
import { defaultStateDir } from '../../src/browser/host.js';
it('uses an explicitly configured local state directory instead of filling the home drive', () => {
  const old = process.env.SHOW2TOOL_STATE_DIR;
  try {
    process.env.SHOW2TOOL_STATE_DIR = 'F:/show2tool-workspace/state';
    expect(defaultStateDir().replace(/\\/g, '/')).toBe('F:/show2tool-workspace/state');
  } finally { if (old === undefined) delete process.env.SHOW2TOOL_STATE_DIR; else process.env.SHOW2TOOL_STATE_DIR = old; }
});
