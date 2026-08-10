import assert from 'node:assert/strict';
import test from 'node:test';

import { P_RIDING } from '../js/const.js';
import { game } from '../js/gstate.js';
import { domove } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { mattacku } from '../js/mhitu.js';
import { m_at } from '../js/monst.js';
import { PM_GOBLIN, PM_JACKAL } from '../js/monsters.js';
import { UnsupportedSimpleMonsterActionError }
    from '../js/unported_monster_actions.js';
import { UnsupportedSteedError, exercise_steed } from '../js/steed.js';
import {
    MOUNTED_MOVE_CASES,
    loadMountedMoveRecipe,
} from './run-mounted-move.mjs';
import { RIDE_COMMAND } from './run-ride-dismount.mjs';

// steed.c:393. Every number in this file that mentions the hundredth ride turn
// comes from here rather than from a replayed count.
const RIDE_TURNS_PER_SKILL_POINT = 100;

function segmentAt(index) {
    return loadMountedMoveRecipe().segments[index];
}

// Replay a matrix segment's mount and stop there, so a test can drive
// domove() itself. Index 0 is the seed-8815 room the first three cases share.
async function mounted(index = 0) {
    const segment = segmentAt(index);
    const [prefix] = segment.moves.split(RIDE_COMMAND).slice(1);
    await runSegment({
        ...segment,
        moves: `${RIDE_COMMAND}${prefix.charAt(0)}`,
        storage: { get: () => undefined, set: () => {} },
    });
    assert.ok(game.u.usteed, 'the mount prefix leaves the hero mounted');
    return game;
}

function ridingSlot(state) {
    return state.u.weapon_skills[P_RIDING];
}

// A random source that answers every rn2() with one fixed value and records
// the bounds it was asked for, which is how the two mattacku() draws are told
// apart without reading the live PRNG.
function fixedRandom(value) {
    const bounds = [];
    return { bounds, rn2: (x) => { bounds.push(x); return value; } };
}

function refuser() {
    return (reason) => {
        throw new UnsupportedSimpleMonsterActionError(reason);
    };
}

test('the mounted-move matrix contains only source-selected inputs', () => {
    const recipe = loadMountedMoveRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, MOUNTED_MOVE_CASES.length);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Each segment rides first and never waits first: a wait moves
        // mount_steed()'s impairment roll and seed 8815 then slips instead of
        // mounting, which would leave the whole segment walking on foot.
        assert.ok(segment.moves.startsWith(RIDE_COMMAND));
        assert.equal(segment.moves.startsWith(`.${RIDE_COMMAND}`), false);
    }
    // Exactly one case is long enough to reach exercise_steed()'s
    // `u.urideturns >= 100` arm, and it is the one whose keys spend more than
    // a hundred steps. 12 round trips of ten steps, plus the opening 'j', is
    // 121, so the counter resets once and ends 21 past the reset.
    const past = MOUNTED_MOVE_CASES.filter(
        ({ rideTurns, moves }) => moves.length > RIDE_TURNS_PER_SKILL_POINT
            && rideTurns === 121 - RIDE_TURNS_PER_SKILL_POINT,
    );
    assert.equal(past.length, 1);
});

test('exercise_steed() counts nothing for a hero who is not mounted',
    async () => {
    // steed.c:389-390. hack.c domove_core() calls it behind `if (u.usteed)`,
    // so the guard is C being defensive; keeping it means the counter cannot
    // drift on a dismounted hero.
    const state = await mounted();
    state.u.usteed = null;
    state.u.urideturns = 7;
    exercise_steed(state);
    assert.equal(state.u.urideturns, 7);
});

test('exercise_steed() trains riding on the hundredth step and not before',
    async () => {
    const state = await mounted();
    const advance = ridingSlot(state).advance;

    state.u.urideturns = RIDE_TURNS_PER_SKILL_POINT - 2;
    exercise_steed(state);
    assert.equal(state.u.urideturns, RIDE_TURNS_PER_SKILL_POINT - 1);
    assert.equal(ridingSlot(state).advance, advance);

    exercise_steed(state);
    // steed.c:394-395 zeroes the counter and spends the point in one step.
    assert.equal(state.u.urideturns, 0);
    assert.equal(ridingSlot(state).advance, advance + 1);
});

