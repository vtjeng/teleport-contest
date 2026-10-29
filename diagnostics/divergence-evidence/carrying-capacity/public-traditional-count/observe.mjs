import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-traditional-count';const result=[];
for(const name of ['decline','accept','explicit-prefix','yes-no-control']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);const control=name==='yes-no-control';assert.equal(diff.passed,control);assert.equal(diff.rngMismatch,null);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 if(!control){assert.equal(diff.screenMismatch.index,105);assert.equal(diff.screenMismatch.cCell.ch,'#');assert.equal(diff.screenMismatch.jsCell.ch,' ');assert.equal(diff.cursorMismatch.index,105);}
 const inv=rows.findLast(r=>r.some(x=>x.includes('a - a +1 spear')));assert.equal(inv.some(x=>x.includes('861 arrows (861 aum)')),name==='accept');assert.equal(inv[23].includes('Burdened'),name==='accept');assert.ok(rows.at(-1).some(x=>x.includes(name==='accept'?'39 arrows (39 aum)':'900 arrows (900 aum)')));
 assert.deepEqual(decodeScreen(j.screens.at(-1)),decodeScreen(c.segments[0].steps.at(-1).screen));
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
