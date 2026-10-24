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
it('exposes reviewed named read tools with digest-pinned execution through the broker', async () => {
  const { startBroker }=await import('../../src/broker/server.js');
  const { ReviewStore }=await import('../../src/approval/review.js');
  const { WorkflowRegistry }=await import('../../src/app/registry.js');
  const { createServer }=await import('node:http');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const server=createServer((_,res)=>{res.setHeader('content-type','application/json');res.end('{"items":["named-tool"]}');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const dir=await mkdtemp(join(tmpdir(),'show2tool-named-'));
  const reviews=new ReviewStore();const registry=new WorkflowRegistry(reviews);
  const manifest={schemaVersion:1,id:'catalog',origin,path:'/catalog',method:'GET',effect:'read',inputs:{},query:{},body:{},projection:['/items'],provenance:['a','b']};
  await reviews.review(manifest,{interactive:true,ask:async()=> 'review catalog'});registry.register(manifest,{origin,addresses:['127.0.0.1']});
  const broker=await startBroker(dir,registry);const client=new Client({name:'test',version:'0.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:['dist/src/cli.js','serve','--stdio'],env:{...process.env,SHOW2TOOL_STATE_DIR:dir} as Record<string,string>,stderr:'pipe'});
  try {await client.connect(transport);const tools=await client.listTools();expect(tools.tools.map(tool=>tool.name)).toContain('workflow_catalog');
    expect((await client.callTool({name:'workflow_catalog',arguments:{}})).structuredContent).toMatchObject({ok:true,data:{'/items':['named-tool']}});
  }finally{await client.close();await broker.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
