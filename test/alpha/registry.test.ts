import { it, expect } from 'vitest';
import { WorkflowRegistry } from '../../src/app/registry.js';
import { ReviewStore } from '../../src/approval/review.js';
it('lists reviewed tools and blocks changed or unreviewed workflows', async () => {
  const review = new ReviewStore();
  const registry = new WorkflowRegistry(review);
  const manifest = { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', schemaVersion: 1, inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  expect(() => registry.register(manifest, { origin: 'https://example.com' })).toThrow('REVIEW_REQUIRED');
  await review.review(manifest, { interactive: true, ask: async () => 'review catalog' });
  registry.register(manifest, { origin: 'https://example.com' });
  expect(registry.list()).toEqual([expect.objectContaining({ id: 'catalog', effect: 'read', inputs: {} })]);
  await expect(registry.run('missing', {})).rejects.toThrow('REVIEW_REQUIRED');
});
it('does not expand the human browser scope when registering a workflow', async () => {
  const review = new ReviewStore();
  const registry = new WorkflowRegistry(review);
  const manifest = { id: 'other', origin: 'https://example.com', method: 'GET', path: '/private', effect: 'read', schemaVersion: 1, inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  await review.review(manifest, { interactive: true, ask: async () => 'review other' });
  expect(() => registry.register(manifest, { origin: 'https://example.com', paths: ['/catalog'] })).toThrow('REVIEW_REQUIRED');
});
it('enforces approved field names in addition to path scope', async () => {
  const review = new ReviewStore();
  const registry = new WorkflowRegistry(review);
  const manifest = { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', schemaVersion: 1, inputs: {}, query: { account: { source: 'literal', value: 'private' } }, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  await review.review(manifest, { interactive: true, ask: async () => 'review catalog' });
  expect(() => registry.register(manifest, { origin: 'https://example.com', paths: ['/catalog'], queryKeys: ['term'], bodyKeys: [] })).toThrow('REVIEW_REQUIRED');
});
it('rejects updates whose version preflight is not bound to the exact outgoing target', async () => {
  const review = new ReviewStore(); const registry = new WorkflowRegistry(review);
  const manifest = { schemaVersion: 1, id: 'bad_update', origin: 'https://example.com', path: '/books', method: 'PATCH', effect: 'update', inputs: { id: { type: 'string', maxLength: 50 }, other: { type: 'string', maxLength: 50 }, title: { type: 'string', maxLength: 50 } }, query: {}, body: { id: { source: 'input', name: 'other' }, title: { source: 'input', name: 'title' } }, projection: ['/id'], provenance: ['a','b'], mutation: { identity: { path: '/me', account: '/account', tenant: '/tenant' }, precondition: { path: '/before', idQuery: 'id', idInput: 'id', version: '/version' }, readback: { path: '/after', idQuery: 'id', resultId: '/id', recordId: '/id', account: '/account', tenant: '/tenant', version: '/version', fields: { title: '/title' } } } };
  await review.review(manifest, { interactive: true, ask: async () => 'review bad_update' });
  expect(() => registry.register(manifest, { origin: 'https://example.com' })).toThrow('REVIEW_REQUIRED');
});
it('describes reviewed tools with digest and output contract for agent pinning', async () => {
  const review=new ReviewStore();const registry=new WorkflowRegistry(review);
  const manifest={schemaVersion:1,id:'catalog',origin:'https://example.com',path:'/catalog',method:'GET',effect:'read',inputs:{},query:{},body:{},projection:['/items'],provenance:['a','b']};
  await review.review(manifest,{interactive:true,ask:async()=> 'review catalog'});registry.register(manifest,{origin:'https://example.com'});
  expect(registry.describe('catalog')).toMatchObject({id:'catalog',effect:'read',manifestDigest:expect.stringMatching(/^[a-f0-9]{64}$/),projection:['/items']});
});
it('refuses a write whose changed body fields are not all independently checked', async()=>{
  const reviews=new ReviewStore();const registry=new WorkflowRegistry(reviews);
  const manifest={schemaVersion:1,id:'partial_create',origin:'https://example.com',path:'/books',method:'POST',effect:'create',inputs:{},query:{},body:{title:{source:'literal',value:'new'},status:{source:'literal',value:'done'}},projection:['/id'],provenance:['a','b'],mutation:{identity:{path:'/me',account:'/account',tenant:'/tenant'},readback:{path:'/detail',idQuery:'id',resultId:'/id',recordId:'/id',account:'/account',tenant:'/tenant',fields:{title:'/title'}}}};
  await reviews.review(manifest,{interactive:true,ask:async()=> 'review partial_create'});
  expect(()=>registry.register(manifest,{origin:'https://example.com'})).toThrow('REVIEW_REQUIRED');
});
