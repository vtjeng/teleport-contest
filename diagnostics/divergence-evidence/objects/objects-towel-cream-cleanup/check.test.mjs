import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {TOWEL} from '../../../../js/objects.js';import {BLINDED,TIMEOUT} from '../../../../js/const.js';
for(const variant of ['wet','dry'])test(`${variant} wielded towel cleans cream blindness and updates wetness`,async()=>{
 const s=JSON.parse(readFileSync(new URL(variant+'-capture-c.json',import.meta.url))).segments[0];let boundary=null;
 const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});
 assert.equal(boundary,null);assert.equal(g.getScreens().length,s.steps.length);
 for(const screens of [s.steps.map(x=>x.screen),g.getScreens()]){assert.ok(screens.some(x=>x.includes('You immerse your face in the cream pie.')));assert.ok(screens.some(x=>x.includes("You've got the glop off.")&&x.includes('You can see again.')));assert.equal(screens.some(x=>x.includes('Your wet towel (4) dries.')),variant==='wet');}
 assert.equal(game.u.ucreamed,0);assert.equal(game.u.uprops[BLINDED].intrinsic&TIMEOUT,0);
 assert.equal(game.uwep.otyp,TOWEL);assert.equal(game.uwep.spe,variant==='wet'?3:0);assert.equal(Boolean(game.unweapon),variant==='dry');
});
