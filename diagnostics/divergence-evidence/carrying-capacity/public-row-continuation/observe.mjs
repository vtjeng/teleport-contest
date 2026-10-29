import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-row-continuation';const result=[];
for(const name of ['rejected-middle','accepted-middle']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);const accepted=name==='accepted-middle';
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const inv=rows[198];assert.match(inv[23],new RegExp(`\\$:${accepted?49:1} .*Overtaxed`));assert.ok(inv.some(x=>x.includes(`f - ${accepted?2758:2759} arrows`)));assert.equal(inv.some(x=>x.includes('h - a dart')),accepted);
 const last=rows.at(-1);assert.ok(last.some(x=>x.includes(accepted?'a - a dart (1 aum)':'a - 2 darts (2 aum)')));assert.ok(last.some(x=>x.includes(accepted?'b - a gold piece (1 aum)':'b - 49 gold pieces (1 aum)')));
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
