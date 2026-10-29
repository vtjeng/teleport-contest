import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(dir,'caller-contract.json'))),mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const strip=s=>s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');
const seen={};for(const [path,hash] of Object.entries(contract.sourceHashes)){const raw=readFileSync(path,'utf8');assert.equal(createHash('sha256').update(raw).digest('hex'),hash,path);const s=strip(raw);const matches=[...s.matchAll(/\bfinddpos\s*\(([^()]*)\)/g)];const calls=matches.filter(m=>!m[1].includes('coord *')&&!m[1].startsWith('cc, dir,'));assert.equal(matches.length,path.endsWith('.c')?12:11);const directions=calls.map(m=>{const a=m[1].split(',').map(s=>s.trim());assert.equal(a.length,3);assert.match(a[1],/^DIR_[NESW]$/);return a[1].slice(4);});assert.deepEqual(directions,contract.callDirections);assert.equal((s.match(/\bfinddpos\b/g)||[]).length,matches.length);seen[path]=directions;}
const refs=execFileSync('git',['-C','nethack-c/upstream','grep','-l','-w','finddpos','--','*.c','*.h'],{encoding:'utf8'}).trim().split('\n');assert.deepEqual(refs,['src/mklev.c']);
const tmp=mkdtempSync(join(tmpdir(),'levels-finddpos-direction-'));try{const exe=join(tmp,'oracle');execFileSync(process.env.CC??'clang',['-std=c11','-O2',join(dir,'oracle.c'),'-o',exe]);const raw=execFileSync(exe,[mode],{encoding:'utf8'});assert.equal(raw.trim().split('\n').length,mode==='target'?4:8);console.log(JSON.stringify({mode,sourceCallers:seen,scope:contract.scope})+'\n'+raw.trimEnd());}finally{rmSync(tmp,{recursive:true,force:true});}
