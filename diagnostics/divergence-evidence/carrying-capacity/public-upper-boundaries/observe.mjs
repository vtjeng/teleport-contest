import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const base='diagnostics/divergence-evidence/carrying-capacity/public-upper-boundaries';
const report=[];
const screen=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
for(const [name,qty,lower,upper] of [['stressed',1336,'Burdened','Stressed'],['strained',1811,'Stressed','Strained'],['overtaxed',2286,'Strained','Overtaxed'],['admission-limit',2760,'Overtaxed','Overloaded']]) {
 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);const rows=rec.segments[0].steps.map(t=>screen(t.screen));
 assert.equal(rows.length,40);
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}
 const counts=name==='admission-limit'?[qty,qty-1,qty-2,qty-1,qty-1]:[qty,qty-1,qty-2,qty-1,qty];
 const states=name==='admission-limit'?[upper,lower,lower,lower,lower]:[upper,upper,lower,upper,upper];
 const observations=[17,23,29,34,38].map((step,i)=>{
  const r=rows[step],items=r.filter(l=>/^\s+[a-z] - .*\(\d+ aum\)/.test(l));
  assert.equal(items.length,5);
  assert.ok(items.some(l=>l.includes(`e - ${counts[i]} arrows (${counts[i]} aum)`)));
  const total=items.reduce((n,l)=>n+Number(l.match(/\((\d+) aum\)/)[1]),0);
  assert.equal(total,90+counts[i]);assert.ok(r[23].endsWith(states[i]));
  return {step,arrows:counts[i],total,cStatus:states[i],jsStatus:screen(js.screens[step])[23]};
 });
 if(name==='admission-limit') {
  assert.equal(diff.passed,false);assert.equal(diff.screenMismatch.index,21);
  assert.equal(diff.rngMismatch,null);assert.equal(diff.cursorMismatch,null);
  assert.ok(rows[21][23].endsWith('Overtaxed'));assert.ok(screen(js.screens[21])[23].endsWith('Overloaded'));
  assert.match(rows[36][0],/cannot lift any more/);
 } else assert.equal(diff.passed,true);
 report.push({name,qualified:true,passed:diff.passed,observations});
}
console.log(JSON.stringify(report,null,2));
