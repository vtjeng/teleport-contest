#!/usr/bin/env node

// Fresh production witness for mthrowu.c thrwmu() -> monshoot() -> m_throw().
// Wizard genesis creates a hobbit, whose ordinary m_initweap() loadout can
// contain a sling and a stack of rocks.  The route is deliberately unrelated
// to the fixed seed4500 holdout: it uses a new seed, timestamp, character,
// and input sequence, then waits long enough for the generated hobbit to act.

import assert from 'node:assert/strict';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_HOBBIT } from '../js/monsters.js';
import { ROCK, SLING } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const GENESIS_KEY = '\u0007';

function nethackrc() {
    return [
        'OPTIONS=name:StoneProbe,role:Valkyrie,race:human,gender:female,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen,playmode:debug',
        'OPTIONS=pettype:none,rest_on_space,!safe_wait',
        '',
    ].join('\n');
}

export function loadMthrowuRockThrowRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 9510006,
            datetime: '20320415101723',
            nethackrc: nethackrc(),
            moves: ` ${GENESIS_KEY}hobbit\nllll${'s'.repeat(8)}`,
        }],
    }, 'mthrowu rock throw recipe');
}

function findHobbit() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        if (monster.mnum === PM_HOBBIT) return monster;
    }
    return null;
}

function inventory(monster) {
    const objects = [];
    for (let object = monster.minvent; object; object = object.nobj)
        objects.push(object);
    return objects;
}

// The final wait lets the fresh hobbit's AT_WEAP arm reach thrwmu().  Assert
// the source-visible consequence rather than merely proving genesis worked:
// the sling is selected as propellor, rocks are selected as missile, and at
// least one rock leaves the original stack during monshoot()/m_throw().
export async function verifyMthrowuRockThrowSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    assert.equal(replay.getScreens().length, segment.moves.length + 1);

    const hobbit = findHobbit();
    assert.ok(hobbit, 'fresh genesis did not create a hobbit');
    const objects = inventory(hobbit);
    const sling = objects.find((object) => object.otyp === SLING);
    const rocks = objects.filter((object) => object.otyp === ROCK);
    assert.ok(sling, 'hobbit did not receive a sling');
    assert.ok(rocks.length > 0, 'hobbit did not receive rocks');
    assert.ok(
        rocks.some((object) => object.quan < 6),
        'hobbit did not spend a rock through ranged path '
        + `(hero ${game.u.ux},${game.u.uy}; hobbit ${hobbit.mx},${hobbit.my}; `
        + `target ${hobbit.mux},${hobbit.muy}; rocks ${rocks.map(o => o.quan)})`,
    );
}

export async function runMthrowuRockThrowMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'fresh sling-rock monster throw',
            recipe: loadMthrowuRockThrowRecipe(),
        }],
        summaryLabel: 'MTHROWU SLING ROCK THROW',
        verifySegment: verifyMthrowuRockThrowSegment,
    });
}

runMatrixCli(import.meta.url, runMthrowuRockThrowMatrix, 'mthrowu sling rock throw');
