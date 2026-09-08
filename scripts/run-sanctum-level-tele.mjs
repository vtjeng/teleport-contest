#!/usr/bin/env node

// Record and replay the bounded wizard level-teleport route to the Sanctum.
// The recipe contains replay inputs only; runFreshMatrix() records its C
// reference output in an isolated temporary workspace.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    ALTAR,
    AM_MASK,
    AM_SANCTUM,
    AM_SHRINE,
    A_NONE,
    FIRE_TRAP,
    MORGUE,
    TEMPLE,
    W_NONDIGGABLE,
    W_NONPASSWALL,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_HIGH_CLERIC } from '../js/monsters.js';
import { AMULET_OF_YENDOR } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/sp_lev.c/sanctum-level-teleport.session.json',
    import.meta.url,
);

export function loadSanctumLevelTeleRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'wizard Sanctum level teleport recipe',
    );
}

function monsters() {
    const result = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

function inventory(monster) {
    const result = [];
    for (let obj = monster.minvent; obj; obj = obj.nobj) result.push(obj);
    return result;
}

export async function verifySanctumSegment(segment) {
    await runSegment(segment);

    assert.deepEqual(game.u.uz, game.sanctum_level);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);
    assert.equal(game.level.flags.nommap, true);
    assert.equal(game.level.flags.has_temple, true);
    assert.equal(game.level.flags.has_morgue, true);

    assert.equal(
        game.level.rooms.filter(({ rtype }) => rtype === TEMPLE).length,
        1,
    );
    assert.equal(
        game.level.rooms.filter(({ rtype }) => rtype === MORGUE).length,
        1,
    );

    const altars = [];
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y) {
            const location = game.level.at(x, y);
            if (location.typ === ALTAR) altars.push({ x, y, location });
        }
    }
    assert.equal(altars.length, 1);
    assert.deepEqual([altars[0].x, altars[0].y], [21, 9]);
    assert.equal(altars[0].location.flags & AM_MASK, 0);
    assert.equal(altars[0].location.flags & AM_SHRINE, AM_SHRINE);
    assert.equal(altars[0].location.flags & AM_SANCTUM, AM_SANCTUM);

    const highPriests = monsters().filter(
        (monster) => monster.data?.pmidx === PM_HIGH_CLERIC,
    );
    assert.equal(highPriests.length, 1);
    const highPriest = highPriests[0];
    assert.equal(highPriest.ispriest, true);
    assert.equal(highPriest.mpeaceful, true);
    assert.equal(highPriest.mextra.epri.shralign, A_NONE);
    assert.deepEqual(highPriest.mextra.epri.shrpos, { x: 21, y: 9 });
    assert.deepEqual(highPriest.mextra.epri.shrlevel, game.sanctum_level);
    assert.equal(
        inventory(highPriest)
            .filter(({ otyp }) => otyp === AMULET_OF_YENDOR).length,
        1,
    );

    assert.deepEqual(game.stairs, {
        sx: 66,
        sy: 16,
        up: true,
        isladder: false,
        tolev: { dnum: 1, dlevel: 23 },
        next: null,
    });
    assert.deepEqual(game.dndest, {
        lx: 54,
        ly: 1,
        hx: 79,
        hy: 18,
        nlx: -1,
        nly: -1,
        nhx: -1,
        nhy: -1,
    });

    const nonPasswall = [];
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y) {
            if (game.level.at(x, y).wall_info & W_NONPASSWALL)
                nonPasswall.push([x, y]);
        }
    }
    assert.equal(nonPasswall.length, 60);
    assert.deepEqual([...new Set(nonPasswall.map(([x]) => x))], [40, 41, 42]);
    assert.equal(
        game.level.at(3, 1).wall_info & W_NONDIGGABLE,
        W_NONDIGGABLE,
    );

    assert.equal(game.level.traps.length, 40);
    assert.ok(
        game.level.traps.filter(({ ttyp }) => ttyp === FIRE_TRAP).length
            >= 34,
    );
}

export async function runSanctumLevelTeleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard Sanctum level teleport',
            recipe: loadSanctumLevelTeleRecipe(),
        }],
        summaryLabel: 'WIZARD SANCTUM LEVEL TELEPORT',
        verifySegment: verifySanctumSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runSanctumLevelTeleMatrix,
    'wizard Sanctum level teleport',
);
