#!/usr/bin/env node
// artifact.c invoke_blinding_ray: independent Knight seed chosen directly.
// Cheap direction, BUC, blindness and controlled-form variations establish
// source reachability without searching for generation-dependent state.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BLINDED,TIMEOUT} from '../js/const.js';
import {ART_SUNSWORD} from '../js/artifacts.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_GREMLIN} from '../js/monsters.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';
const names=['up','down','cancel','self','self-blessed','self-cursed',
    'self-gremlin','self-blind','empty-horizontal'];
export function loadBlindingRayCases(){
    return names.map(name=>({name,recipe:validateCleanRecipe(JSON.parse(readFileSync(
        new URL(`../recipes/artifact.c/c119-blinding-ray-${name}.session.json`,import.meta.url))),name)}));
}
export async function verifyBlindingRaySegment(segment){
    const entry=loadBlindingRayCases().find(({recipe})=>recipe.segments[0].moves===segment.moves);
    assert.ok(entry);let boundary;
    const replay=await runSegment(segment,{onBoundary(error){boundary=error;}});
    assert.equal(boundary,undefined,'the input reaches artifact invocation');
    let sword;for(let obj=game.invent;obj;obj=obj.nobj)if(obj.oartifact===ART_SUNSWORD)sword=obj;
    assert.ok(sword,'the independently wished Sunsword is carried');
    const screens=replay.getScreens().join('\n');
    assert.match(screens,/In what direction\?/u,'#invoke reached its direction prompt');
    if(entry.name==='cancel'){
        assert.equal(sword.age,game.moves,'cancellation resets cooldown to current moves');
        assert.match(screens,/Never mind\./u);
    }else{
        assert.ok(sword.age>game.moves,'accepted direction retains the source cooldown');
        if(entry.name==='up'||entry.name==='down'){
            assert.equal(game.level.at(game.u.ux,game.u.uy).lit,true);
            assert.match(screens,/A lit field surrounds you!/u);

        }else if(entry.name==='self-blind')assert.match(screens,/Nothing seems to happen\./u);
        else if(entry.name.startsWith('self')){
            assert.ok(game.u.uprops[BLINDED].intrinsic&TIMEOUT);
            assert.match(screens,/You are blinded by the flash!/u);
            if(entry.name==='self-gremlin'){
                assert.match(screens,/Ow, that light hurts/u);
                assert.equal(game.u.umonnum,PM_GREMLIN);
                assert.ok(game.u.mh<game.u.mhmax,'existing lightdamage decreased form HP');
            }
        }else assert.equal(sword.ox,game.u.ux,'do_blinding_ray stores its source coordinates');
    }
    for(const gap of ['artifact.c do_blinding_ray','light.c litroom','zap.c flashburn','light.c lightdamage'])
        assert.equal(game.unported.has(gap),false);
}
export async function runBlindingRayMatrix(){
    return runFreshMatrix({entries:loadBlindingRayCases().map(({name,recipe})=>({label:name,recipe})),
        verifySegment:verifyBlindingRaySegment,summaryLabel:'ARTIFACT BLINDING RAY',chunkLimit:1});
}
runMatrixCli(import.meta.url,runBlindingRayMatrix,'artifact blinding ray');
