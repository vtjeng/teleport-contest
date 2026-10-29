import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-depth-three';const result=[];
for(const name of ['target','control']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));const delta=name==='target'?1:0;
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 for(const [i,letter,weight]of [[90,'g',830],[98,'f',845],[106,'e',860],[115,'e',860],[124,'f',845],[133,'g',830],[143,'g',829]])assert.ok(rows[i].some(x=>x.includes(`${letter} - a bag containing 1 item (${weight+delta} aum)`)));
 for(const i of [111,148])assert.doesNotMatch(rows[i][23],/Burdened/);
 assert.equal(rows[152][23].includes('Burdened'),!!delta);assert.ok(rows[152].some(x=>x.includes('h - an arrow (1 aum)')));
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
