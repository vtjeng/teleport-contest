#!/usr/bin/env node
// Independent C-first kick guards and both live kick_steed callers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';

const cases=[['dokick.c','kick-snake-guard'],['dokick.c','kick-newt-guard'],
    ['dokick.c','kick-crocodile-guard'],['steed.c','kick-mounted-pony'],
    ['steed.c','kick-sleeping-pony'],['apply.c','whip-mounted-steed-gallop'],
    ['apply.c','whip-mounted-steed-gallop-female'],
    ['dokick.c','kick-context-menu-natural-door']];
const load=(root,owner,name)=>JSON.parse(readFileSync(new URL(
    `../${root}/${owner}/${name}.session.json`,import.meta.url),'utf8'));

export async function verifyKickSteedSegment(input,owner,name) {
    const gold=load('recordings',owner,name).segments[0];
    assert.equal(input.seed,gold.seed);
    assert.equal(input.moves,gold.moves);
    let boundary;
    const result=await runSegment({...input,recorderIsDst:gold.recorderIsDst},
        {onBoundary:error=>{boundary=error;}});
    assert.equal(boundary,undefined);
    assert.equal(game.nhDisplay.inputQueueLength,0);
    assert.equal(result.getScreens().length,gold.steps.length);
    if(owner==='steed.c'||owner==='apply.c') {
        const events=gold.steps.flatMap(step=>step.rng??[])
            .filter(row=>row.includes('@ kick_steed(steed.c:'));
        assert.ok(events.length>0,'recording reaches the source steed owner');
        assert.ok(game.u.usteed,'matching route retains the mounted steed');
        if(name==='kick-sleeping-pony') {
            assert.ok(events.some(row=>row.startsWith('rn2(2)=')),
                'helpless processing consumes its conditional draw');
            assert.ok(gold.steps.some(step=>step.screen.includes('It stirs.')),
                'the source kick reaches a duration above the two-turn clearing boundary');
            assert.equal(Boolean(game.u.usteed.mcanmove),game.u.usteed.mfrozen===0,
                'movement resumes when the existing timeout owner clears paralysis');
        } else {
            assert.ok(events.some(row=>row.startsWith('rnd(20)=')));
            assert.ok(events.some(row=>row.startsWith('rn2(20)=')));
            assert.ok(game.u.ugallop>0,'source galloping timer is published');
        }
    } else if(name==='kick-context-menu-natural-door') {
        assert.ok(gold.steps.some(step=>step.screen.includes('Kick the door')),
            'production therecmdmenu offers the canonical door action');
        assert.ok(gold.steps.flatMap(step=>step.rng??[])
            .some(row=>row.includes('@ kick_door(dokick.c:')),
            'the canned dokick direction reaches the source door helper');
    } else {
        assert.ok(gold.steps.some(step=>/no legs|too small|cannot kick effectively/u.test(step.screen)),
            'independent recording reaches its guard message');
    }
}

export async function runKickSteedMatrix(){
    return runFreshMatrix({entries:cases.map(([owner,name])=>({label:name,
        recipe:validateCleanRecipe(load('recipes',owner,name),name)})),
        summaryLabel:'KICK GUARDS AND STEED CALLERS',chunkLimit:1,
        verifySegment:async input=>{
            const pair=cases.find(([owner,name])=>{
                const segment=load('recipes',owner,name).segments[0];
                return segment.seed===input.seed&&segment.moves===input.moves
                    &&segment.nethackrc===input.nethackrc;
            });
            assert.ok(pair);await verifyKickSteedSegment(input,...pair);
        }});
}
runMatrixCli(import.meta.url,runKickSteedMatrix,'kick and steed');
