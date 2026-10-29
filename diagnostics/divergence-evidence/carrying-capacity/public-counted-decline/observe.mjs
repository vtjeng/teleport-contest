import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-counted-decline';const result=[];
for(const name of ['decline','quit','accept']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 assert.match(rows[107][0],/removing 861 arrows.*Continue/);const inv=rows[111];assert.match(inv[23],new RegExp(`\\$:${name==='quit'?0:49} `));assert.equal(inv[23].includes('Burdened'),name==='accept');assert.equal(inv.some(x=>x.includes('861 arrows (861 aum)')),name==='accept');const last=rows.at(-1);assert.ok(last.some(x=>x.includes(name==='accept'?'39 arrows (39 aum)':'900 arrows (900 aum)')));assert.equal(last.some(x=>x.includes('49 gold pieces')),name==='quit');
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
