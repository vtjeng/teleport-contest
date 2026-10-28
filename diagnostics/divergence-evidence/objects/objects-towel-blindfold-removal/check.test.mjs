import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {BLINDFOLD,TOWEL} from '../../../../js/objects.js';
for(const variant of ['removable','stuck'])test(`cursed towel handles ${variant} worn blindfold`,async()=>{
 const s=JSON.parse(readFileSync(new URL(variant+'-capture-c.json',import.meta.url))).segments[0];let boundary=null;
 const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});assert.equal(boundary,null);assert.equal(g.getScreens().length,s.steps.length);
 const expected=variant==='removable'?'You push your blindfold off.':'You push your blindfold cock-eyed.';
 for(const screens of [s.steps.map(x=>x.screen),g.getScreens()])assert.ok(screens.some(x=>x.includes(expected)));
 if(variant==='removable'){assert.equal(game.ublindf,null);for(let o=game.invent;o;o=o.nobj)assert.notEqual(o.otyp,BLINDFOLD);}else{assert.equal(game.ublindf.otyp,BLINDFOLD);assert.ok(game.ublindf.cursed);}
 let towel;for(let o=game.invent;o;o=o.nobj)if(o.otyp===TOWEL)towel=o;assert.ok(towel?.cursed);
 const rng=s.steps.flatMap(x=>x.rng||[]);assert.ok(rng.some(x=>x.includes('rn2(3)=1 @ use_towel')));assert.equal(rng.some(x=>x.includes('rn2(2)=1 @ use_towel')),variant==='stuck');
});
