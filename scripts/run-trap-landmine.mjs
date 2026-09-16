#!/usr/bin/env node

// Fresh production witness for trap.c trapeffect_landmine(): the independently
// selected D:8 layout contains a natural land mine beside the hero, and
// #wizgenesis creates a large dog directly on it. The final u-k movement turns
// the dog into the triggering monster and reaches the resulting pit through
// mintrap(). This recipe exercises production setup and movement wiring.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LANDMINE, PIT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LARGE_DOG } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/trap.c/landmine-monster-fresh.session.json',
    import.meta.url,
);

export function loadTrapLandmineRecipe() {
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

export async function verifyTrapLandmineSegment(segment) {
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.uz.dlevel, 8,
        'fresh landmine recipe did not reach D:8');
    const pit = game.level.traps.find((trap) =>
        trap.ttyp === PIT && trap.tx === 35 && trap.ty === 12);
    assert.ok(pit,
        `fresh D:8 layout did not convert its natural land mine to a pit: ${JSON.stringify(game.level.traps.filter(({ ttyp }) => [LANDMINE, PIT].includes(ttyp)))}`);
    assert.equal(pit.tseen, true,
        'fresh landmine explosion did not reveal the resulting pit');
    const dogs = levelMonsters().filter(({ mnum }) => mnum === PM_LARGE_DOG);
    assert.equal(dogs.length, 1,
        'fresh #wizgenesis route did not create exactly one large dog');
    assert.deepEqual([dogs[0].mx, dogs[0].my], [35, 12],
        'fresh monster movement did not enter the land mine square');
    assert.equal(dogs[0].mtrapped, true,
        'fresh monster movement did not reach the held pit arm');
    assert.ok(replay.getScreens().length > 0,
        'fresh landmine setup did not reach a screen boundary');
    return replay;
}

export async function runTrapLandmineMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'trap landmine monster',
            recipe: loadTrapLandmineRecipe(),
        }],
        summaryLabel: 'TRAP LANDMINE MONSTER',
        verifySegment: verifyTrapLandmineSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runTrapLandmineMatrix, 'trap landmine monster');
