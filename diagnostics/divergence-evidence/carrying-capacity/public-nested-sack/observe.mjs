import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-nested-sack';const results=[];
for(const name of ['target','control']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const r=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));const delta=name==='target'?1:0;
 const has=(i,re)=>assert.ok(r[i].some(x=>re.test(x)),`${name}:${i} ${re}`);
 for(const rows of r){assert.match(rows[23],/HP:16\(16\)/);assert.doesNotMatch(rows[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 has(68,new RegExp(`f - a bag containing 1 item \\(${845+delta} aum\\)`));
 has(76,new RegExp(`e - a bag containing 1 item \\(${860+delta} aum\\)`));
 assert.doesNotMatch(r[81][23],/Burdened/);
 has(94,/e - an empty bag \(15 aum\)/);
 has(104,new RegExp(`f - a bag containing 1 item \\(${844+delta} aum\\)`));has(104,/g - an arrow \(1 aum\)/);
 assert.doesNotMatch(r[109][23],/Burdened/);assert.equal(r[113][23].includes('Burdened'),!!delta);
 results.push({name,...diff});
}
console.log(JSON.stringify(results,null,2));
