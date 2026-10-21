import { it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { handle } from '../../src/app/handlers.js';
it('exposes discovery and inspection with CLI-equivalent structured results', async () => {
  const client = new Client({ name: 'show2tool-test', version: '0.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/src/cli.js', 'serve', '--stdio'], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    expect(list.tools.map(tool => tool.name)).toContain('show2tool_inspect');
    expect(list.tools.map(tool => tool.name)).not.toContain('approve');
    const recording = [{ method: 'GET', path: '/catalog', queryKeys: [], status: 200, shape: {} }];
    const result = await client.callTool({ name: 'show2tool_inspect', arguments: { recording } });
    expect(result.structuredContent).toEqual(await handle({ command: 'inspect', recording }));
    expect(result.isError).not.toBe(true);
  } finally { await client.close(); }
});
it('advertises network effects accurately for reviewed read execution', async () => {
  const client = new Client({ name: 'show2tool-test', version: '0.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/src/cli.js', 'serve', '--stdio'], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    const run = list.tools.find(tool => tool.name === 'show2tool_run');
    expect(run?.annotations?.openWorldHint).toBe(true);
    expect(run?.description).toContain('reviewed');
  } finally { await client.close(); }
});
