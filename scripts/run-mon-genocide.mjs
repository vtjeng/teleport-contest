#!/usr/bin/env node

// mon.c kill_genocided_monsters(): independently chosen debug seeds exercise
// species/class scrolls, retained monsters on level return, and both chameleon
// branches. No seed search was needed: wizard creation chooses the species.
// Verify source state as well as strict C output so a wrong inventory selector
// or a pending More page cannot produce false coverage. The recipe comments
// explain each setup; recorded C inventories supplied their scroll selectors.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {G_GENOD} from '../js/const.js';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {PM_CHAMELEON, PM_GOBLIN, PM_LICHEN, PM_NEWT} from '../js/monsters.js';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix, runMatrixCli} from './fresh-matrix.mjs';

const names=['live-goblin','class-live-newt','level-arrival',
    'chameleon-current-form','chameleon-original-species'];
export function loadMonGenocideCases() {
    return names.map(name=>({name,recipe:validateCleanRecipe(JSON.parse(readFileSync(
        new URL(`../recipes/mon.c/c118-genocide-${name}.session.json`,import.meta.url))),
        `independent mon.c genocide ${name}`)}));
}
export async function verifyMonGenocideSegment(segment) {
    const entry=loadMonGenocideCases().find(({recipe})=>{
        const expected=recipe.segments[0];
        return expected.seed===segment.seed && expected.moves===segment.moves
            && expected.datetime===segment.datetime && expected.nethackrc===segment.nethackrc;
    });
    assert.ok(entry,'one independently selected case describes the replay');
    let boundary;
    const replay=await runSegment(segment,{onBoundary(error){boundary=error;}});
    assert.equal(boundary,undefined,'the input must reach its source entry');
    const target=entry.name==='live-goblin'?PM_GOBLIN:
        entry.name==='chameleon-original-species'?PM_CHAMELEON:PM_NEWT;
    assert.ok(game.svm.mvitals[target].mvflags&G_GENOD,'the scroll was actually read');
    assert.match(replay.getScreens().join('\n'),/Wiped out all/u);
    const live=[];
    for(let mon=game.level.monlist;mon;mon=mon.nmon)if(mon.mhp>0)live.push(mon);
    assert.equal(live.filter(mon=>mon.data.pmidx===target).length,0);
    assert.equal(game.u.uconduct.killer,0,'genocide uses mondead rather than hero-kill rewards');
    assert.equal(game.u.uexp,0,'no hero experience for the sweep');
    if(entry.name==='chameleon-current-form') {
        const changed=live.find(mon=>mon.cham===PM_CHAMELEON);
        assert.ok(changed,'the original chameleon survives current-form genocide');
        assert.equal(changed.data.pmidx,PM_LICHEN);
        assert.equal(game.svm.mvitals[PM_CHAMELEON].mvflags&G_GENOD,0);
        assert.match(replay.getScreens().join('\n'),/turns into a lichen/u);
    } else assert.ok(game.svm.mvitals[target].died>0,'the source death path ran');
    if(entry.name==='level-arrival')assert.equal(game.u.uz.dlevel,1,'the retained level was reloaded');
    assert.equal(game.unported.has('mon.c kill_genocided_monsters'),false);
}
export async function runMonGenocideMatrix() {
    return runFreshMatrix({entries:loadMonGenocideCases().map(({name,recipe})=>({label:name,recipe})),
        summaryLabel:'MON GENOCIDE',verifySegment:verifyMonGenocideSegment,chunkLimit:1});
}
runMatrixCli(import.meta.url,runMonGenocideMatrix,'mon genocide');
