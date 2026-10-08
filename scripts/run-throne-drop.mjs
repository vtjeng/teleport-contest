#!/usr/bin/env node

// Independent C-first dry-throne drops. Unsearched Valkyrie seed14428031
// and clock20621015101927 vary a starting spear with a wished ruby. The C
// startup established h as a floor step away from the upstairs. Knight
// seed14328011 reuses A143's independently recorded armed grease route and
// reaches allmain.c -> do_wear.c:glibr -> do.c:dropx during elapsed upkeep.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLIB, OBJ_FLOOR, THRONE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { LONG_SWORD, RUBY, SPEAR } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { stairway_at } from '../js/stairs.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const THRONE_DROP_CASES = [
    { name: 'weapon', objectType: SPEAR, message: 'You drop a +1 spear.' },
    { name: 'gem', objectType: RUBY, message: 'You drop a red gem.' },
    { name: 'glibr', objectType: LONG_SWORD,
        message: 'Your sword slips from your hand.' },
];

export function loadThroneDropRecipe(name) {
    const path = new URL(`../recipes/do.c/drop-throne-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

export async function verifyThroneDropSegment(segment) {
    const entry = segment.seed === 14328011
        ? THRONE_DROP_CASES.find(caseEntry => caseEntry.name === 'glibr')
        : THRONE_DROP_CASES.find(caseEntry => caseEntry.name === (
            segment.moves.includes('ruby\n') ? 'gem' : 'weapon'));
    assert.ok(entry, 'each recipe identifies a source-owned drop entry');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const c = JSON.parse(readFileSync(new URL(
        `../recordings/do.c/drop-throne-${entry.name}.session.json`, import.meta.url), 'utf8'));
    const comparison = compareSessionOutputs(c, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    assert.ok(c.segments[0].steps.some(step => step.screen.includes(entry.message)));
    assert.ok(replay.getScreens().some(screen => screen.includes(entry.message)));
    const { ux, uy } = game.u;
    assert.equal(stairway_at(ux, uy, game), null,
        'a stairway must not bypass the throne admission being checked');
    assert.equal(game.level.at(ux, uy).typ, THRONE);
    let floorObject = game.level.objects[ux][uy];
    while (floorObject && floorObject.otyp !== entry.objectType)
        floorObject = floorObject.nexthere;
    assert.ok(floorObject, 'the dropped object is in the floor pile');
    assert.equal(floorObject.where, OBJ_FLOOR);
    assert.equal(floorObject.ox, ux);
    assert.equal(floorObject.oy, uy);
    for (let object = game.invent; object; object = object.nobj)
        assert.notStrictEqual(object, floorObject);
    if (entry.name !== 'gem') assert.equal(game.uwep, null);
    if (entry.name === 'glibr') {
        assert.ok(game.u.uprops[GLIB].intrinsic > 0);
        assert.equal(Boolean(floorObject.greased), true);
    }
}

export function runThroneDropMatrix() {
    return runFreshMatrix({
        entries: THRONE_DROP_CASES.map(entry => ({
            label: `throne drop ${entry.name}`, recipe: loadThroneDropRecipe(entry.name),
        })),
        summaryLabel: 'THRONE DROP', chunkLimit: 1,
        verifySegment: verifyThroneDropSegment,
    });
}

runMatrixCli(import.meta.url, runThroneDropMatrix, 'throne drop');
