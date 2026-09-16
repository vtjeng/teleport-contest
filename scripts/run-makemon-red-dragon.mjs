#!/usr/bin/env node

// Fresh production witness for wizard.c wiz_genesis() -> read.c
// create_particular_creation() -> makemon.c makemon(). The explicit red
// dragon is an ordinary named species: C does not apply a species allowlist
// before constructing it, and its S_DRAGON creation path uses the generic
// hit-point, attitude, inventory, and appearance tail.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_RED_DRAGON } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/makemon.c/red-dragon-genesis-fresh.session.json',
    import.meta.url,
);

export function loadMakemonRedDragonRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

function levelMonsters() {
    const monsters = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        monsters.push(monster);
    return monsters;
}

export async function verifyMakemonRedDragonSegment(segment) {
    // Startup's first wait leaves the initial tty screen before C('g') is
    // dispatched by rhack(); this is the same boundary used by the fixed
    // #wizgenesis recipes.
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    const dragons = levelMonsters().filter(
        ({ mnum }) => mnum === PM_RED_DRAGON,
    );
    assert.equal(dragons.length, 1, 'genesis should create one red dragon');
    assert.equal(
        replay.getScreens().length,
        segment.moves.length + 1,
        'fresh red-dragon segment reached its final key',
    );
}

export async function runMakemonRedDragonMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'makemon red dragon',
            recipe: loadMakemonRedDragonRecipe(),
        }],
        summaryLabel: 'MAKEMON RED DRAGON',
        chunkLimit: 1,
        verifySegment: verifyMakemonRedDragonSegment,
    });
}

runMatrixCli(import.meta.url, runMakemonRedDragonMatrix, 'makemon red dragon');
