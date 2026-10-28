import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {selection_floodfill} from '../../../../js/quest_levels.js';
const dir=dirname(fileURLToPath(import.meta.url));
const tmp=mkdtempSync(join(tmpdir(),'levels-flood-oracle-'));
try {
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dir,'oracle.c'),'-o',join(tmp,'oracle')]);
 const cases=[];
 // All 256 3x3 binary neighborhoods with a floor center, at two valid origins.
 for(const ox of [1,2])for(let mask=0;mask<512;mask++)if(mask&16){
  const map=Array.from({length:21},()=>Array(80).fill(0));
  for(let i=0;i<9;i++)if(mask&(1<<i))map[9+Math.floor(i/3)][ox+9+i%3]=1;
  cases.push({ox,mask,map,diagonal:0});
 }
 // Corner-only detector control distinguishes cardinal from diagonal fill.
 const control=structuredClone(cases.find(c=>c.mask===17));control.diagonal=1;cases.push(control);
 const input=cases.map(c=>`${c.ox+10} 10 ${c.diagonal}\n${c.map.flat().join(' ')}`).join('\n')+'\n';
 const outputs=execFileSync(join(tmp,'oracle'),[],{input,encoding:'utf8',maxBuffer:4e6}).trim().split('\n');
 assert.equal(outputs.length,cases.length);
 for(let i=0;i<cases.length-1;i++){
  const c=cases[i], state={level:{at(x,y){return c.map[y]?.[x]===undefined?null:{typ:c.map[y][x]};}}};
  const js=selection_floodfill(10,10,state,{xstart:c.ox,ystart:0});
  let bits='';for(let y=0;y<21;y++)for(let x=0;x<80;x++)bits+=js.get(x-c.ox,y)?'1':'0';
  assert.equal(bits,outputs[i],`origin ${c.ox}, mask ${c.mask}`);
 }
 const cardinal=outputs[cases.findIndex(c=>c.mask===17)];
 assert.notEqual(outputs.at(-1),cardinal);
 assert.equal([...cardinal].filter(c=>c==='1').length,1);
 assert.equal([...outputs.at(-1)].filter(c=>c==='1').length,2);
 console.log(JSON.stringify({comparisons:512,matched:512,control:{cardinal:1,diagonal:2},scope:'3x3 floor neighborhoods, floor center, origins (1,0)/(2,0); no global helper equivalence'},null,2));
} finally {rmSync(tmp,{recursive:true,force:true});}
