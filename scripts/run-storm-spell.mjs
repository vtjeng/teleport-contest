#!/usr/bin/env node
// C-first seeds1452901..1452906 and1452911..1452915 were chosen without
// search. Recipe comments and cache artifacts retain inventory/terrain setup.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {P_SKILL} from '../js/startup_skills.js';
import {P_ATTACK_SPELL, P_SKILLED} from '../js/const.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix, runMatrixCli} from './fresh-matrix.mjs';

const cases=[
    ...['storm-fire-cancel','storm-fire-markers','storm-cold-target',
        'storm-fire-self','storm-fire-distance-ten','storm-fire-distance-eleven']
        .map(name=>['spell.c',name]),
    // Existing independent caller recipes verify the canonical setter at
    // every external apply/read call site without copying challenge inputs.
    ['apply.c','storm-callback-jump-cancel'],
    ['getpos.c','storm-background-refresh-cancel'],
    ['spell.c','storm-trained-wizcast-cancel'],
    ['spell.c','storm-trained-docast-cancel'],
    ['apply.c','use-pole-knight-cancel-independent'],
    ['apply.c','grappling-hook-valid-marker-independent-b55'],
    ['read.c','read-fire-blessed-highlight'],
    ['read.c','storm-callback-cloud-cancel'],
];
const load=(root,owner,name)=>JSON.parse(readFileSync(new URL(
    `../${root}/${owner}/${name}.session.json`,import.meta.url),'utf8'));

export async function verifyStormSegment(input,owner,name) {
    const gold=load('recordings',owner,name).segments[0];
    assert.equal(input.seed,gold.seed);
    assert.equal(input.moves,gold.moves);
    // The recorder's DST bit is replay metadata, not an independent input.
    const segment={...input,recorderIsDst:gold.recorderIsDst};
    let skill;
    if(owner==='spell.c' && !name.startsWith('storm-trained-')) {
        await runSegment({...segment,moves:input.moves.slice(0,input.moves.indexOf('#invoke'))});
        skill=P_SKILL(P_ATTACK_SPELL,game);
    }
    const replay=await runSegment(segment);
    assert.equal(game.nhDisplay.inputQueueLength,0);
    assert.ok(replay.getScreens().length>0);
    assert.equal(game.getpos_hilitefunc,null);
    assert.equal(game.getpos_getvalid,null);
    if(owner==='spell.c') {
        if(name.startsWith('storm-trained-')) {
            assert.equal(P_SKILL(P_ATTACK_SPELL,game),P_SKILLED, 'C #enhance reaches Skilled attack magic');
        } else assert.equal(P_SKILL(P_ATTACK_SPELL,game),skill,
            'artifact caller restores its prior skill after spelleffects');
        const events=gold.steps.flatMap(s=>s.rng??[])
            .filter(r=>r.includes('@ spelleffects(spell.c:'));
        const count=events.find(r=>r.startsWith('rnd(8)='));
        if(name==='storm-cold-target'||name==='storm-fire-self'||name==='storm-fire-markers') {
            assert.ok(count,'the independent target reaches the skilled blast loop');
            const blasts=Number(count.match(/rnd\(8\)=(\d+)/)[1])+1;
            assert.equal(events.filter(r=>r.startsWith('rnd(3)=')).length,2*blasts,
                'source draws both offsets even after the last explosion');
        } else {
            assert.equal(count,undefined,'cancellation/range checks consume no blast RNG');
        }
    }
}

export async function runStormSpellMatrix() {
    return runFreshMatrix({
        entries:cases.map(([owner,name])=>({label:name,
            recipe:validateCleanRecipe(load('recipes',owner,name),name)})),
        summaryLabel:'STORM SPELL AND TARGET CALLBACK CALLERS',chunkLimit:1,
        verifySegment:async(input)=>{
            const entry=cases.find(([owner,name])=>load('recipes',owner,name).segments[0].seed===input.seed);
            assert.ok(entry);await verifyStormSegment(input,...entry);
        },
    });
}
runMatrixCli(import.meta.url,runStormSpellMatrix,'storm spell');
