import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadBarehandedMeleeMissRecipe,
    loadWieldedMeleeMissRecipe,
    MELEE_DATETIME,
} from './run-hostile-melee-miss.mjs';

// cmd.c's vi-key bindings, restricted to what these recipes press.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

function recipeHygiene(recipe, segments, label) {
    assert.equal(recipe.version, 5, label);
    assert.equal(recipe.segments.length, segments, label);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false, label);
        assert.equal(segment.datetime, MELEE_DATETIME, label);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // No pet: a pet beside a hostile reaches dogmove.c's own attack, which
        // is refused, so the matrix would stop for an unrelated reason.
        assert.match(segment.nethackrc, /pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => Object.hasOwn(DIRECTIONS, key)),
            `${label} presses movement keys only`,
        );
    }
}

test('the melee miss matrix contains only source-selected inputs', () => {
    recipeHygiene(loadWieldedMeleeMissRecipe(), 10, 'wielded');
    recipeHygiene(loadBarehandedMeleeMissRecipe(), 3, 'bare-handed');
});

// One row per segment, in recipe order. Every figure was read off a replay and
// then confirmed against a fresh C recording by
// `node scripts/run-hostile-melee-miss.mjs`.
//
// `draws` is the head of the final key's random-number slice, and it is the
// whole point of the slice: uhitm.c spends rn2(20) inside overexertion()'s
// gethungry() at 524, rn2(19) inside exercise(A_STR, TRUE) at 543, rnd(20) for
// the to-hit roll at 780, and rn2(3) at 6013 to guard passive()'s second
// switch. The calls after them belong to the turn loop and are left to the
// fresh differential.
//
// `hp` is the target's hit points after the swing, which is what separates a
// miss from a hit: uhitm.c hmon() is unported, so a hit stops the segment
// instead of finishing it.
const WIELDED = [
    // Northeast into an adjacent lichen, `verbose` on.
    {
        draws: ['rn2(20)=0', 'rn2(19)=1', 'rnd(20)=16', 'rn2(3)=1'],
        turns: 1, hp: 3, message: 'You miss the lichen.',
    },
    // The same swing with `verbose` off: uhitm.c:5211 rather than 5209.
    {
        draws: ['rn2(20)=0', 'rn2(19)=1', 'rnd(20)=16', 'rn2(3)=1'],
        turns: 1, hp: 3, message: 'You miss it.',
    },
    // The second of two swings at the same target, so its draws differ from
    // the first row's even though the seed and the first key are identical.
    {
        draws: ['rn2(20)=0', 'rn2(19)=17', 'rnd(20)=17', 'rn2(3)=2'],
        turns: 2, hp: 3, message: 'You miss the lichen.',
    },
    {
        draws: ['rn2(20)=18', 'rn2(19)=12', 'rnd(20)=17', 'rn2(3)=2'],
        turns: 2, hp: 3, message: 'You miss the lichen.',
    },
    // A walk, then the swing.
    {
        draws: ['rn2(20)=4', 'rn2(19)=3', 'rnd(20)=15', 'rn2(3)=1'],
        turns: 2, hp: 2, message: 'You miss the lichen.',
    },
    {
        draws: ['rn2(20)=18', 'rn2(19)=14', 'rnd(20)=18', 'rn2(3)=0'],
        turns: 3, hp: 4, message: 'You miss the lichen.',
    },
    {
        draws: ['rn2(20)=7', 'rn2(19)=1', 'rnd(20)=18', 'rn2(3)=2'],
        turns: 1, hp: 3, message: 'You miss the lichen.',
    },
    {
        draws: ['rn2(20)=5', 'rn2(19)=6', 'rnd(20)=13', 'rn2(3)=0'],
        turns: 2, hp: 2, message: 'You miss the lichen.',
    },
    // The newt rows. Its armor class is 8 against the lichen's 9.
    {
        draws: ['rn2(20)=5', 'rn2(19)=15', 'rnd(20)=15', 'rn2(3)=2'],
        turns: 1, hp: 4, message: 'You miss the newt.',
    },
    {
        draws: ['rn2(20)=2', 'rn2(19)=8', 'rnd(20)=20', 'rn2(3)=1'],
        turns: 1, hp: 2, message: 'You miss the newt.',
    },
];

