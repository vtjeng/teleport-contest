import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {decodeScreen} from '../../../../frozen/screen-decode.mjs';import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-floor-sack';const results=[];
for(const name of ['partial-cycle','all-fit-cycle']){
 const c=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const j=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));const diff=compareSessionOutputs(c,j);assert.equal(diff.passed,true);
 const r=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const rows of r){assert.match(rows[23],/HP:16\(16\)/);assert.doesNotMatch(rows[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 assert.ok(r[115].some(x=>x.includes('f - 2759 arrows (2759 aum)')));assert.match(r[115][23],/Overtaxed/);
 assert.doesNotMatch(r.at(-1)[23],/Burdened|Stressed|Strained|Overtaxed|Overloaded/);
 if(name==='partial-cycle')assert.ok(r.at(-1).some(x=>x.includes('a - an arrow (1 aum)')));
 else assert.ok(r.at(-1).some(x=>x.includes('The bag is empty.')));
 results.push({name,...diff});
}
console.log(JSON.stringify(results,null,2));
