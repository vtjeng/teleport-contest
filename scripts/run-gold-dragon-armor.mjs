#!/usr/bin/env node
// Independent C-first Armor_on startup, immediate and delayed callbacks.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {HALLUC_RES,W_ARM} from '../js/const.js';
import {GOLD_DRAGON_SCALE_MAIL,GOLD_DRAGON_SCALES,LEATHER_JACKET} from '../js/objects.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';

const cases=[['gold-mail-uncursed',GOLD_DRAGON_SCALE_MAIL,3],
    ['gold-scales-blessed',GOLD_DRAGON_SCALES,3],
    ['gold-mail-cursed-blind',GOLD_DRAGON_SCALE_MAIL,2],
    ['leather-jacket-immediate',LEATHER_JACKET,0]];
const load=(root,name)=>JSON.parse(readFileSync(new URL(
    `../${root}/do_wear.c/armor-on-${name}.session.json`,import.meta.url),'utf8'));
async function verify(input,name,otyp,radius){
    const gold=load('recordings',name).segments[0];let boundary;
    const result=await runSegment({...input,recorderIsDst:gold.recorderIsDst},
        {onBoundary:error=>{boundary=error;}});
    assert.equal(boundary,undefined);assert.equal(game.nhDisplay.inputQueueLength,0);
    assert.equal(result.getScreens().length,gold.steps.length);
    assert.equal(game.uarm?.otyp,otyp);assert.equal(Boolean(game.uarm.known),true);
    assert.equal(game.uarm.owornmask&W_ARM,W_ARM);
    if(radius){
        assert.equal(game.uarm.lamplit,true);
        assert.equal(game.u.uprops[HALLUC_RES].extrinsic&W_ARM,W_ARM);
        const sources=[];for(let light=game.gl.light_base;light;light=light.next)
            if(light.id===game.uarm)sources.push(light);
        assert.equal(sources.length,1,'begin_burn owns one source after dressing');
        assert.equal(sources[0].range,radius);
        assert.equal(game.uarm.timed??0,0,'artifact armor does not own a burn timer');
        const shine=gold.steps.some(step=>step.screen.includes('begins to shine'));
        assert.equal(shine,name!=='gold-mail-cursed-blind',
            'C prints shine feedback only for a sighted hero');
    }else{
        assert.equal(Boolean(game.uarm.lamplit),false);
        assert.equal(game.afternmv,null,'immediate unmul clears its callback');
    }
}
export async function runGoldDragonArmorMatrix(){
    return runFreshMatrix({entries:cases.map(([name])=>({label:name,
        recipe:validateCleanRecipe(load('recipes',name),name)})),
        summaryLabel:'GOLD DRAGON ARMOR',chunkLimit:1,
        verifySegment:async input=>{
            const entry=cases.find(([name])=>load('recipes',name).segments[0].seed===input.seed);
            assert.ok(entry);await verify(input,...entry);
        }});
}
runMatrixCli(import.meta.url,runGoldDragonArmorMatrix,'gold dragon armor');
