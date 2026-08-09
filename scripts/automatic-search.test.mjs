import assert from 'node:assert/strict';
import test from 'node:test';

import { SCORR, SDOOR, SEARCHING, isok } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadAutomaticSearchRecipe } from './run-automatic-search.mjs';

// role.c gives SEARCHING at experience level 1 to these two roles and to no
// others (js/attrib.js ran_abil and arc_abil); every later grant starts at
// experience level 9 or 10, which no segment here reaches.
const SEARCHING_AT_LEVEL_ONE = ['Ranger', 'Archeologist'];

function roleOf({ nethackrc }) {
    return /role:([A-Za-z]+)/u.exec(nethackrc)[1];
}

function adjacentSecretSquares() {
    const { ux, uy } = game.u;
    let count = 0;
    for (let x = ux - 1; x < ux + 2; ++x)
        for (let y = uy - 1; y < uy + 2; ++y) {
            if (!isok(x, y) || (x === ux && y === uy)) continue;
            const { typ } = game.level.at(x, y);
            if (typ === SDOOR || typ === SCORR) ++count;
        }
    return count;
}

function seenAdjacentTraps() {
    const { ux, uy } = game.u;
    return (game.level.traps ?? []).filter(
        (trap) => trap.tseen
            && Math.max(Math.abs(trap.tx - ux), Math.abs(trap.ty - uy)) === 1,
    ).length;
}

function searchingIntrinsic() {
    return Boolean(game.u.uprops[SEARCHING]?.intrinsic);
}

test('automatic-search matrix contains only source-selected inputs', () => {
    const recipe = loadAutomaticSearchRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 6);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // detect.c dosearch0(1) is the only arm under test. A single `s` or a
        // `#search` would add the aflag == 0 arm, whose refusals js/cmd.js
        // owns, and stop the matrix measuring the turn loop.
        assert.equal(/[s#]/u.test(segment.moves), false);
    }
    // Five segments exercise the block and one is the control that must not.
    const searching = recipe.segments.filter(
        (segment) => SEARCHING_AT_LEVEL_ONE.includes(roleOf(segment)),
    );
    assert.equal(searching.length, 5);
    // Both level-one roles have to stay covered: they carry different Wisdom,
    // which is what exercise(A_WIS, TRUE) draws against on a find.
    assert.deepEqual(
        [...new Set(searching.map(roleOf))].sort(),
        [...SEARCHING_AT_LEVEL_ONE].sort(),
    );
});

test('every matrix segment runs to its last keystroke', async () => {
    const { segments } = loadAutomaticSearchRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('the matrix covers a secret door and traps found without a command',
    async () => {
        const { segments } = loadAutomaticSearchRecipe();
        let doorsFound = 0;
        let trapsFound = 0;
        for (const segment of segments) {
            if (!SEARCHING_AT_LEVEL_ONE.includes(roleOf(segment))) continue;
            // Every one of these segments starts at the first command prompt,
            // so replaying no keys is the state its turns start from.
            await runSegment({ ...segment, moves: '' });
            assert.equal(searchingIntrinsic(), true, roleOf(segment));
            const secretBefore = adjacentSecretSquares();

            await runSegment(segment);
            doorsFound += secretBefore - adjacentSecretSquares();
            trapsFound += seenAdjacentTraps();
        }
        // One secret door in the 9300984 segment; a rust trap and a pit in
        // 1144; a falling rock trap and a squeaky board in 786. Every one of
        // them has to still be reached for the matrix to prove the arm.
        assert.equal(doorsFound, 1);
        assert.equal(trapsFound, 4);
    });

test('a hero without the intrinsic leaves its secret door alone', async () => {
    // allmain.c:342 gates the whole block on Searching. The control segment
    // waits beside a secret door for as many turns as the Ranger segment that
    // converts one, and must convert nothing.
    const control = loadAutomaticSearchRecipe().segments.find(
        (segment) => !SEARCHING_AT_LEVEL_ONE.includes(roleOf(segment)),
    );
    await runSegment({ ...control, moves: '' });
    assert.equal(searchingIntrinsic(), false);
    const secretBefore = adjacentSecretSquares();
    assert.equal(secretBefore, 1);

    await runSegment(control);
    assert.equal(adjacentSecretSquares(), secretBefore);
    assert.equal(seenAdjacentTraps(), 0);
    // The turns really passed: a prevented wait would leave moves at 1 and
    // make the assertions above vacuous.
    assert.equal(game.moves, control.moves.length + 1);
});
