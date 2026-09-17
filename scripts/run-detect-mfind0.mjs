#!/usr/bin/env node

// Fresh production witnesses for detect.c mfind0() and its two callers.
// Each segment creates a monster in wizard mode, then invokes explicit search
// so the adjacent-monster loop reaches the source-owned discovery arms.  The
// recipes use only replay inputs; C recordings are written separately with
// record-session.mjs after the bounded differential passes.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { PM_SMALL_MIMIC, PM_STALKER } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE_PATHS = [
    '../recipes/detect.c/mfind0-stalker-independent.session.json',
    '../recipes/detect.c/mfind0-mimic-variation.session.json',
];

export function loadMfind0Recipe() {
    return RECIPE_PATHS.map((path) => validateCleanRecipe(
        JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')),
        'mfind0 recipe',
    ));
}

function monsters() {
    const result = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

// A production search witness must show the created species and leave it
// adjacent to the hero, rather than merely proving that wizgenesis accepted a
// line.  The differential itself compares the discovery message/screens; the
// state assertions below verify that each segment selected its intended arm.
export async function verifyMfind0Segment(segment) {
    const replay = await runSegment(segment);
    const levelMonsters = monsters();
    const expected = segment.moves.includes('stalker')
        ? PM_STALKER : PM_SMALL_MIMIC;
    const created = levelMonsters.find(({ mnum }) => mnum === expected);
    assert.ok(created, 'wizgenesis did not create the selected monster');
    assert.ok(
        Math.abs(created.mx - game.u.ux) <= 1
        && Math.abs(created.my - game.u.uy) <= 1,
        `selected monster is no longer adjacent after search (${created.mx},${created.my})`,
    );
    if (expected === PM_STALKER) assert.equal(created.minvis, true);
    else assert.equal(created.m_ap_type, 0, 'mfind0 did not reveal the mimic');
    assert.ok(replay.getScreens().length > 0);
}

export async function runMfind0Matrix() {
    return runFreshMatrix({
        entries: [{
            label: 'fresh mfind0 discovery',
            recipe: loadMfind0Recipe()[0],
        }, {
            label: 'fresh mfind0 mimic variation',
            recipe: loadMfind0Recipe()[1],
        }],
        summaryLabel: 'Mfind0 DISCOVERY',
        verifySegment: verifyMfind0Segment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runMfind0Matrix, 'mfind0 discovery');
