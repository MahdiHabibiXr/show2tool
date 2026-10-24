import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { compileTool } from '../../src/workflow/candidate.js';
import { executeRead } from '../../src/runtime/execute.js';
it('executes a compiled mapping against a differently shaped application', async () => {
  let received = '';
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://local'); received = url.searchParams.get('term') ?? '';
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ results: [{ sku: 'book-7', label: received }], privateField: 'CANARY' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const demos = ['one', 'two'].map((value, index) => ({ inputs: { title: value }, request: { id: String(index), method: 'GET', path: '/library/find', status: 200, shape: {}, queryKeys: ['term'], approvedQuery: { term: value } } }));
    const manifest = compileTool(demos, { id: 'library_search', origin, method: 'GET', path: '/library/find', effect: 'read', inputs: { title: { type: 'string', maxLength: 100 } }, projection: ['/results'] });
    const result = await executeRead(manifest, { title: 'unseen book' }, { origin, addresses: ['127.0.0.1'] });
    expect(received).toBe('unseen book');
    expect(result).toEqual({ '/results': [{ sku: 'book-7', label: 'unseen book' }] });
    expect(JSON.stringify(result)).not.toContain('CANARY');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
it('rejects mutations from the read runtime', async () => {
  await expect(executeRead({ schemaVersion: 1, effect: 'create' }, {}, { origin: 'https://example.com' })).rejects.toThrow();
});
it('accumulates explicitly bounded cursor pages without following arbitrary URLs', async()=>{
  let calls=0;const server=createServer((req,res)=>{calls++;const page=new URL(req.url!,'http://local').searchParams.get('cursor');res.setHeader('content-type','application/json');res.end(JSON.stringify({items:page?[{id:'b'}]:[{id:'a'}],next:page?null:'second'}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{const demos=['one','two'].map((value,index)=>({inputs:{q:value},request:{id:String(index),method:'GET',path:'/items',status:200,shape:{},queryKeys:['q'],approvedQuery:{q:value}}}));
    const manifest=compileTool(demos,{id:'pages',origin,method:'GET',path:'/items',effect:'read',inputs:{q:{type:'string',maxLength:100}},projection:['/items'],pagination:{parameter:'cursor',items:'/items',next:'/next',maxPages:5}});
    expect(await executeRead(manifest,{q:'third'},{origin,addresses:['127.0.0.1'],queryKeys:['q','cursor']})).toEqual({'/items':[{id:'a'},{id:'b'}]});expect(calls).toBe(2);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('rejects pagination cursor cycles instead of returning partial results',async()=>{
  const server=createServer((_,res)=>{res.setHeader('content-type','application/json');res.end('{"items":[{"id":"a"}],"next":"same"}');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {const manifest={schemaVersion:1,id:'cycle',origin,path:'/items',method:'GET',effect:'read',inputs:{},query:{},body:{},projection:['/items'],provenance:['a','b'],pagination:{parameter:'cursor',items:'/items',next:'/next',maxPages:5}};
    await expect(executeRead(manifest,{}, {origin,addresses:['127.0.0.1']})).rejects.toThrow('CONTRACT_MISMATCH');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('enforces final pagination output bytes as well as record count',async()=>{
  let calls=0;const server=createServer((_,res)=>{calls++;res.setHeader('content-type','application/json');res.end(JSON.stringify({items:[{large:'x'.repeat(20000)}],next:calls===1?'next':null}));});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {const manifest={schemaVersion:1,id:'large_pages',origin,path:'/items',method:'GET',effect:'read',inputs:{},query:{},body:{},projection:['/items'],provenance:['a','b'],pagination:{parameter:'cursor',items:'/items',next:'/next',maxPages:5}};
    await expect(executeRead(manifest,{}, {origin,addresses:['127.0.0.1']})).rejects.toThrow('BUDGET_EXCEEDED');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('never treats a write candidate as a read even if it uses GET-like projections',async()=>{
  const manifest={schemaVersion:1,id:'write',origin:'https://example.com',path:'/write',method:'POST',effect:'create',inputs:{},query:{},body:{},projection:['/id'],provenance:['a','b']};
  await expect(executeRead(manifest,{}, {origin:'https://example.com'})).rejects.toThrow('UNSUPPORTED_FEATURE');
});
