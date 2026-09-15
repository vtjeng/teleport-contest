#!/usr/bin/env node

// The independent recipes enter the Wizard quest, then teleport above its
// locate level to exercise mklev.c's Wiz-fila dispatch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { In_quest, OROOM } from '../js/const.js';
import { Is_special, find_level } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

async function verifyWizFilaSegment(segment) {
    await runSegment(segment);
    assert.ok(In_quest(game.u.uz));
    assert.equal(game.urole.filecode, 'Wiz');
    assert.equal(Is_special(game.u.uz), null);
    assert.ok(game.u.uz.dlevel < find_level('Wiz-loca').dlevel.dlevel);
    // The six source rooms are ordinary; the level array also has a sentinel.
    const rooms = game.level.rooms.filter(({ rtype }) => rtype !== undefined);
    assert.equal(rooms.length, 6);
    assert.ok(rooms.every(({ rtype }) => rtype === OROOM));
    // The program requests eight monsters and two stairs. Random trap or
    // corridor generation can add monsters, so the descriptor count is a floor.
    let monsters = 0;
    for (let mon = game.level.monlist; mon; mon = mon.nmon) ++monsters;
    assert.ok(monsters >= 8);
    const stairs = [];
    for (let stair = game.stairs; stair; stair = stair.next) stairs.push(stair);
    assert.equal(stairs.length, 2);
    assert.deepEqual(stairs.map(({ up }) => Boolean(up)).sort(), [false, true]);
}

function runWizFilaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['', '-variation'].map((suffix) => ({
            label: suffix ? 'female Wizard filler above' : 'male Wizard filler above',
            recipe: JSON.parse(readFileSync(new URL(
                `../recipes/Wiz-fila.lua/wizard-filler-above${suffix}.session.json`,
                import.meta.url,
            ), 'utf8')),
        })),
        summaryLabel: 'WIZ-FILA LEVEL LOAD',
        verifySegment: verifyWizFilaSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runWizFilaLevelLoadMatrix, 'Wiz-fila level load');
