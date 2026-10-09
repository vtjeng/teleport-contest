#!/usr/bin/env node
// The admitted v36 quest case exercises natural Ran-loca arrival; independent
// male and female recipes exercise the wizard des-file entry point.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import {
    ARROW_TRAP, SPIKED_PIT, STAIRS, TELEP_TRAP,
} from '../js/const.js';
import {
    PM_FOREST_CENTAUR, PM_GIANT_BAT, PM_MOUNTAIN_CENTAUR, PM_SCORPION, PM_WUMPUS,
} from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyRanLocaSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.flags.female, /gender:female/u.test(segment.nethackrc));
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.hardfloor, true);

    // Lua lines 31-34 specify the two stairs and nondiggable local rectangle.
    const monsters = linkedItems(game.level.monlist, 'nmon');
    const wumpus = monsters.find(monster => monster.mnum === PM_WUMPUS);
    assert.ok(wumpus);
    assert.equal(game.level.at(wumpus.mx, wumpus.my).typ, STAIRS);
    // Lua lines 35-46 place paired spiked pits, teleport traps and arrow traps.
    assert.ok(game.level.traps.filter(trap => trap.ttyp === SPIKED_PIT).length >= 2);
    assert.ok(game.level.traps.filter(trap => trap.ttyp === TELEP_TRAP).length >= 2);
    assert.ok(game.level.traps.filter(trap => trap.ttyp === ARROW_TRAP).length >= 2);

    // Lua lines 47-78 leave species lookup, class resolution and hostile state
    // to the canonical special-level descriptor handlers.
    assert.equal(wumpus.mpeaceful, false);
    assert.equal(wumpus.msleeping, true);
    assert.equal(monsters.filter(monster => monster.mnum === PM_GIANT_BAT).length, 4);
    assert.equal(monsters.filter(monster => monster.mnum === PM_FOREST_CENTAUR).length, 4);
    assert.equal(monsters.filter(monster => monster.mnum === PM_MOUNTAIN_CENTAUR).length, 8);
    assert.equal(monsters.filter(monster => monster.mnum === PM_SCORPION).length, 4);
    assert.equal(monsters.length, 23);
    assert.ok(monsters.every(monster => !monster.mpeaceful));
}

export function runRanLocaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['male', 'female'].map(gender => {
            const path = new URL(
                `../recipes/Ran-loca.lua/ran-loca-${gender}-independent.session.json`,
                import.meta.url,
            );
            return { label: gender, recipe: validateCleanRecipe(
                JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
        }),
        summaryLabel: 'RAN-LOCA LEVEL LOAD',
        verifySegment: verifyRanLocaSegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runRanLocaLevelLoadMatrix, 'Ran-loca level load');
