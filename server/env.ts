import path from 'node:path';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
const inheritedGeminiKey=process.env.GEMINI_API_KEY;
// Server-only loading. Never use a VITE_ prefix for credentials.
try{process.loadEnvFile(path.resolve('.env'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('Could not load the server environment file.');}
export function createGeminiKeyReader(environmentKey:string|undefined,readEnvironmentFile:()=>string){return ()=>{
 if(environmentKey?.trim())return environmentKey.trim();
 try{const content=readEnvironmentFile();if(content.length>65536)return undefined;return parseEnv(content).GEMINI_API_KEY?.trim()||undefined;}catch{return undefined;}
};}
// Read on use so a key added after startup is recognized on the next refresh.
// Explicit process environment credentials still take precedence over .env.
export const geminiApiKey=createGeminiKeyReader(inheritedGeminiKey,()=>readFileSync(path.resolve('.env'),'utf8'));
