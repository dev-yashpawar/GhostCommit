import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AnalysisPanel} from '../src/components/AnalysisPanel';
import {aiReadiness} from '../shared/ai-readiness';
import {createApiClient} from '../src/api';
import {assertAIConfigured} from '../server/ai';
import {createGeminiKeyReader} from '../server/env';
import type {Settings,Repo,AIStatus} from '../shared/types';
const config:Settings={provider:'gemini',geminiModel:'gemini-test-fixture',cloudConsent:true,endpoint:'http://127.0.0.1:11434',model:'',contextSize:4096,timeout:30,streaming:true,cpuOnly:false,animations:true,decorations:true,reducedMotion:false,glass:70,maxRepositoryMB:100,maxFileKB:256,retentionDays:90};
const repo:Repo={id:'test',name:'fixture',url:'local://fixture',branch:'main',commit:'abc',lastCommit:'',commitCount:1,createdAt:'',updatedAt:'',status:'ready',stage:'Static analysis complete',files:[{path:'index.js',size:10,language:'JavaScript',lines:1}],findings:[],dependencies:0,languages:['JavaScript'],plan:[],warnings:[]};
const status:AIStatus={provider:'gemini',connected:true,keyConfigured:true,models:[{name:'gemini-test-fixture',size:0}]};
const callbacks={onAnalyze:()=>{},onCancel:()=>{},onSettings:()=>{}};
test('a key added or changed in .env after startup is picked up without restart',()=>{
 let file='GEMINI_API_KEY=\n';const read=createGeminiKeyReader(undefined,()=>file);assert.equal(read(),undefined);
 file='GEMINI_API_KEY=fixture-key-one';assert.equal(read(),'fixture-key-one');file='GEMINI_API_KEY=fixture-key-two';assert.equal(read(),'fixture-key-two');
 const inherited=createGeminiKeyReader('environment-fixture-key',()=>file);assert.equal(inherited(),'environment-fixture-key');file='';assert.equal(read(),undefined);
});
test('autopsy setup identifies missing key, model, consent and connection',()=>{
 assert.match(aiReadiness(config,{...status,keyConfigured:false,connected:false}).message,/API key/);
 assert.match(aiReadiness({...config,geminiModel:''},status).message,/Choose a Google model/);
 assert.match(aiReadiness({...config,cloudConsent:false},status).message,/consent/);
 assert.equal(aiReadiness(config,status).ready,true);
 assert.throws(()=>assertAIConfigured(config,false),/API key/);
 assert.throws(()=>assertAIConfigured({...config,geminiModel:''},true),/Choose a Google model/);
});
test('analysis panel has a start action, renders real working state, and shows failures in place',()=>{
 const ready=renderToStaticMarkup(<AnalysisPanel repo={repo} config={config} status={status} stream="" {...callbacks}/>);assert.match(ready,/Start AI autopsy/);
 const busy=renderToStaticMarkup(<AnalysisPanel repo={{...repo,status:'working',operation:'analysis',operationStartedAt:new Date().toISOString(),stage:'Google cloud is investigating'}} config={config} status={status} stream="{&quot;overview&quot;:" {...callbacks}/>);assert.match(busy,/aria-busy="true"/);assert.match(busy,/analysis-radar/);assert.match(busy,/Google cloud is investigating/);assert.match(busy,/Cancel analysis/);assert.doesNotMatch(busy,/Let the ghost investigate/);
 const failed=renderToStaticMarkup(<AnalysisPanel repo={{...repo,operation:'analysis',error:'Google API failed (HTTP 429). Quota exceeded.'}} config={config} status={status} stream="" {...callbacks}/>);assert.match(failed,/AI autopsy did not complete/);assert.match(failed,/429/);assert.match(failed,/Retry AI autopsy/);
 const setup=renderToStaticMarkup(<AnalysisPanel repo={repo} config={config} status={{...status,keyConfigured:false,connected:false}} stream="" {...callbacks}/>);assert.match(setup,/Configure API key/);assert.match(setup,/disabled/);
});
test('mutations refresh a rotated backend session once without retrying other errors',async()=>{
 let sessions=0,mutations=0;const client=createApiClient(async(url,options)=>{
 if(url==='/api/session')return Response.json({token:'session-'+(++sessions)});
 mutations++;if(new Headers(options?.headers).get('X-GhostCommit-Token')==='session-1')return Response.json({error:'Missing local session token. Reload the application.'},{status:403});return Response.json({started:true});
 });assert.deepEqual(await client('/repositories/test/analyze','POST'),{started:true});assert.equal(sessions,2);assert.equal(mutations,2);
 let attempts=0;const denied=createApiClient(async(url)=>url==='/api/session'?Response.json({token:'session'}):(attempts++,Response.json({error:'Cross-site access is blocked.'},{status:403})));
 await assert.rejects(denied('/repositories/test/analyze','POST'),/Cross-site/);assert.equal(attempts,1);
});