test('a mounted step carries the steed and trains one ride turn', async () => {
    // hack.c:2879-2884, the tentative move. The steed's square is the hero's.
    const state = await mounted();
    const steed = state.u.usteed;
    const before = { x: state.u.ux, y: state.u.uy };
    state.u.urideturns = 0;
    state.u.dx = -1; // west, into the open room the segment mounts in
    state.u.dy = 0;
    state.context.move = 1;

    await domove(state);

    assert.equal(state.u.ux, before.x - 1);
    assert.equal(state.u.uy, before.y);
    assert.equal(steed.mx, state.u.ux);
    assert.equal(steed.my, state.u.uy);
    assert.equal(state.u.urideturns, 1);
});

test('a mounted step the terrain refuses moves and trains nothing',
    async () => {
    // The steed write sits below test_move(), so a step that never commits
    // leaves both the position and the counter alone. Seed 8815 mounts the
    // hero against the room's east wall, which is the square this pushes into.
    const state = await mounted();
    const steed = state.u.usteed;
    const before = { x: state.u.ux, y: state.u.uy };
    state.u.urideturns = 0;
    state.u.dx = 1;
    state.u.dy = 0;
    state.context.move = 1;

    await domove(state);

    assert.equal(state.u.ux, before.x);
    assert.equal(state.u.uy, before.y);
    assert.equal(steed.mx, before.x);
    assert.equal(steed.my, before.y);
    assert.equal(state.u.urideturns, 0);
    // hack.c:2843-2846 clears the turn flag when test_move() declines.
    assert.equal(state.context.move, 0);
});

test('a steed that cannot move stops the step before the hero leaves',
    async () => {
    // hack.c:2815-2818. stucksteed() reports through do_name.c YMonnam(),
    // which is unported, so js/steed.js stops there instead; either way the
    // hero has not moved yet when the answer arrives.
    const state = await mounted();
    const steed = state.u.usteed;
    const before = { x: state.u.ux, y: state.u.uy };
    state.u.urideturns = 0;
    state.u.dx = -1;
    state.u.dy = 0;
    state.context.move = 1;
    steed.msleeping = 1; // const.js helpless() reads msleeping and mcanmove

    await assert.rejects(
        domove(state),
        (error) => error instanceof UnsupportedSteedError
            && /won't move/u.test(error.message),
    );
    steed.msleeping = 0;

    assert.equal(state.u.ux, before.x);
    assert.equal(state.u.uy, before.y);
    assert.equal(state.u.urideturns, 0);
});

test('the steed gate asks stucksteed() the question C asks it', async () => {
    // hack.c:2815 passes checkfeeding FALSE. do.c dodown() and doup() are the
    // callers that pass TRUE, so a steed in the middle of a meal stops a
    // descent and not a step -- and js/steed.js only reports the meal for the
    // TRUE argument. Nothing in the port leaves a steed feeding today, which
    // is why the flag is set here by hand.
    const state = await mounted();
    const steed = state.u.usteed;
    const before = { x: state.u.ux, y: state.u.uy };
    state.u.urideturns = 0;
    steed.meating = 1;
    state.u.dx = -1;
    state.u.dy = 0;
    state.context.move = 1;

    await domove(state);
    steed.meating = 0;

    assert.equal(state.u.ux, before.x - 1);
    assert.equal(steed.mx, state.u.ux);
    assert.equal(state.u.urideturns, 1);
});

test('the steed gate reads the step direction, not just the steed',
    async () => {
    // The C test is `(u.dx || u.dy) && u.usteed && stucksteed(FALSE)`. A
    // zero-length step never asks, so a helpless steed cannot stop one.
    const state = await mounted();
    // Step off the potion the pony was standing on first, so the zero-length
    // step below lands on plain floor and prints nothing.
    state.u.dx = -1;
    state.u.dy = 0;
    state.context.move = 1;
    await domove(state);

    const steed = state.u.usteed;
    const before = { x: state.u.ux, y: state.u.uy };
    steed.msleeping = 1;
    state.u.dx = 0;
    state.u.dy = 0;
    state.context.move = 1;

    // The step commits: the hero stays put because the offset is zero, not
    // because anything refused, and the steed comes along to the same square.
    await domove(state);
    steed.msleeping = 0;

    assert.equal(state.u.ux, before.x);
    assert.equal(state.u.uy, before.y);
    assert.equal(steed.mx, before.x);
    assert.equal(steed.my, before.y);
});

