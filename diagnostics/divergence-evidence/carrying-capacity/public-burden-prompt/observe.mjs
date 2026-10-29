import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const screen=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
const output=[];
const total=r=>r.filter(l=>/^\s+[a-z$] - .*\(\d+ aum\)/.test(l)).reduce((n,l)=>n+Number(l.match(/\((\d+) aum\)/)[1]),0);
const base='diagnostics/divergence-evidence/carrying-capacity/public-burden-prompt';const hp=/HP:16\(16\)/;
for(const name of ['decline-accept','accept-control']) {

 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);assert.equal(diff.passed,true);const rows=rec.segments[0].steps.map(t=>screen(t.screen));
 for(const r of rows){assert.match(r[23],hp);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}

 assert.match(rows[18][0],/lifting 861 arrows.*Continue/);
 if(name==='decline-accept'){assert.equal(total(rows[21]),90);assert.ok(!rows[21].some(l=>l.includes(' e - ')));assert.match(rows[23][0],/lifting 861 arrows.*Continue/);}
 const final=name==='decline-accept'?26:21;assert.equal(total(rows[final]),951);assert.ok(rows[final].some(l=>l.includes('e - 861 arrows (861 aum)')));assert.ok(rows[final][23].endsWith('Burdened'));
 output.push({name,passed:true,lengths:diff.lengths,afterDeclineWeight:name==='decline-accept'?90:null,acceptedWeight:951});
}
console.log(JSON.stringify(output,null,2));
