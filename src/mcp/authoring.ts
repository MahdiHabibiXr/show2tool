import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { handle } from '../app/handlers.js';
import { commandSchema, discovery } from '../contracts/commands.js';
export async function serve(): Promise<void> {
  const server = new McpServer({ name: 'show2tool', version: '0.1.0' });
  for (const schema of commandSchema.options) {
    const name = schema.shape.command.value;
    server.registerTool(`show2tool_${name}`, {
      description: discovery.find(command => command.name === name)!.description,
      inputSchema: z.object(Object.fromEntries(Object.entries(schema.shape).filter(([key]) => key !== 'command')) as Record<string, z.ZodType>).strict(),
      annotations: { readOnlyHint: !['record_start', 'record_stop', 'prepare_write', 'execute_write'].includes(name), destructiveHint: name === 'execute_write', openWorldHint: ['run_chain', 'run', 'reconcile_write', 'verify', 'prepare_write', 'execute_write'].includes(name) },
    }, async args => {
      const input = { ...args, command: name };
      const result = ['run_chain', 'describe', 'reconcile_write', 'verify', 'export_bundle', 'prepare_write', 'execute_write', 'write_status', 'compile_recordings', 'record_start', 'record_stop', 'recording', 'tools', 'run'].includes(name)
        ? await (await import('../broker/server.js')).callBroker((await import('../browser/host.js')).defaultStateDir(), input)
        : await handle(input);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: !result.ok };
    });
  }
  const { callBroker } = await import('../broker/server.js');
  const stateDir = (await import('../browser/host.js')).defaultStateDir();
  const listing = await callBroker(stateDir, { command: 'tools' });
  if (listing.ok) {
    const tools = (listing.data as { tools: { id: string; effect: string; inputs: Record<string, { type: string; maxLength: number }>; manifestDigest: string }[] }).tools;
    for (const tool of tools) {
      if (tool.effect !== 'read') continue;
      const inputSchema = z.object(Object.fromEntries(Object.entries(tool.inputs).map(([name, rule]) => [name, z.string().max(rule.maxLength)]))).strict();
      server.registerTool(`workflow_${tool.id}`, { description: `Run reviewed read workflow ${tool.id}; pinned to ${tool.manifestDigest}.`, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true } }, async args => {
        const result = await callBroker(stateDir, { command: 'run', id: tool.id, inputs: args, manifestDigest: tool.manifestDigest });
        return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: !result.ok };
      });
    }
  }
  await server.connect(new StdioServerTransport());
}
