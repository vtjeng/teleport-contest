import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const probe=fileURLToPath(new URL('../levels-subroom-finalization-20261028/probe.mjs',import.meta.url));
const covered=row=>row.top.every(r=>r.roomno===r.expectedRoomno)&&row.sub.every(r=>r.roomno===r.expectedRoomno);
const rows=[];
for(let seed=28104000;seed<28104006;seed++){
 const row=JSON.parse(execFileSync(process.execPath,[probe,String(seed)],{encoding:'utf8'}));
 assert.ok(covered(row));assert.ok(row.sub.length>0);rows.push(row);
}
const control=structuredClone(rows[0]);control.sub[0].roomno=0;assert.equal(covered(control),false);
console.log(JSON.stringify({layouts:rows.length,subrooms:rows.reduce((n,r)=>n+r.sub.length,0),positiveControl:'missing child room number detected',rows},null,2));
