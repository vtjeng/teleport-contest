#!/usr/bin/env node
// do.c zombify_mon production timeout witnesses; species/role/location and
// no-zombie-form variations use independent C-first recipes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {ZOMBIFY_MON} from '../js/const.js';
import {PM_HUMAN_ZOMBIE, PM_GNOME_ZOMBIE, PM_LICHEN, PM_NEWT} from '../js/monsters.js';
import {CORPSE} from '../js/objects.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';
const CASES=['human-floor','gnome-inventory','no-form-floor','blocked-carried-no-form','blocked-floor-multiple-timers','wielded-no-form','ordinary-carried'];
function recipe(name){const p=new URL(name==='ordinary-carried'?'../recipes/dig.c/rot-corpse-carried-independent.session.json':`../recipes/do.c/zombify-mon-${name}.session.json`,import.meta.url);return validateCleanRecipe(JSON.parse(readFileSync(p,'utf8')),p.pathname);}
async function verifySegment(segment){
    const name=CASES.find(name=>recipe(name).segments[0].seed===segment.seed);
    assert.ok(name);
    let boundary;
    await runSegment(segment,{onBoundary:error=>{boundary=error;}});
    assert.equal(boundary,undefined);
    for(let t=game.gt.timer_base;t;t=t.next)assert.notEqual(t.func_index,ZOMBIFY_MON,'production callback has drained the zombie timer');
    const recording=JSON.parse(readFileSync(new URL(name==='ordinary-carried'?'../recordings/dig.c/rot-corpse-carried-independent.session.json':`../recordings/do.c/zombify-mon-${name}.session.json`,import.meta.url),'utf8'));
    const screens=recording.segments[0].steps.map(step=>step.screen);
    if(name==='ordinary-carried'){
        assert.ok(screens.some(screen=>screen.includes('Your newt corpse rots away.')));
        for(let obj=game.invent;obj;obj=obj.nobj)
            assert.ok(obj.otyp!==CORPSE||obj.corpsenm!==PM_NEWT,'ordinary ROT_CORPSE removed the carried newt');
    }else if(name==='blocked-carried-no-form'||name==='wielded-no-form'){
        assert.ok(screens.some(screen=>screen.includes(name==='wielded-no-form'?'Your wielded lichen corpse rots away!':'Your lichen corpse rots away.')));
        for(let obj=game.invent;obj;obj=obj.nobj)
            assert.ok(obj.otyp!==CORPSE||obj.corpsenm!==PM_LICHEN,'production inventory rot removed the lichen corpse');
        if(name==='wielded-no-form')assert.equal(game.uwep,null,'rot removed the wielded corpse');
    }else if(name==='no-form-floor'||name==='blocked-floor-multiple-timers'){
        const species=name==='no-form-floor'?PM_LICHEN:PM_NEWT;
        assert.ok(screens.some(screen=>screen.includes(name==='no-form-floor'?'You drop a lichen corpse.':'You drop a newt corpse.')));
        for(let obj=game.level.objects[game.u.ux][game.u.uy];obj;obj=obj.nexthere)
            assert.ok(obj.otyp!==CORPSE||obj.corpsenm!==species,'production rot consumed the dropped no-form corpse');
    }else{
        const species=name==='human-floor'?PM_HUMAN_ZOMBIE:PM_GNOME_ZOMBIE;
        const monsters=[];for(let m=game.level.monlist;m;m=m.nmon)monsters.push(m);
        assert.ok(monsters.some(m=>m.data===game.mons[species]&&m.mrevived));
        assert.ok(screens.some(screen=>name==='human-floor'
            ? screen.includes('The human zombie rises from the dead!')
            : screen.includes('You feel squirming in your backpack!')));
    }
}
export async function runZombifyMatrix(){return runFreshMatrix({entries:CASES.map(name=>({label:name,recipe:recipe(name)})),summaryLabel:'ZOMBIFY MON',chunkLimit:1,verifySegment});}
runMatrixCli(import.meta.url,runZombifyMatrix,'do.c zombie timeout');
