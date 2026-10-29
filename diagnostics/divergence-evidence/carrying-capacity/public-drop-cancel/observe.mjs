import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-drop-cancel';const results=[];
for(const name of ['cancel','filtered-control']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const rows=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const end=rows[44];assert.ok(end.some(r=>r.trim()===`e - ${name==='cancel'?861:860} arrows`));assert.ok(end.some(r=>r.trim()==='$ - 49 gold pieces'));assert.equal(end[23].includes('Burdened'),name==='cancel');results.push({name,...diff});
}
console.log(JSON.stringify(results,null,2));
