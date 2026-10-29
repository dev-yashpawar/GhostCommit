export type Severity='high'|'medium'|'low';
export interface Finding { id:string; file:string|null; line:number|null; category:string; severity:Severity; title:string; description:string; evidence:string; confidence:'high'|'medium'|'low'; verified:boolean; source:'scanner'|'ai' }
export interface FileEntry {path:string;size:number;language:string;lines:number;parseErrors?:number}
export type AIProvider='ollama'|'gemini';
export interface Analysis {overview:string;architecture:string;recommendations:string[];model:string;provider?:AIProvider;createdAt:string}
export interface PlanTask {id:string;title:string;description:string;priority:Severity;files:string[];expectedImprovement:string;risk:string;verification:string;status:string}
export interface Repo {id:string;name:string;url:string;branch:string;commit:string;lastCommit:string;commitCount:number;createdAt:string;updatedAt:string;status:string;stage:string;operation?:'import'|'scan'|'analysis'|'plan'|'patch';operationStartedAt?:string;operationCompletedAt?:string;error?:string;files:FileEntry[];findings:Finding[];dependencies:number;languages:string[];analysis?:Analysis;plan:PlanTask[];warnings:string[]}
export interface Patch {id:string;repositoryId:string;taskId?:string;file:string;original:string;proposed:string;diff:string;explanation:string;status:'awaiting_review'|'approved'|'rejected'|'applied';createdAt:string;appliedPath?:string}
export interface Settings {provider:AIProvider;geminiModel:string;cloudConsent:boolean;endpoint:string;model:string;contextSize:number;timeout:number;streaming:boolean;cpuOnly:boolean;animations:boolean;decorations:boolean;reducedMotion:boolean;glass:number;maxRepositoryMB:number;maxFileKB:number;retentionDays:number}
export interface Activity {id:string;repositoryId:string;name:string;message:string;createdAt:string;status:string}
export interface OllamaStatus {connected:boolean;models:{name:string;size:number}[];error?:string}
export interface AIStatus extends OllamaStatus {provider:AIProvider;keyConfigured?:boolean}
export interface TestRecord {id:string;repositoryId:string;status:'not_run';command:null;duration:null;exitCode:null;output:string;createdAt:string}
