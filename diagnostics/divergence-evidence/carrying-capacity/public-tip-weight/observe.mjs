import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-tip-weight';const results=[];
for(const name of ['floor','sack']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const r=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const rows of r){assert.match(rows[23],/HP:16\(16\)/);assert.doesNotMatch(rows[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const has=(i,re)=>assert.ok(r[i].some(x=>re.test(x)));
 has(125,/f - an empty bag \(15 aum\)/);has(125,/g - an arrow \(1 aum\)/);
 if(name==='floor'){has(125,/e - an empty bag \(15 aum\)/);assert.doesNotMatch(r[125][23],/Burdened/);has(130,/g - 831 arrows \(831 aum\)/);assert.match(r[130][23],/Burdened/);}
 else{has(125,/e - a bag containing 1 item \(845 aum\)/);assert.match(r[125][23],/Burdened/);assert.equal(diff.lengths.animFrames.c,1);}
 results.push({name,...diff});
}
console.log(JSON.stringify(results,null,2));
