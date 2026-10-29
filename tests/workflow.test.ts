/** Contract integration test. Inference is an explicitly labelled test fixture, never a production fallback. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
import {git} from '../server/security.js';
test('real Git, SQLite, scanner, streaming validation, approval and isolated copy workflow', {timeout:90000},async()=>{
 await fs.mkdir('test-artifacts',{recursive:true});const root=await fs.mkdtemp(path.resolve('test-artifacts','workflow-')),fixture=path.join(root,'legacy-fixture');await fs.mkdir(fixture);
 const original='// TODO: replace deprecated Buffer constructor\nconst value = new Buffer("hello");\nconsole.log(value);\n';const proposed='// Use the explicit string constructor.\nconst value = Buffer.from("hello");\nconsole.log(value);\n';
 await fs.writeFile(path.join(fixture,'index.js'),original);await fs.writeFile(path.join(fixture,'package.json'),JSON.stringify({name:'legacy-fixture',version:'0.1.0',dependencies:{express:'4.0.0'}}));await fs.writeFile(path.join(fixture,'.env'),'PRIVATE_SECRET=excluded');await fs.mkdir(path.join(fixture,'.github','workflows'),{recursive:true});await fs.writeFile(path.join(fixture,'.github','workflows','ci.yml'),'name: inspection\n');
 await git(['init','--initial-branch=main'],fixture);await git(['add','.'],fixture);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Test fixture only'],fixture);
 let inferenceCalls=0;
 const ollama=http.createServer(async(req,res)=>{
 if(req.url==='/api/tags'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({models:[{name:'test-fixture-only',size:1}]}));}
 if(req.url==='/api/show')return res.end(JSON.stringify({model_info:{'fixture.context_length':8192}}));
 let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);inferenceCalls++;
 assert.ok(request.prompt.includes('index.js'));assert.equal(request.model,'test-fixture-only');assert.match(request.system,/UNTRUSTED DATA/);
 let output:unknown;
 if(request.prompt.startsWith('Explain'))output={overview:'TEST FIXTURE: a script prints a buffer.',architecture:'TEST FIXTURE: single JavaScript entry.',recommendations:['Review Buffer construction.'],findings:[{file:'index.js',line:2,severity:'medium',title:'Buffer constructor review',description:'Verify the deprecated constructor.',evidence:'new Buffer("hello")'},{file:'invented.js',line:1,severity:'high',title:'Invented issue',description:'Must be rejected',evidence:'missing evidence'}]};
 else if(request.prompt.startsWith('Create'))output={tasks:[{title:'Use explicit Buffer construction',description:'Replace new Buffer with Buffer.from for the string.',priority:'medium',files:['index.js'],expectedImprovement:'Clear construction semantics',risk:'Check runtime compatibility',verification:'Review diff; tests not run'}]};
 else output={file:'index.js',original,proposed,explanation:'TEST FIXTURE: replace deprecated string constructor.'};
 const text=JSON.stringify(output);res.setHeader('Content-Type','application/x-ndjson');for(let n=0;n<text.length;n+=24)res.write(JSON.stringify({response:text.slice(n,n+24),done:false})+'\n');res.end(JSON.stringify({response:'',done:true})+'\n');
 });ollama.listen(0,'127.0.0.1');await once(ollama,'listening');const ollamaPort=(ollama.address() as {port:number}).port;
 const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:'3111',GHOSTCOMMIT_DATA:path.join(root,'data'),GHOSTCOMMIT_LOCAL_ROOTS:root},windowsHide:true,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b.toString());child.stderr.on('data',b=>logs+=b.toString());
 const base='http://127.0.0.1:3111/api';let csrf='';
 async function request(route:string,method='GET',body?:unknown){const res=await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-GhostCommit-Token':csrf},body:body===undefined?undefined:JSON.stringify(body)});const result=await res.json();if(!res.ok)throw new Error(`${res.status}: ${result.error}`);return result;}
 async function until<T>(work:()=>Promise<T>,accept:(value:T)=>boolean){for(let i=0;i<180;i++){const v=await work();if(accept(v))return v;await new Promise(r=>setTimeout(r,150));}throw new Error('Timed out waiting for operation. '+logs);}
 try{
 for(let i=0;i<100;i++){try{await request('/health');break;}catch{if(child.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,150));}}
 csrf=(await request('/session')).token;
 assert.equal((await fetch(base+'/repositories/import',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/repositories',{headers:{Origin:'https://untrusted.example'}})).status,403);
 const config=await request('/settings');await request('/settings','PUT',{...config,provider:'ollama',endpoint:`http://127.0.0.1:${ollamaPort}`,model:'test-fixture-only'});
 await assert.rejects(request('/repositories/import','POST',{url:'file:///etc/passwd'}),/400/);
 const local=await request('/local-repositories');const candidate=local.find((r:{name:string})=>r.name==='legacy-fixture');assert.ok(candidate);
 const imported=await request('/repositories/import','POST',{localId:candidate.id});let repo=await until(()=>request('/repositories/'+imported.id),r=>r.status!=='working');assert.equal(repo.status,'ready',JSON.stringify(repo));assert.equal(repo.dependencies,1);assert.ok(repo.files.some((f:{path:string;parseErrors?:number})=>f.path==='index.js'&&f.parseErrors===0));assert.ok(!repo.files.some((f:{path:string})=>f.path==='.env'));assert.ok(repo.files.some((f:{path:string})=>f.path==='.github/workflows/ci.yml'));assert.ok(!repo.findings.some((f:{title:string})=>f.title==='No CI configuration detected'));
 const source=await request(`/repositories/${repo.id}/files?path=index.js`);assert.equal(source.content,original);
 await assert.rejects(request(`/repositories/${repo.id}/files?path=..%2F..%2Fpackage.json`),/400/);
 await request(`/repositories/${repo.id}/analyze`,'POST');repo=await until(()=>request('/repositories/'+repo.id),r=>r.status!=='working');assert.ok(repo.analysis,JSON.stringify(repo));assert.equal(repo.operation,'analysis');assert.ok(repo.operationStartedAt);assert.ok(repo.operationCompletedAt);assert.equal(repo.findings.filter((f:{source:string})=>f.source==='ai').length,1);assert.ok(repo.warnings.some((w:string)=>w.includes('unsupported evidence')));
 await request(`/repositories/${repo.id}/plan`,'POST');repo=await until(()=>request('/repositories/'+repo.id),r=>r.status!=='working');assert.equal(repo.plan.length,1,JSON.stringify(repo));
 await request('/patches/generate','POST',{repositoryId:repo.id,file:'index.js',taskId:repo.plan[0].id,instruction:repo.plan[0].description});repo=await until(()=>request('/repositories/'+repo.id),r=>r.status!=='working');const patches=await request('/patches');assert.equal(patches.length,1,JSON.stringify(repo));const patch=patches[0];assert.match(patch.diff,/Buffer\.from/);assert.equal(patch.status,'awaiting_review');
 await assert.rejects(request('/patches/'+patch.id+'/apply','POST'),/409/);await request('/patches/'+patch.id+'/approve','POST');const applied=await request('/patches/'+patch.id+'/apply','POST');assert.equal(applied.status,'applied');assert.equal(await fs.readFile(path.join(applied.appliedPath,'index.js'),'utf8'),proposed);assert.equal(await fs.readFile(path.join(fixture,'index.js'),'utf8'),original);assert.equal((await request(`/repositories/${repo.id}/files?path=index.js`)).content,original);
 await assert.rejects(request(`/repositories/${repo.id}/tests`,'POST'),/409/);assert.equal((await request(`/repositories/${repo.id}/tests`))[0].status,'not_run');const report=await request(`/repositories/${repo.id}/report`);assert.equal(report.testStatus,'not_run');assert.equal(inferenceCalls,3);
 await request('/repositories/'+repo.id,'DELETE');assert.equal((await request('/repositories')).length,0);
 }finally{if(child.exitCode===null){child.kill();await once(child,'exit').catch(()=>{});}ollama.closeAllConnections();await new Promise<void>(r=>ollama.close(()=>r()));await fs.rm(root,{recursive:true,force:true});}
});
