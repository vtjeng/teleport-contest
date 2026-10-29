import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-menu-request';const result=[];
for(const name of ['weapons-only','coins-only','all-types']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,name==='all-types');assert.equal(diff.rngMismatch,null);
 const decode=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());const rows=c.segments[0].steps.map(s=>decode(s.screen));for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 if(name!=='all-types'){
  assert.equal(diff.screenMismatch.index,132);assert.equal(diff.cursorMismatch.index,132);const cMenu=rows[132],jsMenu=decode(j.screens[132]);assert.equal(cMenu.some(x=>x.includes('900 arrows')),name==='weapons-only');assert.equal(cMenu.some(x=>x.includes('49 gold pieces')),name==='coins-only');assert.ok(jsMenu.some(x=>x.includes('900 arrows')));assert.ok(jsMenu.some(x=>x.includes('49 gold pieces')));
 }
 const inv=rows.findLast(r=>r.some(x=>x.includes('a - a +1 spear')));assert.equal(inv.some(x=>x.includes('860 arrows (860 aum)')),name!=='coins-only');assert.match(inv[23],new RegExp(`\\$:${name==='coins-only'?49:0} `));assert.doesNotMatch(inv[23],/Burdened/);
 assert.deepEqual(decodeScreen(j.screens.at(-1)),decodeScreen(c.segments[0].steps.at(-1).screen));
 result.push({name,...diff});
}
console.log(JSON.stringify(result,null,2));
