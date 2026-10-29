import type {Repo,Patch,Settings,AIStatus,Activity} from '../shared/types';
export function createApiClient(fetcher:typeof fetch=fetch){
 let csrf='';
 async function session(){const res=await fetcher('/api/session');if(!res.ok)throw new Error('Cannot connect to the local backend. Start it and try again.');csrf=(await res.json()).token;}
 return async function request<T>(url:string,method='GET',body?:unknown):Promise<T>{
 for(let attempt=0;attempt<2;attempt++){
 if(method!=='GET'&&!csrf)await session();
 const res=await fetcher('/api'+url,{method,headers:{'Content-Type':'application/json',...(method!=='GET'?{'X-GhostCommit-Token':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 if(res.ok)return res.json();
 let message=`Request failed (${res.status})`;try{message=(await res.json()).error||message;}catch{}
 // The backend rejected this mutation before executing it, so refreshing its
 // rotated session token and retrying once cannot duplicate the operation.
 if(attempt===0&&method!=='GET'&&res.status===403&&message.includes('Missing local session token')){await session();continue;}
 throw new Error(message);
 }
 throw new Error('Local session could not be refreshed. Reload the application.');
 };
}
export const api=createApiClient();
export const requests={repos:()=>api<Repo[]>('/repositories'),patches:()=>api<Patch[]>('/patches'),settings:()=>api<Settings&{workspace:string;localRoots:string[];ignoredDirectories:string[]}>('/settings'),ai:()=>api<AIStatus>('/ai/status'),activity:()=>api<Activity[]>('/activity')};
export function download(name:string,text:string,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
