import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-justpicked-merge';const cases=[['single-merged',860,49,false],['multiple-merged',0,49,false],['auto-empty-intersection',861,0,true],['auto-food-intersection',861,49,true],['auto-picked-control',0,49,false]];const results=[];
for(const[name,arrows,gold,burdened]of cases){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const end=rows.at(-2);assert.equal(end.some(r=>r.trim()===`e - ${arrows} arrows`),arrows>0);if(!arrows)assert.ok(!end.some(r=>/e - .*arrows/.test(r)));assert.equal(end.some(r=>r.trim()===`$ - ${gold} gold pieces`),gold>0);assert.ok(end[23].includes(`$:${gold} `));assert.equal(end[23].includes('Burdened'),burdened);
 for(const item of ['a - a +1 spear (weapon in right hand)','b - a +0 dagger (alternate weapon; not wielded)','c - an uncursed +3 small shield (being worn)','d - an uncursed food ration'])assert.ok(end.some(r=>r.trim()===item));
 if(name==='multiple-merged'){const menu=rows[59].join('\n');assert.match(menu,/What would you like to drop/);assert.match(menu,/e - 861 arrows/);assert.match(menu,/\$ - 49 gold pieces/);assert.doesNotMatch(menu,/spear|dagger|shield|ration/);}else assert.ok(rows.some(r=>r.some(x=>x.includes('Just picked up: 861 arrows'))));
 results.push({name,finalArrows:arrows,finalGold:gold,derivedWeight:90+arrows,burdened,...diff});
}
console.log(JSON.stringify(results,null,2));
