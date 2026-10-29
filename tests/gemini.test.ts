import {test} from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {createGeminiClient} from '../server/gemini.js';
import type {Settings} from '../shared/types.js';
const config:Settings={provider:'gemini',geminiModel:'gemini-test-fixture',cloudConsent:true,endpoint:'http://127.0.0.1:11434',model:'',contextSize:4096,timeout:30,streaming:false,cpuOnly:false,animations:false,decorations:false,reducedMotion:true,glass:70,maxRepositoryMB:100,maxFileKB:256,retentionDays:90};
const schema=z.object({summary:z.string().min(1)}),signal=new AbortController().signal;
const modelResponse=()=>Response.json({models:[{name:'models/gemini-test-fixture',supportedGenerationMethods:['generateContent']},{name:'models/gemma-test-fixture',supportedGenerationMethods:['generateContent']},{name:'models/embedding-fixture',supportedGenerationMethods:['embedContent']}]});
const completed=(text:string)=>({candidates:[{content:{parts:[{text}]},finishReason:'STOP'}]});
test('Google status exposes configuration state and actual model names without credentials',async()=>{
 let calls=0;const missing=createGeminiClient(()=>undefined,async()=>{calls++;throw new Error('must not connect');});const status=await missing.status();assert.equal(status.keyConfigured,false);assert.equal(calls,0);assert.match(status.error||'',/not configured/);
 const client=createGeminiClient(()=>'TEST-KEY-ONLY',async(url,options)=>{assert.equal(new Headers(options?.headers).get('x-goog-api-key'),'TEST-KEY-ONLY');assert.ok(!String(url).includes('TEST-KEY-ONLY'));return modelResponse();});
 const connected=await client.status();assert.deepEqual(connected.models.map(m=>m.name),['gemini-test-fixture','gemma-test-fixture']);assert.equal(JSON.stringify(connected).includes('TEST-KEY-ONLY'),false);
});
test('cloud generation requires explicit consent before any provider request',async()=>{
 let calls=0;const client=createGeminiClient(()=>'TEST-KEY-ONLY',async()=>{calls++;throw new Error('must not connect');});await assert.rejects(client.generate(schema,'source evidence',signal,()=>{},{...config,cloudConsent:false}),/consent/);assert.equal(calls,0);
});
test('Gemini uses server auth, system instructions, JSON schema and validated output',async()=>{
 const client=createGeminiClient(()=>'TEST-KEY-ONLY',async(url,options)=>{if(String(url).includes('/models?'))return modelResponse();assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-fixture:generateContent');const body=JSON.parse(String(options?.body));assert.match(body.systemInstruction.parts[0].text,/UNTRUSTED DATA/);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(body.generationConfig.responseJsonSchema.properties.summary);assert.equal(JSON.stringify(body).includes('TEST-KEY-ONLY'),false);return Response.json(completed('{"summary":"validated fixture response"}'));});
 assert.deepEqual(await client.generate(schema,'real context placeholder',signal,()=>{},config),{summary:'validated fixture response'});
});
test('Google SSE parsing handles chunk boundaries, skips thought parts and rejects incomplete streams',async()=>{
 const stream='data: '+JSON.stringify({candidates:[{content:{parts:[{text:'private reasoning',thought:true},{text:'{"summary":'}]}}]})+'\r\n\r\ndata: '+JSON.stringify(completed('"streamed fixture"}'))+'\r\n\r\n';let tokens='';
 const client=createGeminiClient(()=>'TEST-KEY-ONLY',async(url)=>{if(String(url).includes('/models?'))return modelResponse();return new Response(new ReadableStream({start(controller){const bytes=new TextEncoder().encode(stream);for(let i=0;i<bytes.length;i+=7)controller.enqueue(bytes.slice(i,i+7));controller.close();}}));});
 assert.deepEqual(await client.generate(schema,'context',signal,t=>{tokens+=t;},{...config,streaming:true}),{summary:'streamed fixture'});assert.equal(tokens,'{"summary":"streamed fixture"}');
 const incomplete=createGeminiClient(()=>'TEST-KEY-ONLY',async(url)=>String(url).includes('/models?')?modelResponse():new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:'{"summary":"truncated"}'}]}}]})+'\n\n'));
 await assert.rejects(incomplete.generate(schema,'context',signal,()=>{},{...config,streaming:true}),/stream interrupted/);
});
test('hosted Gemma is named accurately and uses prompt-based JSON without unsupported system fields',async()=>{
 const client=createGeminiClient(()=>'TEST-KEY-ONLY',async(url,options)=>{if(String(url).includes('/models?'))return modelResponse();assert.match(String(url),/gemma-test-fixture:generateContent$/);const body=JSON.parse(String(options?.body));assert.equal(body.systemInstruction,undefined);assert.equal(body.generationConfig.responseMimeType,undefined);assert.match(body.contents[0].parts[0].text,/Required JSON schema/);return Response.json(completed('{"summary":"hosted Gemma fixture"}'));});
 assert.equal((await client.generate(schema,'context',signal,()=>{},{...config,geminiModel:'gemma-test-fixture'})).summary,'hosted Gemma fixture');
});
test('malformed output retries only once and quota errors redact the key',async()=>{
 let generations=0;const invalid=createGeminiClient(()=>'TEST-KEY-ONLY',async(url)=>{if(String(url).includes('/models?'))return modelResponse();generations++;return Response.json(completed('{"wrong":"schema"}'));});await assert.rejects(invalid.generate(schema,'context',signal,()=>{},config),/invalid structured JSON twice/);assert.equal(generations,2);
 const quota=createGeminiClient(()=>'TEST-KEY-ONLY',async()=>Response.json({error:{message:'Quota exceeded for TEST-KEY-ONLY'}},{status:429}));const status=await quota.status();assert.ok(status.error?.includes('429'));assert.equal(status.error?.includes('TEST-KEY-ONLY'),false);
});
