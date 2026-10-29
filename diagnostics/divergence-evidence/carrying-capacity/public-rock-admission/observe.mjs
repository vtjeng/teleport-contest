import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const screen=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
const output=[];
const base='diagnostics/divergence-evidence/carrying-capacity/public-rock-admission';
for(const [name,steps,counts,arrows] of [['partial',[15,21,35,39,43],[275,273,273,274,274],15],['all-fit',[15,21,34,38,42],[275,273,273,275,275],4]]) {

 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);const rows=rec.segments[0].steps.map(t=>screen(t.screen));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}

 assert.equal(diff.passed,true);
 const observations=steps.map((step,i)=>{const line=rows[step].find(l=>l.includes(' e - '));assert.ok(line.includes(`${counts[i]} rocks (${counts[i]*10} aum)`));const items=rows[step].filter(l=>/^\s+[a-z] - .*\(\d+ aum\)/.test(l));const total=items.reduce((n,l)=>n+Number(l.match(/\((\d+) aum\)/)[1]),0);assert.equal(total,90+counts[i]*10+(i>=2?arrows:0));assert.ok(rows[step][23].endsWith('Overtaxed'));return {step,rocks:counts[i],total};});
 if(name==='partial'){assert.match(rows[37][0],/only lift one of the 2 rocks/);assert.match(rows[41][0],/cannot lift any more/);}
 output.push({name,passed:diff.passed,lengths:diff.lengths,observations});
}
console.log(JSON.stringify(output,null,2));
