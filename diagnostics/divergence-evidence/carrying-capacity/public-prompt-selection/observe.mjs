import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-prompt-selection';
const output=[];
for(const name of ['decline-next','quit-control']) {
 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);assert.equal(diff.passed,true);
 const rows=rec.segments[0].steps.map(t=>decodeScreen(t.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 assert.equal(rows.length,41);assert.match(rows[34][0],/lifting 861 arrows.*Continue/);
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const items=rows[39].filter(l=>/^\s+[a-z] - .*\(\d+ aum\)/.test(l));
 assert.ok(!items.some(l=>l.includes('arrows')));
 const darts=items.some(l=>l.includes('f - 800 darts (800 aum)'));
 assert.equal(darts,name==='decline-next');
 const total=items.reduce((n,l)=>n+Number(l.match(/\((\d+) aum\)/)[1]),0);
 assert.equal(total,name==='decline-next'?890:90);assert.doesNotMatch(rows[39][23],/Burdened|Stressed/);
 output.push({name,passed:true,lengths:diff.lengths,darts: darts?800:0,total});
}
console.log(JSON.stringify(output,null,2));
