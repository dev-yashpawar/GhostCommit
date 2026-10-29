import path from 'node:path';
import fs from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
export class AppError extends Error {constructor(message:string,public status=400){super(message);}}
export function normalizeGithub(value:string){
 let u:URL;try{u=new URL(value);}catch{throw new AppError('Enter a public GitHub HTTPS repository URL.');}
 if(u.protocol!=='https:'||u.hostname!=='github.com'||u.port||u.username||u.password||u.search||u.hash||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(u.pathname))throw new AppError('Use https://github.com/owner/repository without query parameters.');
 const [owner,name]=u.pathname.slice(1).replace(/\/$/,'').replace(/\.git$/,'').split('/');
 if([owner,name].some(x=>!x||x==='.'||x==='..'||x.startsWith('-')))throw new AppError('Invalid GitHub repository name.');
 return `https://github.com/${owner}/${name}`;
}
export function safeRelative(file:string){return !!file && file.length<500 && !file.includes('\\') && !file.includes(':') && !file.includes('\0') && !path.posix.isAbsolute(file) && file.split('/').every(p=>p!=='.'&&p!=='..'&&p!==''&&p.toLowerCase()!=='.git'&& !/[\u0000-\u001f]/.test(p));}
export function sensitive(file:string){return /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519|\.aws|\.ssh|\.codex|\.agents)(\/|$)|\.(pem|key|p12|pfx|sqlite|db)$/i.test(file);}
export function hasSecrets(text:string){return /-----BEGIN (?:[A-Z ]*PRIVATE KEY)|(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|(?:api[_-]?key|secret|password|access[_-]?token)\s*[=:]\s*["'](?!process\.|\$\{|<|example|changeme|test)[^"'\n]{8,}["']/i.test(text);}
export async function safeFile(root:string,file:string){
 if(!safeRelative(file)||sensitive(file))throw new AppError('This file is outside the readable source scope.');
 const base=await fs.realpath(root);let current=base;
 for(const segment of file.split('/')){current=path.join(current,segment);if((await fs.lstat(current)).isSymbolicLink())throw new AppError('Symbolic links are excluded.');}
 const real=await fs.realpath(current);if(!real.startsWith(base+path.sep))throw new AppError('File escapes repository.');return real;
}
const runFile=promisify(execFile);
export const gitEnv={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_LFS_SKIP_SMUDGE:'1',GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_COUNT:'0'};
const gitOptions=['-c','core.hooksPath=','-c','core.fsmonitor=false','-c','core.symlinks=false','-c','protocol.ext.allow=never','-c','protocol.file.allow=never','-c','credential.helper='];
export async function git(args:string[],cwd?:string){const {stdout}=await runFile('git',[...gitOptions,...args],{cwd,env:gitEnv,timeout:30000,maxBuffer:8*1024*1024,windowsHide:true});return stdout.trim();}
export async function directorySize(root:string):Promise<number>{let size=0;for(const e of await fs.readdir(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isSymbolicLink())continue;size+=e.isDirectory()?await directorySize(p):(await fs.stat(p)).size;}return size;}
export async function clone(source:string,target:string,local:boolean,limit:number,signal:AbortSignal){
 await new Promise<void>((resolve,reject)=>{
 const args=[...gitOptions,...(local?['-c','protocol.file.allow=always']:[]),'clone','--no-checkout','--no-local',...(local?[]:['--depth','200','--single-branch']),'--',source,target];
 const child=spawn('git',args,{env:gitEnv,windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';let failed:Error|undefined;let checking=false;
 child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-3000);});
 const stop=(error:Error)=>{failed=error;child.kill();};
 const abort=()=>stop(new AppError('Import cancelled.'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 const timer=setTimeout(()=>stop(new AppError('Clone exceeded the 120-second limit.')),120000);
 const sizeTimer=setInterval(async()=>{if(checking)return;checking=true;try{if(await directorySize(target)>limit)stop(new AppError('Repository exceeds the configured size limit.'));}catch{}finally{checking=false;}},300);
 const finish=()=>{clearTimeout(timer);clearInterval(sizeTimer);signal.removeEventListener('abort',abort);};
 child.on('error',e=>{finish();reject(e);});child.on('close',code=>{finish();code===0&&!failed?resolve():reject(failed||new AppError(`Git import failed. Check that the repository is public and Git is installed. ${stderr.slice(-500)}`));});
 });
 if(await directorySize(target)>limit)throw new AppError('Repository exceeds the configured size limit.');
 const tree=(await git(['ls-tree','-r','-l','-z','HEAD'],target)).split('\0').filter(Boolean);
 if(tree.length>20000)throw new AppError('Repository exceeds the 20,000-file limit.');
 const expandedSize=tree.reduce((sum,row)=>sum+(Number(row.split('\t')[0].trim().split(/\s+/)[3])||0),0);
 if(expandedSize>limit)throw new AppError('Expanded repository exceeds the configured size limit.');
 if(signal.aborted)throw new AppError('Import cancelled.');
 await git(['checkout','--force','HEAD'],target);
 if(await directorySize(target)>limit)throw new AppError('Checked-out repository exceeds the size limit.');
}
