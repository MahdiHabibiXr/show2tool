import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { handle } from '../app/handlers.js';
import { commandSchema, discovery } from '../contracts/commands.js';
export async function serve(): Promise<void> {
  const server = new McpServer({ name: 'show2tool', version: '0.0.0' });
  for (const schema of commandSchema.options) {
    const name = schema.shape.command.value;
    server.registerTool(`show2tool_${name}`, {
      description: discovery.find(command => command.name === name)!.description,
      inputSchema: z.object(Object.fromEntries(Object.entries(schema.shape).filter(([key]) => key !== 'command')) as Record<string, z.ZodType>).strict(),
      annotations: { readOnlyHint: !['record_start', 'record_stop'].includes(name), destructiveHint: false, openWorldHint: name === 'run' },
    }, async args => {
      const input = { ...args, command: name };
      const result = ['compile_recordings', 'record_start', 'record_stop', 'recording', 'tools', 'run'].includes(name)
        ? await (await import('../broker/server.js')).callBroker((await import('../browser/host.js')).defaultStateDir(), input)
        : await handle(input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: !result.ok };
    });
  }
  await server.connect(new StdioServerTransport());
}
