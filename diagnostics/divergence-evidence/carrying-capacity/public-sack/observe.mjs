import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-sack';
const result=[];
for(const name of ['remove-cycle','gold-roundtrip-49','gold-roundtrip-50']) {
 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);assert.equal(diff.passed,true);
 const rows=rec.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const has=(step,re)=>assert.ok(rows[step].some(r=>re.test(r)),`${name}:${step} ${re}`);
 if(name==='remove-cycle') {
  has(47,/bag containing 1 item \(861 aum\)/);assert.doesNotMatch(rows[52][23],/Burdened/);
  has(56,/bag containing 1 item \(861 aum\)/);has(66,/bag containing 1 item \(860 aum\)/);
  has(66,/f - an arrow \(1 aum\)/);assert.doesNotMatch(rows[71][23],/Burdened/);
  assert.match(rows[75][23],/Burdened/);has(84,/f - 846 arrows \(846 aum\)/);has(84,/empty bag \(15 aum\)/);
 } else {
  const count=Number(name.slice(-2));has(55,new RegExp(`\\$ - ${count} gold pieces`));
  has(63,/bag containing 1 item \(16 aum\)/);assert.match(rows[63][23],/\$:0.*Burdened/);
  has(72,/empty bag \(15 aum\)/);has(72,new RegExp(`\\$ - ${count} gold pieces`));
  for(const i of [55,72])assert.equal(rows[i][23].includes('Burdened'),count===50);
 }
 result.push({name,passed:true,lengths:diff.lengths});
}
console.log(JSON.stringify(result,null,2));
