import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {runSegment} from '../../../../js/jsmain.js';import {game} from '../../../../js/gstate.js';import {POT_HEALING,POT_EXTRA_HEALING,POT_GAIN_ENERGY} from '../../../../js/objects.js';
for(const variant of ['whole','diluted'])test(`${variant} healing stack splits before alchemy outcome`,async()=>{
 const s=JSON.parse(readFileSync(new URL(variant+'-capture-c.json',import.meta.url))).segments[0];let boundary=null;
 const g=await runSegment({seed:s.seed,datetime:s.datetime,nethackrc:s.nethackrc,moves:s.moves},{onBoundary:e=>boundary=e.message});assert.equal(boundary,null);assert.equal(g.getScreens().length,s.steps.length);
 const whole=variant==='whole';for(const screens of [s.steps.map(x=>x.screen),g.getScreens()]){assert.ok(screens.some(x=>x.includes((whole?'4':'2')+' of the ruby potions mix with the cloudy potion...')));assert.equal(screens.some(x=>x.includes('BOOM!  They explode!')),whole);assert.ok(screens.at(-1).includes((whole?'4 ruby potions':'6 diluted ruby potions')));}
 const inv=[];for(let o=game.invent;o;o=o.nobj)inv.push(o);assert.equal(inv.find(o=>o.otyp===POT_HEALING).quan,whole?4:6);assert.equal(inv.filter(o=>o.otyp===POT_GAIN_ENERGY).length,0);
 if(whole){assert.equal(inv.filter(o=>o.otyp===POT_EXTRA_HEALING).length,0);assert.equal(game.u.uhp,7);}else{const mixed=inv.find(o=>o.otyp===POT_EXTRA_HEALING);assert.equal(mixed.quan,2);assert.ok(mixed.odiluted);}
 const rng=s.steps.flatMap(x=>x.rng||[]);assert.equal(rng.some(x=>x.includes('rnd(6)=2 @ potion_dip')),whole);
});
