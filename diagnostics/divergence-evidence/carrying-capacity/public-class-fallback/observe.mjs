import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-class-fallback';const result=[];
for(const name of ['empty','absent-dismissed','explicit-all']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);const control=name==='explicit-all';assert.equal(diff.passed,control);assert.equal(diff.rngMismatch,null);
 const decode=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());const rows=c.segments[0].steps.map(s=>decode(s.screen));for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 assert.match(rows.at(-1)[0],/^Take out: 49 gold pieces/);assert.match(decode(j.screens.at(-1))[0],control?/^Take out: 49 gold pieces/:/^What kinds of thing do you want to take out/);
 if(!control)assert.equal(diff.screenMismatch.index,name==='empty'?130:132);
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
