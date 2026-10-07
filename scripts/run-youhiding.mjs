#!/usr/bin/env node
// insight.c:youhiding independent C-first entry evidence. Seeds were chosen
// directly, without scanning. C established polymorph message dismissals and
// wished potion slot m before any comparison; original-role/form variations
// cover first/already hiding, and the potion reaches MAGIC-only enlightenment
// without entering the separately queued background_enlightenment family.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {M_AP_TYPE,M_AP_OBJECT} from '../js/const.js';
import {PM_SMALL_MIMIC,PM_TRAPPER} from '../js/monsters.js';
import {STRANGE_OBJECT} from '../js/objects.js';
import {decodeScreen} from '../frozen/screen-decode.mjs';
import {validateCleanRecipe} from './diff-fresh.mjs';
import {runFreshMatrix,runMatrixCli} from './fresh-matrix.mjs';

const cases = [
    {name:'hiding-mimic',form:PM_SMALL_MIMIC,phrase:'mimicking a strange object'},
    {name:'hiding-trapper',form:PM_TRAPPER,phrase:'hiding on the floor'},
    {name:'hiding-potion-enlightenment',form:PM_TRAPPER,phrase:'hiding on the floor'},
];
export function loadYouhidingCases() {
    return cases.map((entry) => ({...entry,recipe:validateCleanRecipe(
        JSON.parse(readFileSync(new URL(`../recipes/insight.c/${entry.name}.session.json`,import.meta.url))),entry.name)}));
}
export async function verifyYouhidingSegment(segment) {
    const entry=loadYouhidingCases().find(({recipe}) => recipe.segments[0].seed===segment.seed);
    assert.ok(entry,'independent input identity');
    let boundary;
    const replay=await runSegment(segment,{onBoundary(error) {boundary=error;}});
    assert.equal(boundary,undefined,'production caller reaches the complete owner');
    assert.equal(game.u.umonnum,entry.form,'the selected current form persists');
    if(entry.form===PM_SMALL_MIMIC) {
        assert.equal(M_AP_TYPE(game.youmonst),M_AP_OBJECT);
        assert.equal(game.youmonst.mappearance,STRANGE_OBJECT);
    } else assert.equal(game.u.uundetected,1,'floor hiding state remains canonical');
    const frames=replay.getScreens().map((screen) => decodeScreen(screen)
        .map((row) => row.map((cell) => cell.ch).join('')));
    const all=frames.map((rows) => rows.join('\n')).join('\n');
    assert.ok(all.includes(`You are now ${entry.phrase}.`),'first hide live output');
    if(entry.name==='hiding-potion-enlightenment') {
        const window=frames.find((rows) => rows.some((row) => row.includes('Status:')));
        assert.ok(window,'live MAGIC-only enlightenment window');
        assert.ok(window.some((row) => row.includes('You are hiding on the floor.')));
        assert.ok(window.every((row) => !row.includes('Background:')));
        assert.ok(all.includes('Your awareness re-normalizes.'),'caller resumes after the window');
    } else assert.ok(all.includes(`You are already ${entry.phrase}.`),'repeat hide live output');
}
export async function runYouhidingMatrix() {
    return runFreshMatrix({entries:loadYouhidingCases().map(({name,recipe}) => ({label:name,recipe})),
        verifySegment:verifyYouhidingSegment,summaryLabel:'HIDING DESCRIPTIONS',chunkLimit:1});
}
runMatrixCli(import.meta.url,runYouhidingMatrix,'hiding descriptions');
