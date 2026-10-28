// Deliberately failing implementation candidate. Not part of default CI.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {ART_SUNSWORD} from '../../../../js/artifacts.js';import {LONG_SWORD} from '../../../../js/objects.js';import {PM_GIANT_BAT} from '../../../../js/monsters.js';
for(const variant of ['target','control'])test(`${variant}: polymorph drops weapon and completes`,async()=>{
 const s=JSON.parse(readFileSync(new URL(variant+'-capture-c.json',import.meta.url))).segments[0];let boundary=null;
 const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});
 assert.equal(boundary,null);assert.equal(g.getScreens().length,s.steps.length);assert.equal(game.u.umonnum,PM_GIANT_BAT);assert.equal(game.uwep,null);
 let dropped;for(let o=game.level.objlist;o;o=o.nobj)if(variant==='target'?o.oartifact===ART_SUNSWORD:o.otyp===LONG_SWORD)dropped=o;
 assert.ok(dropped,'weapon is now on the floor');assert.equal(Boolean(dropped.lamplit),false);
 for(let light=game.gl.light_base;light;light=light.next)assert.notEqual(light.id,dropped,'dropped sword no longer owns a light');
 if(variant==='target')assert.ok(g.getScreens().some(x=>x.includes('The long sword named Sunsword stops shining.')));
});
