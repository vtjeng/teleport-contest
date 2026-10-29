import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const screen=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
const output=[];
const base='diagnostics/divergence-evidence/carrying-capacity/public-gold-limit';
for(const [name,finalQty] of [['partial-gold',49],['all-gold',50],['room-control',50]]) {

 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);const rows=rec.segments[0].steps.map(t=>screen(t.screen));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}

 assert.equal(diff.passed,name==='room-control');
 assert.match(rows[58].find(l=>l.includes(' $ - ')),/a gold piece \(1 aum\)/);
 assert.ok(rows[62].some(l=>l.includes(`$ - ${finalQty} gold pieces (1 aum)`)));
 assert.ok(rows[66].some(l=>l.includes(`$ - ${finalQty} gold pieces (1 aum)`)));
 if(name==='partial-gold'){assert.match(rows[60][0],/only lift some of the 49 gold pieces/);assert.match(rows[64][0],/cannot lift any more/);}
 if(name!=='room-control') {assert.equal(diff.screenMismatch.index,60);assert.equal(js.screens.length,60);assert.equal(rows.length,68);const boundary=JSON.parse(readFileSync(`${base}/${name==='partial-gold'?'partial':'all'}-boundary.json`));assert.equal(boundary.boundaries.length,1);assert.match(boundary.boundaries[0].message,/pickup\(\) requiring a partial or failed lift/);}
 output.push({name,passed:diff.passed,lengths:diff.lengths,cFinalGold:finalQty,firstMismatch:diff.screenMismatch});
}
console.log(JSON.stringify(output,null,2));
