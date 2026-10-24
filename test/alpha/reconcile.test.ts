import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DurableJournal } from '../../src/approval/journal.js';
import { WriteIntents } from '../../src/approval/intents.js';
it('can reconcile an unknown operation after restart using only independent reads', async () => {
  const dir=await mkdtemp(join(tmpdir(),'show2tool-reconcile-'));const path=join(dir,'journal.jsonl');let journal=await DurableJournal.open(path);
  try {
    const proposal={toolId:'add_book',manifestHash:'hash',principal:{account:'alice',tenant:'team'},request:{method:'POST',url:'https://example.com/books',body:'{}'}};
    let service=new WriteIntents(journal);const intent=service.prepare(proposal);await service.approve(intent.intentId,{interactive:true,ask:async()=>`approve ${intent.intentId}`});
    let effects=0;await service.execute(intent.intentId,proposal,async()=>{effects++;throw new Error('lost');},async()=>true);
    await journal.close();journal=await DurableJournal.open(path);service=new WriteIntents(journal);
    expect(await service.reconcile(intent.intentId,proposal,async()=>false)).toEqual({intentId:intent.intentId,state:'unknown'});
    expect(await service.reconcile(intent.intentId,proposal,async()=>true)).toEqual({intentId:intent.intentId,state:'confirmed'});
    expect(effects).toBe(1);expect(service.status(intent.intentId).state).toBe('confirmed');
  } finally {await journal.close();await rm(dir,{recursive:true,force:true});}
});
