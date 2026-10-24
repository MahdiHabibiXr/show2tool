import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReviewStore } from '../../src/approval/review.js';
import { DurableJournal } from '../../src/approval/journal.js';
import { WriteIntents } from '../../src/approval/intents.js';
import { WorkflowRegistry } from '../../src/app/registry.js';

it('prepares a reviewed create without effects and executes once after exact human approval', async () => {
  let writes = 0; let title = ''; let account = 'alice';
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/me') { res.end(JSON.stringify({ account, tenant: 'team' })); return; }
    if (req.url === '/csrf') { res.end('{"token":"TRANSIENT_CSRF_CANARY"}'); return; }
    if (req.method === 'POST' && req.url === '/books') {
      if (req.headers['x-csrf-token'] !== 'TRANSIENT_CSRF_CANARY') { res.statusCode = 403; res.end('{}'); return; }
      let body = ''; for await (const part of req) body += part;
      title = JSON.parse(body).title; writes++; res.end('{"id":"book-1"}'); return;
    }
    if (req.url === '/books/detail?id=book-1') { res.end(JSON.stringify({ id: 'book-1', title, account: 'alice', tenant: 'team' })); return; }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-write-runtime-'));
  const journal = await DurableJournal.open(join(dir, 'journal.jsonl'));
  try {
    const reviews = new ReviewStore(); const intents = new WriteIntents(journal);
    const registry = new WorkflowRegistry(reviews, undefined, intents);
    const manifest = {
      schemaVersion: 1, id: 'add_book', origin, path: '/books', method: 'POST', effect: 'create',
      inputs: { title: { type: 'string', maxLength: 100 } }, query: {}, body: { title: { source: 'input', name: 'title' } }, projection: ['/id'], provenance: ['a', 'b'],
      mutation: {
        csrf: { path: '/csrf', value: '/token', header: 'x-csrf-token' },
        identity: { path: '/me', account: '/account', tenant: '/tenant' },
        readback: { path: '/books/detail', idQuery: 'id', resultId: '/id', recordId: '/id', account: '/account', tenant: '/tenant', fields: { title: '/title' } },
      },
    };
    expect(await reviews.review(manifest, { interactive: true, ask: async () => 'review add_book' })).toBe(true);
    registry.register(manifest, { origin, addresses: ['127.0.0.1'], paths: ['/books', '/me', '/books/detail', '/csrf'], queryKeys: ['id'], bodyKeys: ['title'] });
    const pending = await registry.prepareWrite('add_book', { title: 'new title' });
    expect(writes).toBe(0);
    await expect(registry.executeWrite(pending.intentId)).rejects.toThrow('APPROVAL_REQUIRED');
    await intents.approve(pending.intentId, { interactive: true, ask: async () => `approve ${pending.intentId}` });
    expect(await registry.executeWrite(pending.intentId)).toMatchObject({ state: 'confirmed' });
    expect(writes).toBe(1);
    await expect(registry.executeWrite(pending.intentId)).rejects.toThrow('APPROVAL_REQUIRED');
    expect(writes).toBe(1);
    const changed = await registry.prepareWrite('add_book', { title: 'another title' });
    await intents.approve(changed.intentId, { interactive: true, ask: async () => `approve ${changed.intentId}` });
    account = 'bob';
    await expect(registry.executeWrite(changed.intentId)).rejects.toThrow('INTENT_CHANGED');
    expect(writes).toBe(1);
  } finally { await journal.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
it('updates only the approved target and requires version advancement on readback', async () => {
  let writes = 0; let version = 1; let title = 'before'; let badTarget = false;
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/me') { res.end('{"account":"alice","tenant":"team"}'); return; }
    if (req.method === 'PATCH') {
      if (req.headers['if-match'] !== String(version)) { res.statusCode = 412; res.end('{}'); return; }
      let body = ''; for await (const chunk of req) body += chunk;
      title = JSON.parse(body).title; version++; writes++; res.end(JSON.stringify({ id: badTarget ? 'book-2' : 'book-1' })); return;
    }
    res.end(JSON.stringify({ id: new URL(req.url!, 'http://local').searchParams.get('id'), account: 'alice', tenant: 'team', title, version }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-updates-')); const journal = await DurableJournal.open(join(dir, 'journal.jsonl'));
  try {
    const reviews = new ReviewStore(); const intents = new WriteIntents(journal); const registry = new WorkflowRegistry(reviews, undefined, intents);
    const manifest = { schemaVersion: 1, id: 'update_book', origin, path: '/books', method: 'PATCH', effect: 'update', inputs: { id: { type: 'string', maxLength: 50 }, title: { type: 'string', maxLength: 100 } }, query: { id: { source: 'input', name: 'id' } }, body: { title: { source: 'input', name: 'title' } }, projection: ['/id'], provenance: ['a', 'b'], mutation: { identity: { path: '/me', account: '/account', tenant: '/tenant' }, precondition: { path: '/books/detail', idQuery: 'id', idInput: 'id', version: '/version' }, readback: { path: '/books/detail', idQuery: 'id', resultId: '/id', recordId: '/id', account: '/account', tenant: '/tenant', version: '/version', fields: { title: '/title' } } } };
    expect(await reviews.review(manifest, { interactive: true, ask: async () => 'review update_book' })).toBe(true);
    registry.register(manifest, { origin, addresses: ['127.0.0.1'], paths: ['/books', '/books/detail', '/me'], queryKeys: ['id'], bodyKeys: ['title'] });
    const pending = await registry.prepareWrite('update_book', { id: 'book-1', title: 'after' });
    await intents.approve(pending.intentId, { interactive: true, ask: async () => `approve ${pending.intentId}` });
    expect(await registry.executeWrite(pending.intentId)).toMatchObject({ state: 'confirmed' });
    expect(writes).toBe(1); expect(version).toBe(2);
    const wrong = await registry.prepareWrite('update_book', { id: 'book-1', title: 'different' });
    await intents.approve(wrong.intentId, { interactive: true, ask: async () => `approve ${wrong.intentId}` });
    badTarget = true;
    expect(await registry.executeWrite(wrong.intentId)).toMatchObject({ state: 'unknown' });
  } finally { await journal.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
it('freezes credentials for identity, mutation and readback instead of switching accounts mid-operation', async () => {
  let live = 'alice'; let identityCalls = 0; let writtenAs = '';
  const server = createServer(async (req,res) => {
    res.setHeader('content-type','application/json');
    const account = req.headers.cookie === 'session=alice' ? 'alice' : 'bob';
    if(req.url === '/me') { identityCalls++; if(identityCalls === 2) live='bob'; res.end(JSON.stringify({account,tenant:'team'})); return; }
    if(req.method === 'POST') { for await (const _ of req) {} writtenAs=account; res.end('{"id":"book-1"}'); return; }
    res.end(JSON.stringify({id:'book-1',account,tenant:'team',title:'safe'}));
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const dir=await mkdtemp(join(tmpdir(),'show2tool-session-snapshot-')); const journal=await DurableJournal.open(join(dir,'journal.jsonl'));
  try {
    const reviews=new ReviewStore();const intents=new WriteIntents(journal);const registry=new WorkflowRegistry(reviews,async()=>({cookie:`session=${live}`}),intents);
    const manifest={schemaVersion:1,id:'snapshot_create',origin,path:'/books',method:'POST',effect:'create',inputs:{title:{type:'string',maxLength:100}},query:{},body:{title:{source:'input',name:'title'}},projection:['/id'],provenance:['a','b'],mutation:{identity:{path:'/me',account:'/account',tenant:'/tenant'},readback:{path:'/after',idQuery:'id',resultId:'/id',recordId:'/id',account:'/account',tenant:'/tenant',fields:{title:'/title'}}}};
    await reviews.review(manifest,{interactive:true,ask:async()=> 'review snapshot_create'});registry.register(manifest,{origin,addresses:['127.0.0.1']});
    const intent=await registry.prepareWrite('snapshot_create',{title:'safe'});await intents.approve(intent.intentId,{interactive:true,ask:async()=>`approve ${intent.intentId}`});
    expect(await registry.executeWrite(intent.intentId)).toMatchObject({state:'confirmed'});expect(writtenAs).toBe('alice');
  } finally {await journal.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
it('refuses unapproved generic run calls for mutation workflows', async () => {
  const reviews=new ReviewStore();const registry=new WorkflowRegistry(reviews);
  await expect(registry.prepareWrite('unknown',{})).rejects.toThrow('UNSUPPORTED_FEATURE');
});
it('keeps lost acknowledgments unknown and supports a separate read-only reconciliation', async () => {
  let writes=0;let title='';
  const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/me'){res.end('{"account":"alice","tenant":"team"}');return;}if(req.method==='POST'){let body='';for await(const part of req)body+=part;title=JSON.parse(body).title;writes++;req.socket.destroy();return;}res.end(JSON.stringify({id:'book-1',account:'alice',tenant:'team',title}));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const dir=await mkdtemp(join(tmpdir(),'show2tool-real-reconcile-'));const journal=await DurableJournal.open(join(dir,'journal.jsonl'));
  try{const reviews=new ReviewStore();const intents=new WriteIntents(journal);const registry=new WorkflowRegistry(reviews,undefined,intents);
    const manifest={schemaVersion:1,id:'reconcile_book',origin,path:'/books',method:'POST',effect:'create',inputs:{title:{type:'string',maxLength:100}},query:{},body:{title:{source:'input',name:'title'}},projection:['/id'],provenance:['a','b'],mutation:{identity:{path:'/me',account:'/account',tenant:'/tenant'},readback:{path:'/detail',idQuery:'id',resultId:'/id',recordId:'/id',account:'/account',tenant:'/tenant',fields:{title:'/title'}}}};
    await reviews.review(manifest,{interactive:true,ask:async()=> 'review reconcile_book'});registry.register(manifest,{origin,addresses:['127.0.0.1']});
    const intent=await registry.prepareWrite('reconcile_book',{title:'once'});await intents.approve(intent.intentId,{interactive:true,ask:async()=>`approve ${intent.intentId}`});
    expect((await registry.executeWrite(intent.intentId)).state).toBe('unknown');expect(writes).toBe(1);
    expect(await registry.reconcileWrite(intent.intentId,'book-1')).toMatchObject({state:'confirmed'});expect(writes).toBe(1);
  }finally{await journal.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
it('enforces mutation body field scope in the transport even if called outside the registry', async () => {
  const { requestJson }=await import('../../src/runtime/transport.js');
  const server=createServer((_,res)=>{res.setHeader('content-type','application/json');res.end('{}');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {await expect(requestJson(new URL(origin+'/books'),{origin,addresses:['127.0.0.1'],bodyKeys:['title']},{},{method:'POST',body:'{"forbidden":"x"}'})).rejects.toThrow('REVIEW_REQUIRED');}
  finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('does not forward write-path cookies to identity or readback paths', async()=>{
  const seen:Record<string,string|undefined>={};let writes=0;
  const server=createServer(async(req,res)=>{seen[req.url!]=req.headers.cookie;res.setHeader('content-type','application/json');if(req.url==='/me'){res.end('{"account":"alice","tenant":"team"}');return;}if(req.method==='POST'){for await(const _ of req){}writes++;res.end('{"id":"x"}');return;}res.end('{"id":"x","account":"alice","tenant":"team","title":"safe"}');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const dir=await mkdtemp(join(tmpdir(),'show2tool-path-cookie-'));const journal=await DurableJournal.open(join(dir,'journal.jsonl'));
  try{const reviews=new ReviewStore();const intents=new WriteIntents(journal);const registry=new WorkflowRegistry(reviews,async (url):Promise<Record<string,string>>=>new URL(url).pathname==='/write'?{cookie:'private_write=canary'}:{},intents);
    const manifest={schemaVersion:1,id:'path_create',origin,path:'/write',method:'POST',effect:'create',inputs:{},query:{},body:{title:{source:'literal',value:'safe'}},projection:['/id'],provenance:['a','b'],mutation:{identity:{path:'/me',account:'/account',tenant:'/tenant'},readback:{path:'/read',idQuery:'id',resultId:'/id',recordId:'/id',account:'/account',tenant:'/tenant',fields:{title:'/title'}}}};
    await reviews.review(manifest,{interactive:true,ask:async()=> 'review path_create'});registry.register(manifest,{origin,addresses:['127.0.0.1']});await expect(registry.prepareWrite('path_create',{})).rejects.toThrow('UNSUPPORTED_AUTH');
    expect(seen['/me']).toBeUndefined();expect(seen['/read?id=x']).toBeUndefined();expect(seen['/write']).toBeUndefined();expect(writes).toBe(0);
  }finally{await journal.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
it('reconciles a lost acknowledgment after registry restart using exact digest-checked recovery inputs',async()=>{
  let title='';let writes=0;const server=createServer(async(req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/me'){res.end('{"account":"alice","tenant":"team"}');return;}if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;title=JSON.parse(body).title;writes++;req.socket.destroy();return;}res.end(JSON.stringify({id:'recovered',account:'alice',tenant:'team',title}));});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const dir=await mkdtemp(join(tmpdir(),'show2tool-registry-restart-'));const file=join(dir,'journal.jsonl');let journal=await DurableJournal.open(file);
  try {const manifest={schemaVersion:1,id:'recover_book',origin,path:'/books',method:'POST',effect:'create',inputs:{title:{type:'string',maxLength:100}},query:{},body:{title:{source:'input',name:'title'}},projection:['/id'],provenance:['a','b'],mutation:{identity:{path:'/me',account:'/account',tenant:'/tenant'},readback:{path:'/read',idQuery:'id',resultId:'/id',recordId:'/id',account:'/account',tenant:'/tenant',fields:{title:'/title'}}}};
    const reviews=new ReviewStore();await reviews.review(manifest,{interactive:true,ask:async()=> 'review recover_book'});let registry=new WorkflowRegistry(reviews,undefined,new WriteIntents(journal));registry.register(manifest,{origin,addresses:['127.0.0.1']});
    const intent=await registry.prepareWrite('recover_book',{title:'once'});
    // Approval stays outside the registry's agent API.
    const service=(registry as unknown as {intents:WriteIntents}).intents;await service.approve(intent.intentId,{interactive:true,ask:async()=>`approve ${intent.intentId}`});expect((await registry.executeWrite(intent.intentId)).state).toBe('unknown');
    await journal.close();journal=await DurableJournal.open(file);registry=new WorkflowRegistry(reviews,undefined,new WriteIntents(journal));registry.register(manifest,{origin,addresses:['127.0.0.1']});
    await expect(registry.reconcileWrite(intent.intentId,'recovered',{id:'recover_book',inputs:{title:'tampered'}})).rejects.toThrow('INTENT_CHANGED');
    expect(await registry.reconcileWrite(intent.intentId,'recovered',{id:'recover_book',inputs:{title:'once'}})).toMatchObject({state:'confirmed'});expect(writes).toBe(1);
  }finally{await journal.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
