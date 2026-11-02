import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { reconciliationFixture } from '../fixtures/reconciliation.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const cli=join(root,'tools/reconcile/cli.mjs'); const guard=fileURLToPath(new URL('./guard.mjs',import.meta.url));
const args=(path)=>['--input',path,'--orphan-source','PRIVATE_OLD_SENTINEL','--current-source','PRIVATE_CURRENT_SENTINEL'];
const run=(argv,guarded=true)=>spawnSync(process.execPath,[...(guarded?['--import',guard]:[]),cli,...argv],{cwd:root,encoding:'utf8',timeout:20000,env:{...process.env,NODE_OPTIONS:'',NODE_V8_COVERAGE:'',NODE_COMPILE_CACHE:''},maxBuffer:100000});
async function setup(body=JSON.stringify(reconciliationFixture())) {
  const dir=await mkdtemp(join(tmpdir(),'synthetic-finpath-cli-'));const path=join(dir,'PRIVATE_FILENAME_SENTINEL.json');await writeFile(path,body);return {dir,path};
}
const privatePattern=/PRIVATE_|2026-|8765432|10000|CAD|SyntaxError|Error:|node:|file:\/\//;

test('CLI: guarded offline run emits only aggregates and does not change input bytes, mtime or directory files',async()=>{
  const {dir,path}=await setup();try{
    const before=await readFile(path);const info=await stat(path);const files=await readdir(dir);
    const result=run(args(path));assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,'');assert.doesNotMatch(result.stdout,privatePattern);
    const report=JSON.parse(result.stdout);const normal=run(args(path),false);assert.equal(normal.status,0,normal.stderr);assert.deepEqual(JSON.parse(normal.stdout),report);assert.equal(report.comparison.uniqueOneToOneValuePairs,22);assert.equal(report.counts.allSavedExpenseEntries,2);
    assert.deepEqual(await readFile(path),before);assert.equal((await stat(path)).mtimeMs,info.mtimeMs);assert.deepEqual(await readdir(dir),files);
    const walk=(v)=>{if(v && typeof v==='object')for(const x of Object.values(v))walk(x);else assert.ok(typeof v==='number'||typeof v==='boolean'||v===null||(typeof v==='string'&&/^[A-Z_]+$/.test(v)));};walk(report);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI: syntax, missing input, malformed JSON and unsupported data fail with fixed safe errors/exit codes',async()=>{
  const {dir,path}=await setup('{PRIVATE_BAD_JSON');try{
    for(const [argv,code] of [[['--dump','PRIVATE_TOKEN'],2],[['--input','PRIVATE_TOKEN'],2],[args(join(dir,'PRIVATE_MISSING')),3],[args(path),3],[args('https://PRIVATE_TOKEN'),3],[args('\\\\PRIVATE_SERVER\\backup.json'),3]]){
      const r=run(argv);assert.equal(r.status,code,r.stderr);assert.equal(r.stdout,'');assert.doesNotMatch(r.stderr,privatePattern);assert.ok(r.stderr.length<150);
    }
    await writeFile(path,JSON.stringify({data:{PRIVATE_KEY:'PRIVATE_VALUE'}}));const r=run(args(path));assert.equal(r.status,4);assert.doesNotMatch(r.stderr,privatePattern);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI: help is static; output/dump flags, repeated options and overlapping cohorts cannot leak records',()=>{
  const help=run(['--help']);assert.equal(help.status,0);assert.equal(help.stderr,'');
  for(const tail of [['--output','PRIVATE_OUT'],['--verbose','PRIVATE_VALUE'],['--input','PRIVATE_OTHER'],['--current-source','PRIVATE_OLD_SENTINEL']]){
    const r=run([...args('PRIVATE_MISSING'),...tail]);assert.notEqual(r.status,0);assert.doesNotMatch(r.stdout+r.stderr,privatePattern);
  }
});
test('CLI: BOM and alias backups are read without normalization; safe analysis failure leaves input untouched',async()=>{
  const f=reconciliationFixture();f.data.planner={entries:f.data.plannerEntries};delete f.data.plannerEntries;
  const {dir,path}=await setup('\uFEFF'+JSON.stringify(f));try{
    const before=await readFile(path);assert.equal(run(args(path)).status,0);
    const r=run([...args(path),'--from','PRIVATE_DATE']);assert.equal(r.status,4);assert.doesNotMatch(r.stderr,privatePattern);assert.deepEqual(await readFile(path),before);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI security guard tripwires reject attempted file writes and network access',()=>{
  for(const script of ["import fs from 'node:fs';fs.writeFileSync('ignored','ignored')","await fetch('https://example.invalid')","import net from 'node:net';net.connect(1)"]){
    const r=spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,NODE_OPTIONS:'',NODE_V8_COVERAGE:'',NODE_COMPILE_CACHE:''}});assert.notEqual(r.status,0);assert.match(r.stderr,/GUARD_DENIED/);
  }
});

test('CLI: rejects directory, symbolic link and oversized input with safe errors',async()=>{
  const {dir,path}=await setup();try{
    assert.equal(run(args(dir)).status,3);
    const {symlink,truncate}=await import('node:fs/promises');const linked=join(dir,'PRIVATE_LINK');
    await symlink(path,linked);const linkResult=run(args(linked));assert.equal(linkResult.status,3);assert.doesNotMatch(linkResult.stderr,privatePattern);
    await truncate(path,16*1024*1024+1);const r=run(args(path));assert.equal(r.status,3);assert.doesNotMatch(r.stderr,privatePattern);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI: mixed schema errors and terminal-control strings cannot reach output',async()=>{
  const f=reconciliationFixture();f.data.plannerEntries['PRIVATE_OLD_SENTINEL__2026-01-02'].notes='\u001b[31mPRIVATE_SECRET\n';
  const {dir,path}=await setup(JSON.stringify(f));try{
    const good=run(args(path));assert.equal(good.status,0);assert.ok(!good.stdout.includes(String.fromCharCode(27)));assert.doesNotMatch(good.stdout,/PRIVATE_|\\u001b/);
    f.data.planner={entries:{PRIVATE_CONFLICT:{}}};await writeFile(path,JSON.stringify(f));const bad=run(args(path));assert.equal(bad.status,4);assert.equal(bad.stdout,'');assert.doesNotMatch(bad.stderr,privatePattern);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI: raw numeric over-precision is invalid, not rounded into an equal-amount match',async()=>{
  const raw=JSON.stringify(reconciliationFixture()).replace('"actualAmount":100','"actualAmount":100.0000000000000000001');
  const {dir,path}=await setup(raw);try{
    const r=run(args(path));assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.counts.invalidEntries,1);assert.equal(report.comparison.candidateEdges,21);assert.doesNotMatch(r.stdout+r.stderr,privatePattern);assert.equal(await readFile(path,'utf8'),raw);
  }finally{await rm(dir,{recursive:true,force:true});}
});
