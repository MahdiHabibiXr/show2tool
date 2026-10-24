import { it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
it('refuses to grant scope from a noninteractive process', async () => {
  const error = await promisify(execFile)(process.execPath, ['dist/src/cli.js', 'host', 'SECRET_PATH']).catch(error => error);
  expect(error.code).toBe(3);
  expect(JSON.parse(error.stdout)).toMatchObject({ ok: false, error: { code: 'REVIEW_REQUIRED' } });
  expect(error.stdout + error.stderr).not.toContain('SECRET_PATH');
});
it('treats imported bundles as definitions requiring local human review', async()=>{
  const { exportBundle }=await import('../../src/workflow/bundle.js');const { handle }=await import('../../src/app/handlers.js');
  const manifest={schemaVersion:1,id:'catalog',origin:'https://example.com',method:'GET',path:'/catalog',effect:'read',inputs:{},query:{},body:{},projection:['/items'],provenance:['a','b']};
  expect(await handle({command:'import_bundle',bundle:exportBundle([manifest])})).toMatchObject({ok:true,data:{reviewRequired:true}});
});
it('does not allow a piped process to activate write approval',async()=>{
  const {execFile}=await import('node:child_process');const{promisify}=await import('node:util');
  const error=await promisify(execFile)(process.execPath,['dist/src/cli.js','call',JSON.stringify({command:'approve',intentId:'11111111-1111-4111-8111-111111111111'})]).catch(error=>error);
  expect(error.code).toBe(2);expect(JSON.parse(error.stdout)).toMatchObject({ok:false,error:{code:'INVALID_INPUT'}});
});
