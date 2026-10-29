// Positive target validation on retained public C screens, not constructed state.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-stack-cycle';
const results=[];
for(const [name,initial] of [['target',861],['control',600]]) {
 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const comparison=compareSessionOutputs(rec,js);
 assert.equal(comparison.passed,true);
 const frames=rec.segments[0].steps.map(t=>decodeScreen(t.screen).map(r=>r.map(c=>c.ch).join('').trimEnd()));
 assert.equal(frames.length,39);
 // A setup involving injury/combat would not qualify for this bounded pass.
 for(const r of frames) {
  assert.match(r[23],/HP:16\(16\)/);
  assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);
 }
 const observations=[];
 for(const [index,count] of [[1,0],[16,initial],[22,initial-1],[28,initial-2],[33,initial-1],[37,initial]]) {
  const r=frames[index];
  const itemLines=r.filter(l=>/^\s+[a-z] - .*\(\d+ aum\)/.test(l));
  assert.equal(itemLines.length,count?5:4);
  const total=itemLines.reduce((a,l)=>a+Number(l.match(/\((\d+) aum\)/)[1]),0);
  assert.equal(total,90+count);
  if(count) assert.ok(itemLines.some(l=>l.includes(`e - ${count} arrows (${count} aum)`)));
  assert.match(r[22],/St:18 .*Co:18 /);
  const burdened=r[23].includes('Burdened');
  assert.equal(burdened,total>950);
  observations.push({step:index,arrowQuantity:count,inventoryWeight:total,capacityFromDisplayedAttributes:950,burdened,itemLines});
 }
 assert.match(frames[20][0],/You drop an arrow \(1 aum\)/);
 assert.match(frames[26][0],/You drop an arrow \(1 aum\)/);
 assert.match(frames[31][0],new RegExp(`${initial-1} in total`));
 assert.match(frames[35][0],new RegExp(`${initial} in total`));
 results.push({name,comparison:comparison.lengths,observations});
}
console.log(JSON.stringify({qualified:true,results},null,2));