// The Monk rows. mattk[0] is AT_CLAW and nothing is wielded, so
// find_roll_to_hit() adds (u.ulevel / 3) + 2 and skips hitval().
const BAREHANDED = [
    {
        draws: ['rn2(20)=8', 'rn2(19)=15', 'rnd(20)=20', 'rn2(3)=0'],
        turns: 1, hp: 2, message: 'You miss the lichen.',
    },
    {
        draws: ['rn2(20)=16', 'rn2(19)=5', 'rnd(20)=18', 'rn2(3)=1'],
        turns: 1, hp: 4, message: 'You miss the lichen.',
    },
    {
        draws: ['rn2(20)=12', 'rn2(19)=2', 'rnd(20)=19', 'rn2(3)=1'],
        turns: 2, hp: 4, message: 'You miss the lichen.',
    },
];

async function assertMissSegment(segment, expected, label) {
    const replay = await runSegment(segment);
    // The port emits one screen per consumed key plus the opening prompt. A
    // segment that stopped early would emit fewer, and stopping early is
    // exactly what a target that earned a movement ration would cause:
    // js/unported_monster_actions.js refuses a monster's attack on the hero,
    // and after a miss the target is alive and adjacent. This count is
    // therefore the check that no target acted on its turn.
    assert.equal(
        replay.getScreens().length,
        segment.moves.length + 1,
        `${label} replays every key`,
    );
    // game.moves starts at 1, so the elapsed turns are one less. Every key
    // here costs a turn: a walk moves, and a swing spends the move whether or
    // not it lands.
    assert.equal(game.moves - 1, expected.turns, label);

    const [dx, dy] = DIRECTIONS[segment.moves.at(-1)];
    const target = game.level.monsters[game.u.ux + dx][game.u.uy + dy];
    assert.ok(target, `${label} left the target where it stood`);
    assert.equal(target.mhp, expected.hp, `${label} did no damage`);
    assert.equal(target.mhp, target.mhpmax, label);
    // uhitm.c attack_checks() clears STRAT_WAITMASK at 195, and mon.c
    // setmangry() clears it again at 4288 through missum()'s wakeup().
    assert.equal(target.mstrategy, 0, label);
    // The target is neither asleep nor frozen, so missum() took its wakeup()
    // arm at uhitm.c:5213 rather than the helpless() skip.
    assert.equal(target.msleeping, 0, label);
    assert.equal(Boolean(target.mcanmove), true, label);

    const slice = replay.getRngSlices().at(-1);
    assert.deepEqual(slice.slice(0, 4), expected.draws, label);
    assert.equal(game._pending_message, expected.message, label);
}

test('every wielded miss spends its four calls in source order', async () => {
    const recipe = loadWieldedMeleeMissRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        await assertMissSegment(
            segment,
            WIELDED[index],
            `wielded segment ${index} (seed ${segment.seed})`,
        );
    }
});

test('a bare-handed miss spends the same four calls', async () => {
    const recipe = loadBarehandedMeleeMissRecipe();
    for (const [index, segment] of recipe.segments.entries()) {
        await assertMissSegment(
            segment,
            BAREHANDED[index],
            `bare-handed segment ${index} (seed ${segment.seed})`,
        );
    }
});

// The hero does not move on to the destination square: uhitm.c do_attack()
// returns TRUE, which ends hack.c domove_core() at 2799 before test_move().
test('a missed swing leaves the hero where it stood', async () => {
    const segment = loadWieldedMeleeMissRecipe().segments[0];
    await runSegment({ ...segment, moves: '' });
    const before = [game.u.ux, game.u.uy];

    await runSegment(segment);
    assert.deepEqual([game.u.ux, game.u.uy], before);
    assert.equal(game.u.umoved, false);
});
