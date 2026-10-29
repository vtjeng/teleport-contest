import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
const screen=s=>decodeScreen(s).map(r=>r.map(c=>c.ch).join('').trimEnd());
const output=[];
const total=r=>r.filter(l=>/^\s+[a-z$] - .*\(\d+ aum\)/.test(l)).reduce((n,l)=>n+Number(l.match(/\((\d+) aum\)/)[1]),0);
const base='diagnostics/divergence-evidence/carrying-capacity/public-multi-pickup';const hp=/HP:16\(16\)/;
for(const [name,rocks,arrows,darts] of [['partial-menu',274,4,15],['all-fit-menu',275,4,4]]) {

 const rec=JSON.parse(readFileSync(`${base}/${name}/recorded.session.json`));
 const js=JSON.parse(readFileSync(`${base}/${name}/js-output.json`));
 const diff=compareSessionOutputs(rec,js);assert.equal(diff.passed,true);const rows=rec.segments[0].steps.map(t=>screen(t.screen));
 for(const r of rows){assert.match(r[23],hp);assert.doesNotMatch(r[0],/bites|hits|attacks|zapped|misses|killed|slain/i);}

 const final=rows.length-2;assert.ok(rows[final].some(l=>l.includes(`e - ${rocks} rocks (${rocks*10} aum)`)));assert.ok(rows[final].some(l=>l.includes(`f - ${arrows} arrows (${arrows} aum)`)));assert.ok(rows[final].some(l=>l.includes(`g - ${darts} darts (${darts} aum)`)));assert.equal(total(rows[final]),90+10*rocks+arrows+darts);assert.ok(rows[final][23].endsWith('Overtaxed'));
 if(name==='partial-menu')assert.ok(rows.some(r=>r[0].includes('only lift one of the 2 rocks')));
 output.push({name,passed:true,lengths:diff.lengths,finalStep:final,rocks,arrows,darts,total:total(rows[final])});
}
console.log(JSON.stringify(output,null,2));
