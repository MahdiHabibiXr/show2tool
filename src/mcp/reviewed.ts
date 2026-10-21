import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { callBroker } from '../broker/server.js';
import { defaultStateDir } from '../browser/host.js';

const descriptorSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  effect: z.literal('read'),
  inputs: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).refine(name => !['constructor', 'prototype', '__proto__'].includes(name)), z.object({ type: z.literal('string'), maxLength: z.number().int().min(1).max(200) }).strict()),
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export async function serveReviewed(stateDir = defaultStateDir()): Promise<void> {
  const tools: z.infer<typeof descriptorSchema>[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const result = await callBroker(stateDir, { command: 'tools', offset });
    if (!result.ok) throw new Error('Start the human host and review tools before starting reviewed MCP mode.');
    const page = z.object({ tools: z.array(descriptorSchema).max(5), nextOffset: z.number().int().min(0).nullable() }).strict().parse(result.data);
    tools.push(...page.tools);
    if (tools.length > 1000 || (page.nextOffset !== null && page.nextOffset <= offset)) throw new Error('Reviewed tool discovery limit exceeded.');
    offset = page.nextOffset;
  }
  const server = new McpServer({ name: 'show2tool-reviewed', version: '0.0.0' });
  for (const tool of tools) {
    const fields = Object.fromEntries(Object.entries(tool.inputs).map(([name, input]) => [name, z.string().max(input.maxLength)]));
    server.registerTool(`workflow_${tool.id}`, {
      description: `Execute human-reviewed read workflow ${tool.id}. Bound to manifest ${tool.manifestDigest}.`,
      inputSchema: z.object(fields).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    }, async inputs => {
      const response = await callBroker(stateDir, { command: 'run', id: tool.id, inputs, manifestDigest: tool.manifestDigest });
      return { content: [{ type: 'text', text: JSON.stringify(response) }], structuredContent: response, isError: !response.ok };
    });
  }
  await server.connect(new StdioServerTransport());
}
