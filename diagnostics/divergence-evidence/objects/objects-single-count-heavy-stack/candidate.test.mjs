// Deliberately failing candidate, outside default CI.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {ROCK} from '../../../../js/objects.js';
for(const [variant,count] of [['target',1],['control',2]])test(`${variant}: pick up ${count} from heavy floor stack`,async()=>{
 const s=JSON.parse(readFileSync(new URL(variant+'-capture-c.json',import.meta.url))).segments[0];const boundaries=[];
 const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundaries.push(e.reason??e.message??e.name)});
 assert.deepEqual(boundaries,[],'supported counted pickup must not hit a command boundary');assert.equal(g.getScreens().length,s.steps.length);
 let carried=0;for(let o=game.invent;o;o=o.nobj)if(o.otyp===ROCK)carried+=o.quan;assert.equal(carried,count);
 let floor=0;for(let o=game.level.objects[game.u.ux][game.u.uy];o;o=o.nexthere)if(o.otyp===ROCK)floor+=o.quan;assert.equal(floor,1000-count);
 const expected=count===1?'e - a rock.':'e - 2 rocks.';assert.ok(g.getScreens().some(x=>x.includes(expected)));assert.ok(s.steps.some(x=>x.screen.includes(expected)));
});
