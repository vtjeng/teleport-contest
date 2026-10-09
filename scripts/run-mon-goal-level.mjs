#!/usr/bin/env node

// C-first Monk roles and direct #wizloaddes filenames exercise the wizard
// caller independently of natural quest-goal arrival.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALTAR, AM_NONE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { PM_EARTH_ELEMENTAL, PM_MASTER_KAEN, PM_XORN } from '../js/monsters.js';
import { LENSES } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE_PATHS = [
    new URL('../recipes/Mon-goal.lua/mon-goal-direct-neutral-independent.session.json', import.meta.url),
    new URL('../recipes/Mon-goal.lua/mon-goal-direct-lawful-independent.session.json', import.meta.url),
];

export function loadMonGoalRecipes() {
    return RECIPE_PATHS.map((path, index) => validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        `Mon-goal direct-load recipe ${index + 1}`,
    ));
}

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyMonGoalLevel(segment) {
    await runSegment(segment);

    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.traps.length, 6);
    assert.equal(game.specialLevelAlign.length, 3);
    const stairs = linkedItems(game.stairs, 'next');
    assert.equal(stairs.length, 1);
    assert.equal(stairs[0].up, true);
    // The loader's frame translates the source-relative stair at (20,5).

    const objects = linkedItems(game.level.objlist, 'nobj');
    assert.ok(objects.length >= 15);
    const eyes = objects.find(object => object.otyp === LENSES
        && object.oextra?.oname === 'The Eyes of the Overworld');
    assert.ok(eyes);
    assert.equal(eyes.blessed, true);
    assert.equal(eyes.spe, 0);

    const monsters = linkedItems(game.level.monlist, 'nmon');
    const kaen = monsters.find(monster => monster.mnum === PM_MASTER_KAEN);
    assert.ok(kaen);
    assert.equal(monsters.filter(monster => monster.mnum === PM_EARTH_ELEMENTAL).length, 9);
    assert.equal(monsters.filter(monster => monster.mnum === PM_XORN).length, 9);
    assert.deepEqual([eyes.ox, eyes.oy], [kaen.mx, kaen.my]);

    const altar = game.level.at(kaen.mx, kaen.my);
    assert.equal(altar.typ, ALTAR);
    assert.equal(altar.flags, AM_NONE); // rm.flags stores the C altarmask value.
}

export function runMonGoalLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadMonGoalRecipes().map((recipe, index) => ({
            label: index === 0 ? 'neutral Monk direct Mon-goal load'
                : 'lawful Monk direct Mon-goal load',
            recipe,
        })),
        summaryLabel: 'MON-GOAL DIRECT LEVEL LOAD',
        verifySegment: verifyMonGoalLevel,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runMonGoalLevelLoadMatrix, 'Mon-goal direct level load');
