import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {selection_new} from '../../../../js/themerooms.js';
import {l_selection_or,l_selection_sub} from '../../../../js/nhlsel.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));
const evidenceDir=dirname(fileURLToPath(import.meta.url)),contract=JSON.parse(readFileSync(join(evidenceDir,'source-contract.json')));
for(const[path,h]of Object.entries(contract.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),h,path);
const oracle=readFileSync(join(evidenceDir,'oracle.c'),'utf8');for(const{path,symbol}of contract.exactCFunctions){const s=readFileSync(path,'utf8'),a=s.indexOf('\n'+symbol+'(')+1;assert(a>0&&oracle.includes(s.slice(a,s.indexOf('\n}',a)+2)),symbol);}
const tmp=mkdtempSync(join(tmpdir(),'levels-selection-numeric-'));const results=[];
try {
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const values=mode==='target'?[0,1,2,3,4,5,6,7]:[0,1];const layout=mode==='target'?0:1;
 for(const op of [0,1])for(const a of values)for(const b of values){
  const expected=execFileSync(join(tmp,'oracle'),[op,a,b,layout].map(String),{encoding:'utf8'}).trim().split(' ');const bytes=Buffer.from(expected[0],'hex');
  const sa=selection_new(),sb=selection_new();sa.set(3,4,a);sb.set(layout?7:3,layout?2:4,b);
  const beforeA=Buffer.from(sa.points),beforeB=Buffer.from(sb.points);const result=(op?l_selection_sub:l_selection_or)(sa,sb);
  assert(result!==sa&&result!==sb&&result.absolute);assert.deepEqual(Buffer.from(sa.points),beforeA);assert.deepEqual(Buffer.from(sb.points),beforeB);
  assert.deepEqual(Buffer.from(result.points),bytes);assert.deepEqual(Object.values(result.bounds()),expected.slice(1).map(Number));
  results.push({op:op?'sub':'or',a,b,layout,bounds:result.bounds(),valueAtOverlap:result.points[4*80+3]-1,valueAtOther:result.points[2*80+7]-1,fullMapSha256:createHash('sha256').update(bytes).digest('hex')});
 }
 console.log(JSON.stringify({scope:'Shared absolute frame; overlap values0..7 target, disjoint boolean controls. Entire1680-byte maps and computed bounds compared; no mixed-frame claim.',comparisons:results.length,results},null,2));
}finally{rmSync(tmp,{recursive:true,force:true});}
