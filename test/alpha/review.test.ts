import { it, expect } from 'vitest';
import { ReviewStore } from '../../src/approval/review.js';
it('requires human-reviewed hash before a read capability can execute', async () => {
  const store = new ReviewStore();
  const manifest = { id: 'catalog', origin: 'https://example.com', method: 'GET', path: '/catalog', effect: 'read', schemaVersion: 1, inputs: {}, query: {}, body: {}, projection: ['/items'], provenance: ['a', 'b'] };
  expect(() => store.require(manifest)).toThrow('REVIEW_REQUIRED');
  expect(await store.review(manifest, { interactive: false, ask: async () => 'review' })).toBe(false);
  expect(await store.review(manifest, { interactive: true, ask: async () => 'review catalog' })).toBe(true);
  expect(() => store.require(manifest)).not.toThrow();
  expect(() => store.require({ ...manifest, path: '/other' })).toThrow('REVIEW_REQUIRED');
});
it('requires a fresh grant if the candidate changes while the human is reviewing it',async()=>{
  const store=new ReviewStore();const candidate={schemaVersion:1,id:'catalog',origin:'https://example.com',path:'/catalog',method:'GET',effect:'read',inputs:{},query:{},body:{},projection:['/items'],provenance:['a','b']};
  await store.review(candidate,{interactive:true,ask:async()=>{candidate.path='/changed';return 'review catalog';}});
  expect(()=>store.require(candidate)).toThrow('REVIEW_REQUIRED');
});
