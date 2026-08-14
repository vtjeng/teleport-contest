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
// apart without reading the live PRNG. rnd() answers 1, the lowest roll a
// twenty-sided to-hit test can produce, so mattacku()'s melee arms always
// reach their hit side and stop there.
function fixedRandom(value) {
    const bounds = [];
    return { bounds, rn2: (x) => { bounds.push(x); return value; }, rnd: () => 1 };
}

function refuser() {
    return (reason) => {
        throw new UnsupportedSimpleMonsterActionError(reason);
    };
}

// mattacku() runs past the steed arm now, so every fixture below states the
// fields the armor-class differential and the attack loop read. mux and muy
// are the hero's own square, which is what set_apparxy() leaves behind for a
// monster that has not been fooled.
function attackerAt(state, species, dx, dy) {
    return {
        data: state.mons[species],
        mx: state.u.ux + dx,
        my: state.u.uy + dy,
        mux: state.u.ux,
        muy: state.u.uy,
        m_lev: 0,
        mcansee: true,
    };
}

// The operations mattacku() resolves below the steed arm. thrwmu() and
// mon_wield_item() are the two owners a distant or armed attacker reaches
// before any refusal; both are inert for these fixtures, which carry no
// inventory.
function steedTestEnv(state, random) {
    return {
        state,
        random,
        unsupported: refuser(),
        throwRangedWeapon: () => {},
        wieldMonsterItem: async () => 0,
    };
}

test('the mounted-move matrix contains only source-selected inputs', () => {
    const recipe = loadMountedMoveRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, MOUNTED_MOVE_CASES.length);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Each segment rides first: a wait moves mount_steed()'s impairment
        // roll and seed 8815 then slips instead of mounting, which would leave
        // the whole segment walking on foot while the differential still
        // passed. This guards segmentFor()'s template, not the case table, so
        // it is a weak oracle on its own; what actually catches a failed mount
        // is `assert.ok(game.u.usteed)` in mounted() and the rideTurns and
        // stillMounted checks in verifyMountedMoveSegment().
        assert.ok(segment.moves.startsWith(RIDE_COMMAND));
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
    // Five squares away both attackers believe they are out of reach, so the
    // steed draw is the only one either spends.
    const state = await mounted();
    const attacker = attackerAt(state, PM_GOBLIN, 5, 0);
    const orcish = fixedRandom(1); // a nonzero draw declines the steed
    assert.equal(await mattacku(attacker, steedTestEnv(state, orcish)), false);
    assert.deepEqual(orcish.bounds, [2]);

    const jackal = attackerAt(state, PM_JACKAL, 5, 0);
    const plain = fixedRandom(1);
    assert.equal(await mattacku(jackal, steedTestEnv(state, plain)), false);
    assert.deepEqual(plain.bounds, [4]);
});

test('mattacku() draws before it tests adjacency and refuses only when both',
    async () => {
    const state = await mounted();
    // you.h:560 m_next2u() is `distu <= 2`, and dist2() squares, so the
    // boundary sits on the diagonal neighbour: dx and dy of one apiece make
    // exactly 2, and the next square out makes 4.
    const far = attackerAt(state, PM_GOBLIN, 5, 0);
    const near = attackerAt(state, PM_GOBLIN, 1, 0);
    const diagonal = attackerAt(state, PM_GOBLIN, -1, -1);

    const spared = fixedRandom(0);
    assert.equal(await mattacku(far, steedTestEnv(state, spared)), false);
    assert.deepEqual(spared.bounds, [2], 'the draw happens either way');

    for (const attacker of [near, diagonal]) {
        await assert.rejects(
            () => mattacku(attacker, steedTestEnv(state, fixedRandom(0))),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && /steed/u.test(error.message),
        );
    }
    // The same neighbour with a nonzero draw is C's fall-through to the arms
    // that attack the rider. That is the AT_WEAP melee arm, whose to-hit test
    // this random source always passes, so it stops at hitmu() instead.
    await assert.rejects(
        () => mattacku(near, steedTestEnv(state, fixedRandom(1))),
        (error) => error instanceof UnsupportedSimpleMonsterActionError
            && /landing a hit/u.test(error.message),
    );
});

test('mattacku() spends no draw on the steed itself or on a hero on foot',
    async () => {
    // mhitu.c:530-532. A ridden steed does stay in fmon with mstate
    // MON_FLOOR and does reach dochug(); what keeps it out of mattacku() is
    // monmove.c:966's !mtmp->mpeaceful gate, because tame implies peaceful.
    // Conflict is the disjunct that would make the arm live, and
    // assertSimpleScanState() refuses that today. C's own guard still has to
    // answer the way C does.
    const state = await mounted();
    const steed = state.u.usteed;
    const forSteed = fixedRandom(0);
    // mhitu.c:532 returns 0 here, and the port's contract is that TRUE means
    // C returned 1, so the steed's own arm answers false and spends no draw.
    assert.equal(await mattacku(steed, steedTestEnv(state, forSteed)), false);
    assert.deepEqual(forSteed.bounds, []);

    state.u.usteed = null;
    const onFoot = fixedRandom(0);
    const attacker = attackerAt(state, PM_GOBLIN, 1, 0);
    // A hero on foot skips the steed draw entirely and falls straight through
    // to the melee arm, which stops at hitmu() without any rn2() of its own.
    await assert.rejects(
        () => mattacku(attacker, steedTestEnv(state, onFoot)),
        (error) => error instanceof UnsupportedSimpleMonsterActionError
            && /landing a hit/u.test(error.message),
    );
    assert.deepEqual(onFoot.bounds, []);
});

test('mattacku() ends a multi-turn action for an adjacent attacker only',
    async () => {
    // mhitu.c:512-513, `if (!ranged) nomul(0)`, where mhitu.c:453 sets
    // `ranged = (mdistu(mtmp) > 3)`. dist2() never returns 3, so the squares
    // that end a run are exactly m_next2u()'s.
    const state = await mounted();
    const near = attackerAt(state, PM_GOBLIN, 1, 0);
    const far = attackerAt(state, PM_GOBLIN, 5, 0);

    // hack.c nomul() ends a run through endRunning(), which is the effect a
    // recorded case can see; its own `multi < nval` guard makes a negative
    // count the wrong thing to watch.
    state.context.run = 1;
    await mattacku(far, steedTestEnv(state, fixedRandom(1)));
    assert.equal(state.context.run, 1, 'a distant attacker leaves the run');

    // The adjacent attacker ends the run in the preamble and stops at hitmu()
    // afterwards, so the interruption has to be read through the refusal.
    await assert.rejects(
        () => mattacku(near, steedTestEnv(state, fixedRandom(1))),
        (error) => error instanceof UnsupportedSimpleMonsterActionError,
    );
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
