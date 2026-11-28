import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {decodeScreen} from '../../../../frozen/screen-decode.mjs';
import {compareSessionOutputs} from '../../../../scripts/diff-fresh.mjs';
import {runSegment} from '../../../../js/jsmain.js';
import {game} from '../../../../js/gstate.js';
for (const [name,suffix,power,max,peak] of [['control',' yet',7,7,7],['target',' anymore',7,7,19],['depleted-control','',12,19,19]]) {
 const read=f=>JSON.parse(gunzipSync(readFileSync(new URL(`${name}/${f}.gz`,import.meta.url))));
 const c=read('recorded.session.json'),js=read('js-output.json');assert.equal(compareSessionOutputs(c,js).passed,true);
 const screens=c.segments[0].steps.map(s=>decodeScreen(s.screen).map(r=>r.map(x=>x.ch).join('')).join('\n'));
 const expected=`You don't have enough energy to cast that spell${suffix}.`;assert.ok(screens.some(s=>s.includes(expected)),expected);
 const status=`Pw:${power}(${max})`;assert.ok(screens.at(-1).includes(status));
 const draws=c.segments[0].steps.flatMap(s=>s.rng).filter(s=>s.includes('spelleffects_check'));assert.equal(draws.length,name==='depleted-control'?1:0);
 const segment=JSON.parse(readFileSync(new URL(`recipes/${name}.json`,import.meta.url))).segments[0];let boundary;await runSegment(segment,{onBoundary:e=>boundary=e});if(boundary)throw boundary;assert.deepEqual([game.u.uen,game.u.uenmax,game.u.uenpeak],[power,max,peak]);
 console.log(JSON.stringify({name,expected,displayedPower:status,jsPeak:peak,spellCheckDraws:draws.length,fullParity:true}));
}
