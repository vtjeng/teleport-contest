import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-multi-drop';
const results=[];
for(const name of ['one-arrow','two-arrows','combination']) {
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const check=(i,arrows,gold,burdened)=>{assert.ok(rows[i].some(r=>r.trim()===`e - ${arrows} arrows`));assert.ok(rows[i].some(r=>r.trim()===`$ - ${gold} gold pieces`));assert.equal(rows[i][23].includes('Burdened'),burdened);};
 check(33,861,49,true);check(46,name==='two-arrows'?859:860,48,false);
 if(name!=='combination')check(54,861,49,true);
 results.push({name,derivedWeights:name==='two-arrows'?[951,949,951]:name==='combination'?[951,950]:[951,950,951],...diff});
}
console.log(JSON.stringify(results,null,2));