test('every monster that reaches mattacku() spends a draw on the steed',
    async () => {
    // mhitu.c:534, `!rn2(is_orc(mtmp->data) ? 2 : 4)`. The bound is the whole
    // point: an orc goes for the horse twice as often as anything else.
    const state = await mounted();
    const attacker = {
        data: state.mons[PM_GOBLIN], mx: state.u.ux + 5, my: state.u.uy,
    };
    const orcish = fixedRandom(1); // a nonzero draw declines the steed
    assert.equal(
        mattacku(attacker, { state, random: orcish, unsupported: refuser() }),
        false,
    );
    assert.deepEqual(orcish.bounds, [2]);

    const jackal = {
        data: state.mons[PM_JACKAL], mx: state.u.ux + 5, my: state.u.uy,
    };
    const plain = fixedRandom(1);
    assert.equal(
        mattacku(jackal, { state, random: plain, unsupported: refuser() }),
        false,
    );
    assert.deepEqual(plain.bounds, [4]);
});

test('mattacku() draws before it tests adjacency and refuses only when both',
    async () => {
    const state = await mounted();
    // you.h:560 m_next2u() is `distu <= 2`, and dist2() squares, so the
    // boundary sits on the diagonal neighbour: dx and dy of one apiece make
    // exactly 2, and the next square out makes 4.
    const far = {
        data: state.mons[PM_GOBLIN], mx: state.u.ux + 5, my: state.u.uy,
    };
    const near = {
        data: state.mons[PM_GOBLIN], mx: state.u.ux + 1, my: state.u.uy,
    };
    const diagonal = {
        data: state.mons[PM_GOBLIN], mx: state.u.ux - 1, my: state.u.uy - 1,
    };

    const spared = fixedRandom(0);
    assert.equal(
        mattacku(far, { state, random: spared, unsupported: refuser() }),
        false,
    );
    assert.deepEqual(spared.bounds, [2], 'the draw happens either way');

    for (const attacker of [near, diagonal]) {
        assert.throws(
            () => mattacku(attacker, {
                state, random: fixedRandom(0), unsupported: refuser(),
            }),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && /steed/u.test(error.message),
        );
    }
    // The same neighbour with a nonzero draw is C's fall-through to the arms
    // that attack the rider, which this port refuses further down instead.
    assert.equal(
        mattacku(near, {
            state, random: fixedRandom(1), unsupported: refuser(),
        }),
        false,
    );
});

test('mattacku() spends no draw on the steed itself or on a hero on foot',
    async () => {
    // mhitu.c:530-532. mon.c movemon() skips u.usteed, so C's own guard is
    // unreachable in play; it still has to answer the way C does.
    const state = await mounted();
    const steed = state.u.usteed;
    const forSteed = fixedRandom(0);
    assert.equal(
        mattacku(steed, { state, random: forSteed, unsupported: refuser() }),
        true,
    );
    assert.deepEqual(forSteed.bounds, []);

    state.u.usteed = null;
    const onFoot = fixedRandom(0);
    const attacker = {
        data: state.mons[PM_GOBLIN], mx: state.u.ux + 1, my: state.u.uy,
    };
    assert.equal(
        mattacku(attacker, { state, random: onFoot, unsupported: refuser() }),
        false,
    );
    assert.deepEqual(onFoot.bounds, []);
});

test('mattacku() ends a multi-turn action for an adjacent attacker only',
    async () => {
    // mhitu.c:512-513, `if (!ranged) nomul(0)`, where mhitu.c:453 sets
    // `ranged = (mdistu(mtmp) > 3)`. dist2() never returns 3, so the squares
    // that end a run are exactly m_next2u()'s.
    const state = await mounted();
    const near = { data: state.mons[PM_GOBLIN], mx: state.u.ux + 1, my: state.u.uy };
    const far = { data: state.mons[PM_GOBLIN], mx: state.u.ux + 5, my: state.u.uy };

    // hack.c nomul() ends a run through endRunning(), which is the effect a
    // recorded case can see; its own `multi < nval` guard makes a negative
    // count the wrong thing to watch.
    state.context.run = 1;
    mattacku(far, { state, random: fixedRandom(1), unsupported: refuser() });
    assert.equal(state.context.run, 1, 'a distant attacker leaves the run');

    mattacku(near, { state, random: fixedRandom(1), unsupported: refuser() });
    assert.equal(state.context.run, 0);
});

test('the matrix mounts a pony that the map really holds', async () => {
    // The mount direction each segment answers getdir() with is read off the
    // arrival screen. If a re-recorded map moved the pony, this is where the
    // matrix stops being about riding at all.
    const state = await mounted();
    assert.equal(m_at(state.u.ux, state.u.uy, state), null,
        'a ridden steed is off the map, as steed.c:379 leaves it');
    assert.ok(state.u.usteed.mextra?.edog,
        'the steed is the starting pet, so dog.c saddled it');
});
