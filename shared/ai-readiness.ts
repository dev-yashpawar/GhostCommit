import type {AIStatus,Settings} from './types';
export function aiReadiness(config?:Settings,status?:AIStatus,connectionError?:string){
 if(!config)return {ready:false,message:'Loading AI configuration…',action:'Open AI settings'};
 if(config.provider==='gemini'){
 if(status?.keyConfigured===false)return {ready:false,message:'The backend has no Gemini API key loaded. Add GEMINI_API_KEY to .env, then refresh models in Settings.',action:'Configure API key'};
 if(!config.geminiModel)return {ready:false,message:'Choose a Google model in Settings and save it before starting AI autopsy.',action:'Select a model'};
 if(!config.cloudConsent)return {ready:false,message:'Enable cloud analysis consent in Settings before sending repository evidence to Google.',action:'Enable cloud analysis'};
 }else if(!config.model)return {ready:false,message:'Select an installed Ollama model in Settings before starting AI autopsy.',action:'Select a model'};
 if(!status)return {ready:false,message:connectionError||'Checking the AI provider connection…',action:'Check AI settings'};
 if(!status.connected)return {ready:false,message:status.error||'The selected AI provider is unavailable. Check its connection in Settings.',action:'Check AI connection'};
 return {ready:true,message:'AI is configured and ready to investigate.',action:'AI settings'};
}
