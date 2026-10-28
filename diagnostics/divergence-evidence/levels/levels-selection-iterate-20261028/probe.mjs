import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {selection_new,selection_iterate} from '../../../../js/themerooms.js';
const mode=process.argv[2]??'target';assert(['target','control'].includes(mode));const control=mode==='control';const tmp=mkdtempSync(join(tmpdir(),'levels-selection-iterate-'));const results=[];
try{
 execFileSync(process.env.CC??'clang',['-std=c99','-O2',join(dirname(fileURLToPath(import.meta.url)),'oracle.c'),'-o',join(tmp,'oracle')]);
 const raw=execFileSync(join(tmp,'oracle'),[control?'1':'0'],{encoding:'utf8'});const rows=raw.trim().split('\n');assert.equal(rows.length,control?64:1680);const corners=[[0,0],[0,20],[1,0],[1,20],[79,0],[79,20]];
 for(let i=0;i<rows.length;i++){
  const [id,...expected]=rows[i].split(' ');assert.equal(Number(id),i);const selection=selection_new();
  if(control){for(let j=0;j<6;j++)if(i&(1<<j))selection.set(...corners[j]);}else selection.set(i%80,Math.trunc(i/80));
  const before=Buffer.from(selection.points);const actual=[];selection_iterate(selection,(x,y)=>actual.push(`${x},${y}`));assert.deepEqual(actual,expected);assert.deepEqual(Buffer.from(selection.points),before);results.push({id:i,callbacks:actual});
 }
 console.log(JSON.stringify({scope:'All1680 singleton points or64 subsets of six boundary points; default/null origin only. Actual callback order and unchanged selection checked.',count:results.length,cOracleOutputSha256:createHash('sha256').update(raw).digest('hex'),format:'Following lines are observed fixture-id then ordered x,y callbacks.'},null,2)+'\n'+results.map(r=>[r.id,...r.callbacks].join(' ')).join('\n'));
}finally{rmSync(tmp,{recursive:true,force:true});}
