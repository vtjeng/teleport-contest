import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const screen=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
const output=[];
const total=r=>r.filter(l=>/^\s+[a-z$] - .*\(\d+ aum\)/.test(l)).reduce((n,l)=>n+Number(l.match(/\((\d+) aum\)/)[1]),0);
const base='diagnostics/divergence-evidence/carrying-capacity/public-odd-capacity';const hp=/HP:10\(10\)/;
for(const [name,qty] of [['odd-target',837],['odd-control',400]]) {

 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);assert.equal(diff.passed,true);const rows=rec.segments[0].steps.map(t=>screen(t.screen));
 for(const r of rows){assert.match(r[23],hp);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}

 assert.equal(total(rows[1]),252);assert.match(rows[1][22],/St:9 .*Co:18/);
 const observations=[16,22,28,33,37].map((step,i)=>{const count=qty-[0,1,2,1,0][i];assert.equal(total(rows[step]),252+count);assert.ok(rows[step].some(l=>l.includes(`m - ${count} arrows (${count} aum)`)));const status=name==='odd-target'?(i===2?'Burdened':'Stressed'):null;if(status)assert.ok(rows[step][23].endsWith(status));else assert.doesNotMatch(rows[step][23],/Burdened|Stressed/);return{step,arrows:count,total:252+count,status};});
 output.push({name,passed:true,lengths:diff.lengths,capacity:725,observations});
}
console.log(JSON.stringify(output,null,2));
