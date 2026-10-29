import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-look-restart';const result=[];
for(const name of ['look-then-class','look-only']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);const target=name==='look-then-class';assert.equal(diff.passed,!target);assert.equal(diff.rngMismatch,null);
 const decode=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());const rows=c.segments[0].steps.map(s=>decode(s.screen));for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 assert.match(rows.at(-1)[0],/^What kinds of thing do you want to take out/);
 const lastJs=decode(j.screens.at(-1));assert.match(lastJs[0],target?/^Take out: 900 arrows/:/^What kinds of thing do you want to take out/);
 if(target){assert.equal(diff.screenMismatch.index,133);assert.equal(diff.cursorMismatch.index,133);}
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
