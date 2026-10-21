import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { callBroker } from '../broker/server.js';
import { defaultStateDir } from '../browser/host.js';
import { chainDefinitionSchema } from '../contracts/chain.js';

const descriptorSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  effect: z.literal('read'),
  inputs: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).refine(name => !['constructor', 'prototype', '__proto__'].includes(name)), z.object({ type: z.literal('string'), maxLength: z.number().int().min(1).max(200) }).strict()),
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  chainSupported: z.boolean(),
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
  const chainDescriptors: { id: string; digest: string; inputs: z.infer<typeof descriptorSchema>['inputs'] }[] = [];
  offset = 0;
  while (offset !== null) {
    const result = await callBroker(stateDir, { command: 'chains', offset });
    if (!result.ok) { chainDescriptors.length = 0; console.error('Saved chain discovery unavailable; exposing reviewed workflows only.'); break; }
    const page = z.object({ chains: z.array(z.object({ id: descriptorSchema.shape.id, digest: descriptorSchema.shape.manifestDigest, inputs: descriptorSchema.shape.inputs }).strict()).max(5), nextOffset: z.number().int().min(0).nullable() }).strict().parse(result.data);
    chainDescriptors.push(...page.chains);
    if (chainDescriptors.length > 1000 || (page.nextOffset !== null && page.nextOffset <= offset)) throw new Error('Saved chain discovery limit exceeded.');
    offset = page.nextOffset;
  }
  const ids = new Set<string>();
  for (const chain of chainDescriptors) {
    if (ids.has(chain.id) || chainDescriptors.filter(item => item.id === chain.id).length !== 1) continue;
    const result = await callBroker(stateDir, { command: 'chain', id: chain.id, digest: chain.digest });
    if (!result.ok) continue;
    const definition = chainDefinitionSchema.parse(result.data);
    if (!definition.steps.every(step => tools.some(tool => tool.id === step.id && tool.manifestDigest === step.manifestDigest && tool.chainSupported))) continue;
    ids.add(chain.id);
    const fields = Object.fromEntries(Object.entries(chain.inputs).map(([name, input]) => [name, z.string().max(input.maxLength)]));
    server.registerTool(`chain_${chain.id}`, {
      description: `Execute saved read chain ${chain.id}, definition ${chain.digest}. Every constituent tool requires current human review.`,
      inputSchema: z.object(fields).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    }, async inputs => {
      const response = await callBroker(stateDir, { command: 'run_saved_chain', id: chain.id, digest: chain.digest, inputs });
      return { content: [{ type: 'text', text: JSON.stringify(response) }], structuredContent: response, isError: !response.ok };
    });
  }
  await server.connect(new StdioServerTransport());
}
