import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import http from 'node:http';
import {hostingConfig,hostingGuard} from '../server/hosting.js';

const cloud={GHOSTCOMMIT_HOSTED:'true',GHOSTCOMMIT_PUBLIC_URL:'https://ghost.example.com'};
test('public hosted startup requires an exact HTTPS origin without login credentials',()=>{
 assert.equal(hostingConfig({}).host,'127.0.0.1');
 assert.equal(hostingConfig(cloud).host,'0.0.0.0');
 for(const env of [{...cloud,GHOSTCOMMIT_PUBLIC_URL:''},{...cloud,GHOSTCOMMIT_PUBLIC_URL:'http://ghost.example.com'},{...cloud,GHOSTCOMMIT_PUBLIC_URL:'https://ghost.example.com/path'},{...cloud,PORT:'oops'}])assert.throws(()=>hostingConfig(env));
 const render=hostingConfig({RENDER:'true',RENDER_EXTERNAL_URL:'https://ghost.onrender.com'});
 assert.ok(render.hosts.has('ghost.onrender.com'));
});

test('public website and API work without passwords while cross-site and mutation checks remain enforced',async()=>{
 const app=express();app.use(hostingGuard(hostingConfig(cloud)));
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.get('/api/events',(_req,res)=>res.type('text/event-stream').send('data: {"type":"connected"}\n\n'));
 app.get('/api/session',(_req,res)=>res.json({token:'test-session'}));
 app.get('/settings',(_req,res)=>res.send('SPA'));
 app.post('/api/mutate',(req,res)=>req.headers['x-ghostcommit-token']==='test-session'?res.json({ok:true}):res.status(403).end());
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 // Node fetch may normalize Host. Exercise the real reverse-proxy Host using HTTP.
 const fetch=(url:string,options:{headers?:Record<string,string>;method?:string}={})=>new Promise<{status:number;headers:{get:(name:string)=>string|null}}>((resolve,reject)=>{
  const request=http.request(url,options,response=>{response.resume();response.on('end',()=>resolve({status:response.statusCode!,headers:{get:name=>{const value=response.headers[name.toLowerCase()];return Array.isArray(value)?value.join(','):value||null;}}}));});request.on('error',reject);request.end();
 });
 const headers={Host:'ghost.example.com'};
 try{
  assert.equal((await fetch(base+'/api/health')).status,200);
  for(const route of ['/api/session','/api/events','/settings']){
   const response=await fetch(base+route,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('www-authenticate'),null);
  }
  assert.equal((await fetch(base+'/api/session',{headers:{...headers,Authorization:'Basic '+Buffer.from('admin:old-password').toString('base64')}})).status,200,'cached browser credentials do not re-enable login');
  assert.equal((await fetch(base+'/api/session',{headers:{...headers,Host:'attacker.example'}})).status,403);
  assert.equal((await fetch(base+'/api/session',{headers:{...headers,Origin:'https://attacker.example'}})).status,403);
  assert.equal((await fetch(base+'/api/session',{headers:{...headers,'Sec-Fetch-Site':'cross-site'}})).status,403);
  const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
  assert.equal((await fetch(base+'/settings',{headers:{Host:headers.Host,...navigation}})).status,200,'external page links must open the SPA without login');
  assert.equal((await fetch(base+'/api/session',{headers:{...headers,...navigation}})).status,403,'document navigation must not expose API tokens');
  assert.equal((await fetch(base+'/api/events',{headers:{...headers,...navigation}})).status,403,'document navigation must not expose event streams');
  assert.equal((await fetch(base+'/settings',{headers:{...headers,...navigation,'Sec-Fetch-Dest':'iframe'}})).status,403);
  assert.equal((await fetch(base+'/settings',{headers:{...headers,...navigation,'Sec-Fetch-Mode':'cors'}})).status,403);
  assert.equal((await fetch(base+'/api/mutate',{method:'POST',headers:{...headers,...navigation,'X-GhostCommit-Token':'test-session'}})).status,403);
  assert.equal((await fetch(base+'/api/mutate',{method:'POST',headers:{...headers,Origin:cloud.GHOSTCOMMIT_PUBLIC_URL}})).status,403);
  assert.equal((await fetch(base+'/api/mutate',{method:'POST',headers:{...headers,Origin:cloud.GHOSTCOMMIT_PUBLIC_URL,'X-GhostCommit-Token':'test-session'}})).status,200);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
