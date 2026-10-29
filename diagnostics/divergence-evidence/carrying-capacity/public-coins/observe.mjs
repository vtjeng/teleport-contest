import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const screen=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
const output=[];
const base='diagnostics/divergence-evidence/carrying-capacity/public-coins';
for(const [name,start,steps] of [['round50',50,[35,41,45]],['round150',150,[36,42,46]],['control49',49,[35,41,45]]]) {

 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);const rows=rec.segments[0].steps.map(t=>screen(t.screen));
 for(const r of rows){assert.match(r[23],/HP:16\(16\)/);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}

 assert.equal(diff.passed,true);
 const observations=steps.map((step,i)=>{const qty=start-(i===1?1:0);const line=rows[step].find(l=>l.includes(' $ - '));assert.ok(line.includes(`${qty} gold pieces`));assert.ok(line.includes(`(${Math.max(1,Math.trunc((qty+50)/100))} aum)`));const burden=rows[step][23].endsWith('Burdened');assert.equal(burden,name!=='control49'&&i!==1);return {step,qty,line,status:rows[step][23]};});
 output.push({name,passed:diff.passed,lengths:diff.lengths,observations});
}
console.log(JSON.stringify(output,null,2));
