// The recipes scripts/run-fire-command.mjs replays against the C reference.
// These tests read the recipe rather than the recording, so a silent
// re-recording that stopped covering an arm of dothrow.c dofire() fails here
// instead of passing a differential against a weaker case.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CANCEL_CASE,
    CANCEL_MOVES,
    FIRE_CASES,
    FIRE_MOVES,
    loadFireCancelRecipe,
    loadFireCommandRecipe,
} from './run-fire-command.mjs';

function roleOf(segment) {
    return /role:([A-Za-z]+),race:([a-z]+)/u
        .exec(segment.nethackrc).slice(1).join('/');
}

test('the fire matrix fires twice, so both dofire() arms run in order', () => {
    const recipe = loadFireCommandRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // The first `f` takes dothrow.c:566-570, which queues [doswapweapon,
    // dofire]; the second finds the launcher wielded and takes :564-565. Two
    // `f` keys are what separates them, and the two spaces after the first
    // are doswapweapon()'s two prinv() --More-- prompts (wield.c:226, :492).
    assert.equal(FIRE_MOVES, '.f  l.fl.');
    assert.equal(FIRE_MOVES.split('f').length - 1, 2);
    assert.ok(recipe.segments.every(({ moves }) => moves === FIRE_MOVES));
});

test('the fire matrix separates three multishot_class_bonus() arms', () => {
    const recipe = loadFireCommandRecipe();
    // dothrow.c multishot_class_bonus() gives PM_RANGER its +1 for any
    // non-dagger missile (:59-62) and PM_CAVE_DWELLER its +1 for sling or
    // spear skill (:47-51); throw_obj():196-200 adds the elven bow and elven
    // arrow +1 on top of the Ranger's. Three roles, three different volley
    // sizes before the rnd() draw.
    assert.deepEqual(
        recipe.segments.map(roleOf),
        ['Ranger/human', 'Caveman/human', 'Ranger/elf'],
    );
    // The Caveman fires GEM_CLASS ammunition and the two Rangers fire
    // WEAPON_CLASS, which is the other split throw_obj():163-165 makes.
    assert.deepEqual(
        FIRE_CASES.map(({ ammo }) => ammo),
        ['arrow', 'flint stone', 'elven arrow'],
    );
    // The seed list is the separate tripwire for a silent re-recording.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [7810001, 7810002, 7810003],
    );
});

test('the cancel recipe answers the direction prompt two ways', () => {
    const recipe = loadFireCancelRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(recipe.segments[0].seed, CANCEL_CASE.seed);
    // throw_obj() has two returns that spend no time: getdir() answering 0 at
    // :95-99, which Escape produces, and the self-throw refusal at :132-136,
    // which `.` produces by setting u.dx, u.dy and u.dz all to zero.
    assert.equal(CANCEL_MOVES, '.f  \u001B.f.');
    assert.ok(CANCEL_MOVES.includes('\u001B'), 'no Escape answer');
    assert.ok(CANCEL_MOVES.endsWith('f.'), 'no self-direction answer');
});

test('every fire segment starts from the same fixed clock', () => {
    const segments = [
        ...loadFireCommandRecipe().segments,
        ...loadFireCancelRecipe().segments,
    ];
    // A varying datetime would change moon phase and Friday-the-13th
    // behavior, neither of which this matrix is measuring.
    assert.ok(segments.every(({ datetime }) => datetime === '20000110090000'));
    // pettype:none is what keeps a pet out of the flight path; without it the
    // shot could reach thitmonst(), which no segment here is allowed to do.
    assert.ok(segments.every(
        ({ nethackrc }) => nethackrc.includes('pettype:none'),
    ));
});
