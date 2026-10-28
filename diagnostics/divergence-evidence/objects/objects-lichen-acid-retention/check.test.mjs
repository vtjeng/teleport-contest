import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {POT_ACID,CORPSE} from '../../../../js/objects.js';import {PM_LICHEN} from '../../../../js/monsters.js';
for(const variant of ['acid','diluted'])test(`${variant} lichen dip reports color and retains reagent`,async()=>{
 const s=JSON.parse(readFileSync(new URL(variant+'-capture-c.json',import.meta.url))).segments[0];let boundary=null;
 const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});assert.equal(boundary,null);assert.equal(g.getScreens().length,s.steps.length);
 const color=variant==='acid'?'red':'orange';for(const screens of [s.steps.map(x=>x.screen),g.getScreens()]){assert.ok(screens.some(x=>x.includes('The lichen corpse turns '+color+' around the edges.')));assert.ok(screens.some(x=>x.includes('Call a white potion:')));assert.ok(screens.at(-1).includes('lichen corpse'));assert.ok(screens.at(-1).includes('white potion'));}
 const inv=[];for(let o=game.invent;o;o=o.nobj)inv.push(o);const reagent=inv.find(o=>o.otyp===POT_ACID);assert.equal(reagent.quan,1);assert.equal(Boolean(reagent.in_use),false);assert.equal(Boolean(reagent.odiluted),variant==='diluted');assert.equal(inv.find(o=>o.otyp===CORPSE).corpsenm,PM_LICHEN);
});
