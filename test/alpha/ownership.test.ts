import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOwnership } from '../../src/broker/ownership.js';
it('locks the state directory before a browser can open and releases explicitly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-lock-'));
  try {
    const owner = await acquireOwnership(dir);
    await expect(acquireOwnership(dir)).rejects.toThrow('BROKER_ALREADY_RUNNING');
    await owner.release();
    const next = await acquireOwnership(dir);
    await next.release();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('recovers only a demonstrably dead owner and never steals a live lock', async () => {
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'show2tool-dead-owner-'));
  try {
    await writeFile(join(dir, 'owner.lock'), JSON.stringify({ pid: 2147483647, token: 'dead-owner' }));
    const next = await acquireOwnership(dir);
    await expect(acquireOwnership(dir)).rejects.toThrow('BROKER_ALREADY_RUNNING');
    await next.release();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it('does not remain blocked by empty metadata or an orphaned recovery marker',async()=>{
  const {writeFile}=await import('node:fs/promises');const dir=await mkdtemp(join(tmpdir(),'show2tool-orphan-lock-'));
  try{await writeFile(join(dir,'owner.lock'),'');await writeFile(join(dir,'recovery.lock'),'');const owner=await acquireOwnership(dir);await owner.release();}
  finally{await rm(dir,{recursive:true,force:true});}
});
it('releases OS ownership after actual process death so durable status can reopen',async()=>{
  const {spawn}=await import('node:child_process');const dir=await mkdtemp(join(tmpdir(),'show2tool-owner-crash-'));
  const script="const m=await import(process.argv[1]);await m.acquireOwnership(process.argv[2]);process.stdout.write('owned');setInterval(()=>{},1000);";
  const {pathToFileURL}=await import('node:url');const child=spawn(process.execPath,['--input-type=module','-e',script,pathToFileURL(join(process.cwd(),'dist/src/broker/ownership.js')).href,dir],{stdio:['ignore','pipe','pipe']});
  try{await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('owner not ready')),5000);child.once('exit',()=>{clearTimeout(timer);reject(new Error('early exit'));});child.stdout.once('data',()=>{clearTimeout(timer);resolve();});});
    const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await exited;
    const owner=await acquireOwnership(dir);await owner.release();
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();await rm(dir,{recursive:true,force:true});}
});
