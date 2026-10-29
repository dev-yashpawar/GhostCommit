import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import ignore from 'ignore';
import Parser from 'web-tree-sitter';
import {git,safeRelative,sensitive,safeFile,hasSecrets,AppError} from './security.js';
import {settings,workspace} from './storage.js';
import type {Repo,Finding,FileEntry} from '../shared/types.js';
const languageMap:Record<string,string>={'.js':'JavaScript','.jsx':'JavaScript','.mjs':'JavaScript','.cjs':'JavaScript','.ts':'TypeScript','.tsx':'TypeScript','.py':'Python','.java':'Java','.json':'JSON','.md':'Markdown','.css':'CSS','.html':'HTML','.yml':'YAML','.yaml':'YAML','.toml':'TOML'};
const grammars:Record<string,string>={JavaScript:'javascript',TypeScript:'typescript',Python:'python',Java:'java'};
const loaded=new Map<string,Parser.Language>();let initialized:Promise<void>|undefined;
async function parseSource(text:string,language:string,extension:string){
 initialized??=Parser.init();await initialized;
 const grammar=extension==='.tsx'?'tsx':grammars[language];if(!grammar)return undefined;
 let lang=loaded.get(grammar);if(!lang){lang=await Parser.Language.load(path.resolve('node_modules/tree-sitter-wasms/out',`tree-sitter-${grammar}.wasm`));loaded.set(grammar,lang);}
 const parser=new Parser();parser.setLanguage(lang);const tree=parser.parse(text);const errors=tree.rootNode.descendantsOfType('ERROR').length;tree.delete();parser.delete();return errors;
}
export function repoRoot(id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw new AppError('Invalid repository ID.');return path.join(workspace,id);}
export async function readSource(repo:Repo,file:string){if(!repo.files.some(f=>f.path===file))throw new AppError('File is not in the scanned source index.');const p=await safeFile(repoRoot(repo.id),file);const stat=await fs.stat(p);if(stat.size>settings().maxFileKB*1024)throw new AppError('File exceeds size limit.');const text=await fs.readFile(p,'utf8');if(text.includes('\0')||hasSecrets(text))throw new AppError('File excluded because it may contain binary content or credentials.');return text;}
export async function scan(repo:Repo,progress:(s:string)=>void,signal:AbortSignal):Promise<Repo>{
 const root=repoRoot(repo.id),warnings:string[]=[],findings:Finding[]=[],files:FileEntry[]=[];const texts=new Map<string,string>();
 progress('Indexing committed source files');
 const entries=(await git(['ls-files','--stage','-z'],root)).split('\0').filter(Boolean);
 if(entries.length>20000)throw new AppError('Repository has more than 20,000 tracked files.');
 const ignored=ignore().add(['node_modules/','dist/','build/','coverage/','.next/','vendor/','venv/','.venv/']);
 try{ignored.add(await fs.readFile(path.join(root,'.gitignore'),'utf8'));}catch{}
 let total=0;
 for(const entry of entries){
 if(signal.aborted)throw new AppError('Scan cancelled.');
 const [head,file]=entry.split('\t');if(!file||!head.startsWith('100')||!safeRelative(file)||sensitive(file)||ignored.ignores(file))continue;
 const p=await safeFile(root,file),stat=await fs.stat(p);if(!stat.isFile())continue;
 if(stat.size>settings().maxFileKB*1024){warnings.push(`Skipped large file: ${file}`);continue;}
 total+=stat.size;if(total>settings().maxRepositoryMB*1024*1024)throw new AppError('Source exceeds repository size limit.');
 const buffer=await fs.readFile(p);if(buffer.includes(0))continue;const text=buffer.toString('utf8');if(hasSecrets(text)){warnings.push(`Excluded potential credential content: ${file}`);continue;}
 const language=languageMap[path.extname(file)]||'Text';let parseErrors:number|undefined;
 try{parseErrors=await parseSource(text,language,path.extname(file));}catch{warnings.push(`Parser unavailable for ${file}; text rules still applied.`);}
 files.push({path:file,size:stat.size,language,lines:text.split('\n').length,parseErrors});texts.set(file,text);
 }
 progress('Inspecting manifests and maintenance signals');
 function add(title:string,file:string|null,description:string,evidence:string,severity:Finding['severity']='low',verified=true,line:number|null=null,category='maintenance'){
 findings.push({id:randomUUID(),title,file,line,description,evidence,severity,verified,category,source:'scanner',confidence:verified?'high':'medium'});
 }
 if(!files.some(f=>/(^|\/)readme(?:\.|$)/i.test(f.path)))add('Project documentation is missing',null,'No README was found in the eligible tracked files.','README absent from scanned file index');
 if(!files.some(f=>/^(\.github\/workflows\/.*\.ya?ml|\.gitlab-ci\.yml|Jenkinsfile|\.circleci\/config\.yml)$/.test(f.path)))add('No CI configuration detected',null,'No supported CI configuration was found. Other CI systems may exist.','Checked GitHub Actions, GitLab CI, Jenkins and CircleCI paths');
 let dependencies=0;
 for(const [file,text] of texts){
 if(path.basename(file)==='package.json'){
 try{const manifest=JSON.parse(text);const deps={...manifest.dependencies,...manifest.devDependencies,...manifest.optionalDependencies};dependencies+=Object.keys(deps).length;
 if(Object.keys(deps).length)add('Dependency versions require verification',file,`${Object.keys(deps).length} declared packages. No registry lookup was performed; freshness and vulnerabilities are unverified.`,JSON.stringify(deps).slice(0,1000),'medium',false,null,'dependency');
 if(!manifest.scripts?.test||/echo.*no test|exit 0/.test(manifest.scripts.test))add('No meaningful test script detected',file,'Add a test command and tests for critical behavior. Do not run untrusted scripts on the host.','scripts.test: '+JSON.stringify(manifest.scripts?.test??null),'medium');
 }catch{add('Package manifest could not be parsed',file,'The package.json file is not valid JSON.',text.slice(0,180),'medium');}
 }
 if(path.basename(file)==='requirements.txt'){
 const rows=text.split(/\r?\n/).map(s=>s.replace(/\s+#.*$/,'').trim()).filter(s=>s&&!s.startsWith('#'));
 const requirements=rows.filter(s=>/^[A-Za-z0-9][A-Za-z0-9._-]*(\[[^\]]+\])?\s*(===|==|~=|>=|<=|!=|>|<|;|$)/.test(s));dependencies+=requirements.length;
 if(rows.length) add('Python requirements need maintenance review',file,`${requirements.length} package requirements recognized. Includes, URLs and advanced syntax need manual review. Versions were not checked against a registry.`,rows.slice(0,12).join('\n'),'medium',false,null,'dependency');
 }
 if(/(^|\/)(pyproject.toml|pom.xml|build.gradle(?:.kts)?)$/.test(file))add('Manifest requires manual dependency review',file,'This manifest is detected but dependency extraction is not yet supported for this format.',file,'low',false,null,'dependency');
 const lines=text.split('\n');for(let n=0;n<lines.length&&findings.length<250;n++){
 const line=lines[n];if(/\b(TODO|FIXME)\b/.test(line))add('Unresolved maintenance note',file,'Review this source note; it does not by itself confirm a defect.',line.trim().slice(0,300),'low',true,n+1,'maintenance');
 if(['JavaScript','TypeScript'].includes(languageMap[path.extname(file)]??'')&&/\bnew\s+Buffer\s*\(/.test(line))add('Deprecated Buffer constructor usage',file,'Use Buffer.from or Buffer.alloc after checking the argument type.','new Buffer: '+line.trim().slice(0,250),'medium',false,n+1,'deprecated-api');
 }
 }
 progress('Reading Git metadata');
 const [branch,commit,lastCommit,count]=await Promise.all([git(['branch','--show-current'],root),git(['rev-parse','HEAD'],root),git(['log','-1','--format=%cI'],root),git(['rev-list','--count','HEAD'],root)]);
 return {...repo,branch:branch||'detached',commit,lastCommit,commitCount:Number(count),files,findings,dependencies,languages:[...new Set(files.map(f=>f.language).filter(l=>l!=='Text'))],warnings: warnings.slice(0,100),status:'ready',stage:'Static analysis complete',updatedAt:new Date().toISOString()};
}
export async function context(repo:Repo,budget:number){
 const selected=[...repo.files].sort((a,b)=>Number(/readme|package\.json|src\/|main\.|app\.|index\./i.test(b.path))-Number(/readme|package\.json|src\/|main\.|app\.|index\./i.test(a.path)));
 const snippets:Record<string,string>={};let remaining=Math.floor(budget*.65);
 for(const f of selected){if(remaining<200)break;const text=await readSource(repo,f.path);const excerpt=text.slice(0,Math.min(3000,remaining));snippets[f.path]=excerpt;remaining-=excerpt.length+f.path.length;}
 const tree:string[]=[];let treeBudget=Math.floor(budget*.12);for(const file of repo.files){if(file.path.length>treeBudget)break;tree.push(file.path);treeBudget-=file.path.length+4;}
 const findings:Partial<Finding>[]=[];let findingBudget=Math.floor(budget*.18);for(const f of repo.findings){const item={title:f.title,file:f.file,line:f.line,severity:f.severity,verified:f.verified,evidence:f.evidence.slice(0,180)};const size=JSON.stringify(item).length;if(size>findingBudget)break;findings.push(item);findingBudget-=size;}
 return {name:repo.name,languages:repo.languages,tree,findings,snippets};
}
export function digest(text:string){return createHash('sha256').update(text).digest('hex');}
