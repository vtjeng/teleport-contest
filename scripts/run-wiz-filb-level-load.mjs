#!/usr/bin/env node

// Independent recipes enter the Wizard quest, then teleport to Home 4 to
// exercise mklev.c's Wiz-filb dispatch and complete dat/Wiz-filb.lua.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { In_quest, OROOM } from '../js/const.js';
import { find_level, Is_special } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

async function verifyWizFilbSegment(segment) {
    await runSegment(segment);
    assert.ok(In_quest(game.u.uz));
    assert.equal(game.urole.filecode, 'Wiz');
    assert.equal(Is_special(game.u.uz), null);
    assert.ok(game.u.uz.dlevel >= find_level('Wiz-loca').dlevel.dlevel);

    // The six source rooms are ordinary; the level array also has a sentinel.
    const rooms = game.level.rooms.filter(({ rtype }) => rtype !== undefined);
    assert.equal(rooms.length, 6);
    assert.ok(rooms.every(({ rtype }) => rtype === OROOM));

    // Source contents request two stairs and at least seven monsters. Random
    // trap or corridor generation can add monsters beyond the descriptors.
    let monsters = 0;
    for (let mon = game.level.monlist; mon; mon = mon.nmon) ++monsters;
    assert.ok(monsters >= 7);
    const stairs = [];
    for (let stair = game.stairs; stair; stair = stair.next) stairs.push(stair);
    assert.equal(stairs.length, 2);
    assert.deepEqual(stairs.map(({ up }) => Boolean(up)).sort(), [false, true]);
}

function runWizFilbLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['', '-variation'].map((suffix) => ({
            label: suffix ? 'female Wizard filler below' : 'male Wizard filler below',
            recipe: JSON.parse(readFileSync(new URL(
                `../recipes/Wiz-filb.lua/wizard-filler-below${suffix}.session.json`,
                import.meta.url,
            ), 'utf8')),
        })),
        summaryLabel: 'WIZ-FILB LEVEL LOAD',
        verifySegment: verifyWizFilbSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runWizFilbLevelLoadMatrix, 'Wiz-filb level load');
