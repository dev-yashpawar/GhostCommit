import {z} from 'zod';
import {settings} from './storage.js';
import {generate as generateOllama,ollamaStatus} from './ollama.js';
import {gemini} from './gemini.js';
import {AppError} from './security.js';
import {geminiApiKey} from './env.js';
import type {Settings,AIProvider,AIStatus} from '../shared/types.js';
export function activeModel(config:Settings){return config.provider==='gemini'?config.geminiModel:config.model;}
export function providerLabel(config:Settings){return config.provider==='gemini'?'Google cloud':'Ollama local';}
export async function aiStatus(provider:AIProvider=settings().provider):Promise<AIStatus>{return provider==='gemini'?gemini.status():{...await ollamaStatus(),provider:'ollama'};}
let busy=false;
export function assertAIConfigured(config:Settings,keyPresent=Boolean(geminiApiKey())){
 if(config.provider==='gemini'){
 if(!keyPresent)throw new AppError('The backend has no Gemini API key loaded. Add GEMINI_API_KEY to .env, then refresh models in Settings.',503);
 if(!config.geminiModel)throw new AppError('Choose a Google model in Settings and save it before starting AI autopsy.');
 if(!config.cloudConsent)throw new AppError('Enable cloud analysis consent in Settings before sending repository evidence to Google.');
 }else if(!config.model)throw new AppError('Select an installed Ollama model in Settings before starting AI autopsy.');
}
export async function generate<T>(schema:z.ZodType<T>,prompt:string,signal:AbortSignal,onToken:(t:string)=>void,config:Settings=settings()):Promise<T>{
 if(busy)throw new AppError('Another AI request is running. Wait or cancel it first.',409);busy=true;
 try{return await (config.provider==='gemini'?gemini.generate(schema,prompt,signal,onToken,config):generateOllama(schema,prompt,signal,onToken,config));}finally{busy=false;}
}
