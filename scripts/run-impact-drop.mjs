#!/usr/bin/env node

// Independent C-first dokick.c impact_drop entries: held and adjacent holes,
// a huge hero's trapdoor, and floor piles hit by dropped/thrown/kicked objects
// or a monster missile. The C prefixes selected map positions and inventory
// letters before comparison. No admitted synthetic inputs are copied.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIGR_RANDOM, MIGR_STAIRS_UP, OBJ_MIGRATING } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const IMPACT_DROP_CASES = [
    'dig-levitating', 'dig-levitating-variation', 'dig-offhero', 'trapdoor-huge',
    'missile-stairs', 'missile-stairs-wait-3', 'missile-stairs-wait-4',
    'missile-stairs-throw', 'missile-kick', 'missile-monster', 'boulder-throw-hole',
];

export function loadImpactDropRecipe(name) {
    const path = new URL(`../recipes/dokick.c/impact-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

export async function verifyImpactDropSegment(segment) {
    const name = IMPACT_DROP_CASES.find(candidate => {
        const input = loadImpactDropRecipe(candidate).segments[0];
        return segment.seed === input.seed && segment.moves === input.moves;
    });
    assert.ok(name, 'each independent recipe identifies its production entry');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/dokick.c/impact-${name}.session.json`, import.meta.url), 'utf8'));
    assert.ok(recording.segments[0].steps.some(step => step.rng.some(
        draw => draw.includes('@ impact_drop(dokick.c:'),
    )), 'the C recording executes impact_drop rather than only its setup');
    const result = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.ok(!game.unported.has('dokick.c impact_drop'));
    if (['dig-offhero', 'missile-stairs-wait-3', 'missile-stairs-wait-4',
        'missile-kick'].includes(name)) {
        assert.ok(game.gm.migrating_objs, 'the source-selected floor object migrated');
        const where = name === 'dig-offhero' ? MIGR_RANDOM : MIGR_STAIRS_UP;
        for (let obj = game.gm.migrating_objs; obj; obj = obj.nobj) {
            assert.equal(obj.where, OBJ_MIGRATING);
            assert.deepEqual([obj.ox, obj.oy, obj.owornmask],
                [game.u.uz.dnum, game.u.uz.dlevel + 1, where]);
            assert.deepEqual([obj.omigr_from_dnum, obj.omigr_from_dlevel],
                [game.u.uz.dnum, game.u.uz.dlevel]);
            // The same pointer is removed from every source floor chain.
            for (let floor = game.level.objlist; floor; floor = floor.nobj)
                assert.notStrictEqual(floor, obj);
        }
    }
}

export function runImpactDropMatrix() {
    return runFreshMatrix({
        entries: IMPACT_DROP_CASES.map(name => ({
            label: `impact ${name}`, recipe: loadImpactDropRecipe(name),
        })),
        verifySegment: verifyImpactDropSegment,
        summaryLabel: 'IMPACT DROP',
        chunkLimit: 1, // Each C recording retains its own debug-game lock.
    });
}

runMatrixCli(import.meta.url, runImpactDropMatrix, 'impact drop');
