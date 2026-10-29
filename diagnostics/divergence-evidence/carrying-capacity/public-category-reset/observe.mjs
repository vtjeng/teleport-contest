import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-category-reset';const results=[];const finals=[];
for(const name of ['after-empty','fresh-control']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const end=rows.at(-2);for(const item of ['e - 860 arrows','$ - 49 gold pieces','a - a +1 spear (weapon in right hand)','b - a +0 dagger (alternate weapon; not wielded)','c - an uncursed +3 small shield (being worn)','d - an uncursed food ration'])assert.ok(end.some(r=>r.trim()===item));assert.doesNotMatch(end[23],/Burdened/);
 if(name==='after-empty'){assert.ok(rows[51].some(r=>r.trim()==='e - 861 arrows'));assert.match(rows[51][23],/Burdened/);}
 finals.push(c.segments[0].steps.at(-2).screen);results.push({name,finalArrows:860,finalGold:49,derivedWeight:950,...diff});
}
assert.equal(finals[0],finals[1]);console.log(JSON.stringify(results,null,2));
