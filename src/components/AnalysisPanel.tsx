import {useEffect,useState} from 'react';
import {AlertTriangle,ArrowRight,CheckCircle2,Clock,Ghost,LoaderCircle,Settings as SettingsIcon,Sparkles,X} from 'lucide-react';
import {Button} from './ui/button';
import {aiReadiness} from '../../shared/ai-readiness';
import type {AIStatus,Repo,Settings} from '../../shared/types';
interface Props {repo:Repo;config?:Settings;status?:AIStatus;connectionError?:string;starting?:boolean;startingAt?:string;stream:string;onAnalyze:()=>void;onCancel:()=>void;onSettings:()=>void}
export function AnalysisPanel({repo,config,status,connectionError,starting=false,startingAt,stream,onAnalyze,onCancel,onSettings}:Props){
 const busy=starting||(repo.status==='working'&&repo.operation==='analysis');
 const readiness=aiReadiness(config,status,connectionError);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!busy)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[busy,repo.operationStartedAt]);
 const elapsed=Math.max(0,Math.floor((now-Date.parse((starting?startingAt:repo.operationStartedAt)||new Date(now).toISOString()))/1000));
 const time=elapsed<60?`${elapsed}s`:`${Math.floor(elapsed/60)}m ${elapsed%60}s`;
 const failed=!busy&&repo.error&&(repo.operation==='analysis'||!repo.analysis);
 const hasOutput=!!stream.length;
 return <section className="panel ai-autopsy" aria-busy={busy}>
 <div className="panel-heading"><h2><Sparkles size={17}/> AI autopsy</h2>{busy?<span className="badge green"><LoaderCircle size={11} className="spin"/> Working · {time}</span>:repo.analysis?<span className="badge green"><CheckCircle2 size={11}/> Report ready</span>:<span className={'badge '+(readiness.ready?'green':'medium')}>{readiness.ready?'Ready':'Setup needed'}</span>}</div>
 {busy?<div className="analysis-working" role="status" aria-live="polite"><div className="analysis-radar" aria-hidden="true"><span/><span/><Ghost size={36}/><i/></div><div className="working-kicker">INVESTIGATION IN PROGRESS</div><h3>{hasOutput?'The ghost is writing your autopsy…':'The ghost is investigating…'}</h3><p>{starting?'Starting the AI request…':repo.stage}</p><div className="analysis-live-metrics"><span><Clock size={13}/>{time} elapsed</span><span className="analysis-live-dot"/>{hasOutput?<span>{stream.length.toLocaleString()} response characters received</span>:<span>Waiting for the first response</span>}</div><div className="analysis-skeleton" aria-hidden="true"><i/><i/><i/></div><p className="working-hint">{elapsed>=30&&!hasOutput?'The provider is still responding. You can wait or cancel; no report has been completed yet.':'This panel updates as the provider responds. The report appears after validation.'}</p><Button variant="outline" size="sm" onClick={onCancel}><X size={13}/> Cancel analysis</Button>{hasOutput&&<details className="generation-stream"><summary>Live model output · not yet validated</summary><pre>{stream}</pre></details>}</div>:<>
 {failed&&<div className="analysis-error" role="alert"><AlertTriangle size={18}/><div><h3>AI autopsy did not complete</h3><p>{repo.error}</p><small>Your repository and static findings are still available.</small></div></div>}
 {!readiness.ready&&<div className="analysis-setup"><SettingsIcon size={20}/><div><h3>Finish AI setup</h3><p>{readiness.message}</p><Button variant="outline" size="sm" onClick={onSettings}>{readiness.action}<ArrowRight size={12}/></Button></div></div>}
 {repo.analysis?<div className="prose"><span className="badge green">{repo.analysis.model}</span><h3>Project overview</h3><p>{repo.analysis.overview}</p><h3>Architecture</h3><p>{repo.analysis.architecture}</p><h3>Recommendations</h3><ul>{repo.analysis.recommendations.map((r,i)=><li key={i}>{r}</li>)}</ul></div>:!failed&&readiness.ready?<div className="empty"><div className="empty-icon"><Sparkles size={26}/></div><h3>Let the ghost investigate</h3><p>Explain the architecture and uncover maintenance concerns using actual repository evidence.</p></div>:null}
 <div className="analysis-controls"><Button disabled={!readiness.ready||repo.status==='working'||!repo.files.length} onClick={onAnalyze}><Sparkles size={15}/>{repo.analysis?'Run a fresh autopsy':failed?'Retry AI autopsy':'Start AI autopsy'}</Button><button className="text-link" onClick={onSettings}>AI settings <ArrowRight size={12}/></button></div>
 </>}
 </section>;
}
