import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type {Settings} from '../shared/types.js';
export const dataRoot=path.resolve(process.env.GHOSTCOMMIT_DATA || '.ghostcommit');
export const workspace=path.join(dataRoot,'repositories');
export const copies=path.join(dataRoot,'working-copies');
for(const p of [dataRoot,workspace,copies])mkdirSync(p,{recursive:true});
const db=new DatabaseSync(path.join(dataRoot,'ghostcommit.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));');
export function save<T extends {id:string}>(kind:string,item:T):T {db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,item.id,JSON.stringify(item));return item;}
export function get<T>(kind:string,id:string):T|undefined {const row=db.prepare('SELECT data FROM records WHERE kind=? AND id=?').get(kind,id) as {data:string}|undefined;return row?JSON.parse(row.data):undefined;}
export function list<T>(kind:string):T[]{return (db.prepare('SELECT data FROM records WHERE kind=? ORDER BY rowid DESC').all(kind) as {data:string}[]).map(r=>JSON.parse(r.data));}
export function remove(kind:string,id:string){db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id);}
const defaults:Settings={provider:'gemini',geminiModel:'',cloudConsent:false,endpoint:'http://127.0.0.1:11434',model:'',contextSize:4096,timeout:180,streaming:true,cpuOnly:false,animations:true,decorations:true,reducedMotion:false,glass:70,maxRepositoryMB:100,maxFileKB:256,retentionDays:90};
export function settings():Settings {return {...defaults,...get<Settings>('settings','main')};}
export function writeSettings(value:Settings){save('settings',{...value,id:'main'});}
