import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {normalizeGithub,safeRelative,sensitive,hasSecrets,safeFile} from '../server/security.js';
test('GitHub URL validation rejects command, credential, redirect and traversal inputs',()=>{
 assert.equal(normalizeGithub('https://github.com/expressjs/express.git'),'https://github.com/expressjs/express');
 for(const value of ['file:///etc/passwd','https://evil.test/a/b','https://github.com/a/b?redirect=evil','https://user:pass@github.com/a/b','https://github.com:444/a/b','https://github.com/a/b/extra','git@github.com:a/b','https://github.com/a/-b'])assert.throws(()=>normalizeGithub(value),value);
});
test('source paths permit GitHub CI but block traversal, Git internals and platform escapes',()=>{
 assert.equal(safeRelative('.github/workflows/test.yml'),true);assert.equal(safeRelative('src/index.ts'),true);
 for(const file of ['../outside','/etc/passwd','C:/secret','a\\b','src/../../x','.git/config','a/.git/config','foo\nbar','a//b'])assert.equal(safeRelative(file),false,file);
 for(const file of ['.env','.env.local','src/secrets.json','.ssh/id_rsa','a/private.pem','.npmrc'])assert.equal(sensitive(file),true,file);
 assert.equal(hasSecrets('const password = "super-secret-password"'),true);assert.equal(hasSecrets('-----BEGIN PRIVATE KEY-----'),true);assert.equal(hasSecrets('export const n = 1'),false);
});
test('filesystem reads reject symlink and junction escapes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ghostcommit-path-'));try{
 await fs.mkdir(path.join(dir,'repo'));await fs.mkdir(path.join(dir,'outside'));await fs.writeFile(path.join(dir,'outside','data.txt'),'outside');
 await fs.symlink(path.join(dir,'outside'),path.join(dir,'repo','link'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(safeFile(path.join(dir,'repo'),'link/data.txt'),/Symbolic links/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
