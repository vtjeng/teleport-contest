import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-large-menu-count';const result=[];
for(const name of ['unsafe-prefix','safe-control']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);const target=name==='unsafe-prefix';assert.equal(diff.passed,!target);
 const decode=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());const rows=c.segments[0].steps.map(s=>decode(s.screen));for(const r of [...rows,...j.screens.map(decode)]){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 assert.match(rows.at(-1)[0],/removing 900 arrows.*Continue/);assert.match(decode(j.screens.at(-1))[0],target?/^f - an arrow \(1 aum\)/:/removing 900 arrows.*Continue/);
 if(target){assert.equal(diff.screenMismatch.index,120);assert.equal(diff.rngMismatch.index,2382);assert.equal(diff.lengths.rng.c,2382);assert.equal(diff.lengths.rng.js,2395);}
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
