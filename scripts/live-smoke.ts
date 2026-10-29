/** Opt-in real Ollama check. Creates only labelled development fixtures; executes no imported scripts. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {git} from '../server/security.js';
const root=path.resolve('test-artifacts','live-ollama-'+Date.now()),fixture=path.join(root,'legacy-development-fixture');await fs.mkdir(fixture,{recursive:true});
const original='// TODO: modernize the string Buffer constructor\nconst message = new Buffer("hello");\nconsole.log(message.toString());\n';
await fs.writeFile(path.join(fixture,'index.js'),original);await fs.writeFile(path.join(fixture,'package.json'),JSON.stringify({name:'ghostcommit-development-fixture',version:'0.0.1',dependencies:{express:'4.16.0'}}));
await git(['init','--initial-branch=main'],fixture);await git(['add','.'],fixture);await git(['-c','user.name=GhostCommit fixture','-c','user.email=fixture@example.invalid','commit','-m','Intentionally legacy development fixture'],fixture);
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:'3112',GHOSTCOMMIT_DATA:path.join(root,'data'),GHOSTCOMMIT_LOCAL_ROOTS:root},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b.toString());child.stderr.on('data',b=>logs+=b.toString());let csrf='';
async function api(route:string,method='GET',body?:unknown){const res=await fetch('http://127.0.0.1:3112/api'+route,{method,headers:{'Content-Type':'application/json','X-GhostCommit-Token':csrf},body:body===undefined?undefined:JSON.stringify(body)});const value=await res.json();if(!res.ok)throw new Error(value.error);return value;}
async function waitRepo(id:string){let lastStage='';for(let i=0;i<1800;i++){const repo=await api('/repositories/'+id);if(repo.stage!==lastStage){console.log(repo.stage);lastStage=repo.stage;}if(repo.status!=='working'){if(repo.error)throw new Error(repo.error);return repo;}await new Promise(r=>setTimeout(r,500));}throw new Error('Live workflow timed out.');}
try{
for(let i=0;i<100;i++){try{await api('/health');break;}catch{if(child.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,150));}}
csrf=(await api('/session')).token;const config=await api('/settings'),status=await api('/ollama/status');assert.ok(status.connected,status.error);assert.ok(status.models.length,'Install an Ollama model first.');
const model=process.env.GHOSTCOMMIT_TEST_MODEL||[...status.models].sort((a,b)=>a.size-b.size)[0].name;await api('/settings','PUT',{...config,provider:'ollama',model,contextSize:4096,timeout:600,cpuOnly:process.env.GHOSTCOMMIT_CPU_ONLY==='1'});console.log('Real Ollama model: '+model);
const local=await api('/local-repositories');const imported=await api('/repositories/import','POST',{localId:local.find((r:{name:string})=>r.name==='legacy-development-fixture').id});let repo=await waitRepo(imported.id);assert.ok(repo.files.some((f:{path:string;parseErrors:number})=>f.path==='index.js'&&f.parseErrors===0));
await api(`/repositories/${repo.id}/analyze`,'POST');repo=await waitRepo(repo.id);assert.ok(repo.analysis?.overview);console.log('Real AI analysis complete.');
await api(`/repositories/${repo.id}/plan`,'POST');repo=await waitRepo(repo.id);assert.ok(repo.plan.length);console.log('Real resurrection plan complete.');
await api('/patches/generate','POST',{repositoryId:repo.id,file:'index.js',instruction:'Replace new Buffer("hello") with Buffer.from("hello"). Preserve all other lines exactly. Return the exact original and complete proposed content.'});repo=await waitRepo(repo.id);const patch=(await api('/patches'))[0];assert.ok(patch);assert.match(patch.proposed,/Buffer\.from/);await api(`/patches/${patch.id}/approve`,'POST');const applied=await api(`/patches/${patch.id}/apply`,'POST');assert.equal(await fs.readFile(path.join(fixture,'index.js'),'utf8'),original);assert.equal(await fs.readFile(path.join(applied.appliedPath,'index.js'),'utf8'),patch.proposed);
const report=await api(`/repositories/${repo.id}/report`);await fs.writeFile(path.join(root,'verification-report.json'),JSON.stringify(report,null,2));console.log('PASS: real Git import → Tree-sitter → Ollama analysis → plan → patch → approval → separate working copy.');console.log('Imported project tests: NOT RUN. Report: '+path.join(root,'verification-report.json'));
}finally{if(child.exitCode===null){child.kill();await once(child,'exit').catch(()=>{});}}
