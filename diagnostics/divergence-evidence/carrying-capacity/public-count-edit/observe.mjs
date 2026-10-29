import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-count-edit';const result=[];
for(const [name,arrows,gold,left]of [['reselect',860,0,40],['reselect-accept',860,49,40],['cancel',0,0,900],['clamp',900,49,0]]){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const inv=rows.findLast(r=>r.some(x=>x.includes('a - a +1 spear')));assert.match(inv[23],new RegExp(`\\$:${gold} `));assert.equal(inv[23].includes('Burdened'),arrows===900);assert.equal(inv.some(x=>x.includes(`${arrows} arrows (${arrows} aum)`)),arrows>0);
 const last=rows.at(-1);if(left)assert.ok(last.some(x=>x.includes(`${left} arrows (${left} aum)`)));else assert.match(last[0],/bag is empty/);
 assert.equal(last.some(x=>x.includes('49 gold pieces')),gold===0);
 if(name.startsWith('reselect'))assert.ok(rows.some(r=>/removing 49 gold pieces.*Continue/.test(r[0])));
 result.push({name,arrows,gold,remainingArrows:left,...diff});
}
console.log(JSON.stringify(result,null,2));
