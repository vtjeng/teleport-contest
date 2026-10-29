import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';
import{decodeScreen}from'../../../../frozen/screen-decode.mjs';import{compareSessionOutputs}from'../../../../scripts/diff-fresh.mjs';import{runSegment}from'../../../../js/jsmain.js';import{game}from'../../../../js/gstate.js';
const initial=[[12,12,7,7,1,0],[20,20,19,19,2,20],[18,20,19,19,2,20]];
const depleted=[...initial,[14,20,19,19,2,20],[10,20,19,19,2,20],[5,20,19,19,2,20]];
const expected={control:initial,target:[...initial,[20,22,31,31,3,40],[18,20,19,19,2,39],[10,12,7,7,1,19]],'floor-control':depleted,'floor-target':[...depleted,[1,12,7,7,1,19]]};
for(const[name,states]of Object.entries(expected)){
 const read=f=>JSON.parse(gunzipSync(readFileSync(new URL(`${name}/${f}.gz`,import.meta.url))));const c=read('recorded.session.json'),js=read('js-output.json');assert.equal(compareSessionOutputs(c,js).passed,true);
 const actual=[];for(const s of c.segments[0].steps){const row=decodeScreen(s.screen).map(r=>r.map(x=>x.ch).join('')).find(r=>r.includes('Xp:'));if(!row)continue;const m=row.match(/HP:(\d+)\((\d+)\) Pw:(\d+)\((\d+)\).*Xp:(\d+)\/(\d+)/);assert.ok(m);const values=m.slice(1).map(Number);if(JSON.stringify(values)!==JSON.stringify(actual.at(-1)))actual.push(values);}assert.deepEqual(actual,states);
 const draws=c.segments[0].steps.flatMap(s=>s.rng).filter(s=>s.includes('kick_ouch'));const wounded=draws.filter(s=>s.startsWith('rn2(3)')).map(s=>Number(s.match(/=(\d+)/)[1]));const damage=draws.filter(s=>s.startsWith('rnd(5)')).map(s=>Number(s.match(/=(\d+)/)[1]));assert.deepEqual(wounded,name.startsWith('floor')?[2,1,1,2]:[2]);assert.deepEqual(damage,name.startsWith('floor')?[2,4,5,5]:[2]);
 const segment=JSON.parse(readFileSync(new URL(`recipes/${name}.json`,import.meta.url))).segments[0];await runSegment(segment,{onBoundary:e=>{throw e}});assert.deepEqual([game.u.uhp,game.u.uhpmax,game.u.uen,game.u.uenmax,game.u.ulevel,game.u.uexp],states.at(-1));assert.equal(game.u.uhpinc[1],8);assert.equal(game.u.uprops[26].intrinsic,0);assert.equal(game.u.uprops[26].extrinsic,0);
 console.log(JSON.stringify({name,states,damage,woundedBranchDraws:wounded,jsSavedHPIncrement:8,fullParity:true}));
}
