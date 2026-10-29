import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-sack-menu';const results=[];
for(const name of ['insert','no-weight-control']) {
 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);assert.equal(diff.passed,name==='no-weight-control');assert.equal(diff.rngMismatch,null);
 const decode=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
 const cRows=rec.segments[0].steps.map(s=>decode(s.screen));
 for(const r of cRows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 if(name==='insert') {
  assert.equal(diff.screenMismatch.index,44);assert.equal(diff.cursorMismatch.index,44);
  assert.ok(cRows[44].some(r=>r.includes('(weapon in right hand, 30 aum)')));
  assert.ok(cRows[50].some(r=>r.includes('bag containing 1 item (861 aum)')));
 }
 results.push({name,...diff});
}
console.log(JSON.stringify(results,null,2));
