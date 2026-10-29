import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-container-order';const result=[];
const expected={ 'coins-first':[50,2758], 'arrows-first':[49,2759], 'auto-all':[50,2758], 'explicit-count':[49,2759], 'rejected-split':[49,2759], 'accepted-split':[50,2758], 'auto-coins':[50,0], 'auto-weapons':[1,2759] };
for(const [name,[gold,arrows]]of Object.entries(expected)){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const inventory=rows.findLast(r=>r.some(x=>x.includes('a - a +1 spear')));
 assert.match(inventory[23],new RegExp(`\\$:${gold} `));assert.equal(inventory[23].includes('Overtaxed'),arrows>0);
 if(arrows)assert.ok(inventory.some(x=>x.includes(`f - ${arrows} arrows (${arrows} aum)`)));else assert.ok(!inventory.some(x=>x.includes('arrows')));
 if(name.endsWith('-split')){const left=name==='rejected-split'?49:48;assert.ok(rows.at(-1).some(x=>x.includes(`$ - ${left} gold pieces (1 aum)`)));assert.doesNotMatch(rows.at(-1)[23],/Overtaxed/);}
 result.push({name,carriedGold:gold,carriedArrows:arrows,inventoryTotal:90+arrows+Math.trunc((gold+50)/100),...diff});
}
console.log(JSON.stringify(result,null,2));
