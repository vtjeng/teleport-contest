import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_DEX,
    BOTH_SIDES,
    CQ_CANNED,
    LEFT_SIDE,
    RIGHT_SIDE,
    SLT_ENCUMBER,
    TIMEOUT,
    TT_BEARTRAP,
    TT_NONE,
    UNENCUMBERED,
    WOUNDED_LEGS,
} from '../js/const.js';
import { heal_legs } from '../js/do.js';
import { game } from '../js/gstate.js';
import { near_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { nh_timeout_elapsed_turn } from '../js/timeout.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    preflightSimpleMonsterActions,
} from '../js/unported_monster_actions.js';
import { loadWoundedLegsRecipe } from './run-wounded-legs.mjs';

// The keys every segment is allowed to spend: five compass directions for the
// walk-in and the escape struggles, space for the More prompts look_here() and
// the trap line raise, and the '.' that do.c donull() answers.
const SEGMENT_KEYS = new Set(['j', 'l', 'b', 'n', 'y', ' ', '.']);

function woundedLegs() {
    return game.u.uprops[WOUNDED_LEGS];
}

// Start a unit case from a real generated game rather than a synthetic state:
// heal_legs() reaches encumber_msg() and weight_cap(), which read carried
// weight, Strength and Constitution. The Healer segment is the one whose hero
// carries little enough that no wounded leg crosses an encumbrance threshold,
// so nothing here raises a More prompt with no keys left to dismiss it.
async function unwoundedHeroOnLevelOne() {
    const healer = loadWoundedLegsRecipe().segments[3];
    await runSegment({ ...healer, moves: '' });
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    return woundedLegs();
}

// Where each segment's recovery lands, and what C draws there. The key count
// is the whole prefix, so `moves.slice(0, keys)` is the segment truncated to
// the turn the countdown runs out on; the recorded C session puts the same
// line on the same step. The two Knights cross an encumbrance threshold when
// the wound lands and cross back when it heals, so encumber_msg() adds its
// line behind heal_legs()'s and the pair shares one topline.
const RECOVERIES = [
    { keys: 12, line: 'Your leg feels better.  Your movements are now '
        + 'unencumbered.', held: true },
    { keys: 17, line: 'Your leg feels better.  Your movements are now '
        + 'unencumbered.', held: true },
    { keys: 16, line: 'Your leg feels better.', held: true },
    { keys: 13, line: 'Your leg feels better.', held: true },
    { keys: 14, line: 'Your leg feels better.', held: false },
];

test('wounded-legs matrix contains only source-selected inputs', () => {
    const recipe = loadWoundedLegsRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, RECOVERIES.length);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // A pet on either square would hand the walk-in to
        // domove_swap_with_pet(), whose trap handling is a separate boundary.
        assert.match(segment.nethackrc, /OPTIONS=pettype:none/u);
        assert.ok(
            [...segment.moves].every((key) => SEGMENT_KEYS.has(key)),
            'every segment walks, dismisses a prompt, struggles or waits',
        );
        // Every wait is a '.', and they are all at the end. An 's' would be
        // swallowed by xwaitforspace() at the first --More-- and spend no
        // turn, so the countdown would never run out.
        assert.match(segment.moves, /^[jlbny ]+\.+$/u);
    }
    // Exactly two segments need two consecutive spaces: only there does
    // encumber_msg() add a second message as the wound lands, which pairs with
    // the trap line into a More prompt. The rest dismiss look_here()'s window
    // alone, and those two are the same two whose recovery line has a second
    // half. Without both kinds the matrix would pin only one of the two arms
    // encumber_msg() has inside heal_legs().
    const doubled = recipe.segments.filter(
        ({ moves }) => moves.includes('  '),
    );
    assert.equal(doubled.length, 2);
    assert.deepEqual(
        RECOVERIES.filter(({ line }) => line.includes('unencumbered')).length,
        doubled.length,
    );
});

test('every matrix segment heals its wounded leg and replays to its last key',
    async () => {
        const { segments } = loadWoundedLegsRecipe();
        for (const [index, segment] of segments.entries()) {
            const replay = await runSegment(segment);
            // The port emits one screen per consumed key plus the opening
            // prompt, so a segment that stopped at a boundary emits fewer.
            assert.equal(
                replay.getScreens().length,
                segment.moves.length + 1,
                `segment ${index} emits one screen per key plus the prompt`,
            );
            // do.c:2471 clears both halves of youprop.h:138's Wounded_legs,
            // and do.c:2454-2455 gives back the point set_wounded_legs()
            // charged. Every segment starts from an unwounded hero, so a zero
            // here can only be heal_legs() having run.
            assert.equal(woundedLegs().intrinsic, 0, `segment ${index} count`);
            assert.equal(woundedLegs().extrinsic, 0, `segment ${index} side`);
            assert.equal(game.u.atemp[A_DEX], 0, `segment ${index} Dexterity`);
            // The recovery is timeout.c's alone: waiting never works a hero
            // loose, because hack.c trapmove() is the only writer that counts
            // u.utrap down and only a movement key reaches it.
            const { held } = RECOVERIES[index];
            assert.equal(
                Boolean(game.u.utrap), held, `segment ${index} trap hold`,
            );
            assert.equal(
                game.u.utraptype, held ? TT_BEARTRAP : TT_NONE,
                `segment ${index} trap type`,
            );
        }
    });

test('each segment draws its recovery line on the turn the count runs out',
    async () => {
        const { segments } = loadWoundedLegsRecipe();
        for (const [index, segment] of segments.entries()) {
            const { keys, line } = RECOVERIES[index];
            // One key short of the recovery the wound still stands, which is
            // what makes the assertion below a turn boundary rather than just
            // an end state. How many turns are left there is not fixed at one:
            // a burdened hero moves slower than NORMAL_SPEED, so a single key
            // can spend two of allmain.c's once-per-turn rounds and take two
            // off the count.
            await runSegment({
                ...segment, moves: segment.moves.slice(0, keys - 1),
            });
            assert.ok(
                (woundedLegs().intrinsic & TIMEOUT) > 0,
                `segment ${index} still has wounded legs`,
            );
            assert.notEqual(game._ttyToplines, line);

            await runSegment({
                ...segment, moves: segment.moves.slice(0, keys),
            });
            assert.equal(game._ttyToplines, line, `segment ${index} line`);
        }
    });

test('heal_legs reports the load the healed legs lift', async () => {
    // do.c:2483-2484's own encumber_msg(). The matrix cannot separate it from
    // allmain.c:208's, because a burdened hero moves slower than NORMAL_SPEED
    // and so opens another once-per-turn round inside the same keystroke,
    // whose encumber_msg() would report the same change onto the same screen.
    // Called directly, nothing follows heal_legs() to cover for it.
    const [knight] = loadWoundedLegsRecipe().segments;
    await runSegment({ ...knight, moves: 'b  ' }); // the walk-in alone
    const wounded = woundedLegs();
    assert.ok(wounded.extrinsic, 'the walk-in wounds a leg');
    assert.equal(near_capacity(game), SLT_ENCUMBER, 'and burdens the hero');
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    // What timeout.c:671 leaves behind on the turn the count runs out.
    wounded.intrinsic = 0;

    await heal_legs(game);

    assert.equal(
        game._ttyToplines,
        'Your leg feels better.  Your movements are now unencumbered.',
    );
    assert.equal(near_capacity(game), UNENCUMBERED);
    // pickup.c encumber_msg() leaves the level it reported behind, so the next
    // caller has something to compare against.
    assert.equal(game.go.oldcap, UNENCUMBERED);
});

test('heal_legs leaves an unwounded hero untouched', async () => {
    // do.c:2452's `if (Wounded_legs)` wraps the whole function.
    const wounded = await unwoundedHeroOnLevelOne();
    assert.equal(wounded.intrinsic, 0);
    assert.equal(wounded.extrinsic, 0);
    game.disp.botl = false;
    game.u.atemp[A_DEX] = -1; // would be restored if the guard let it through

    await heal_legs(game);

    assert.equal(game._ttyToplines, '');
    assert.equal(game.disp.botl, false);
    assert.equal(game.u.atemp[A_DEX], -1);
});

test('heal_legs answers either half of Wounded_legs on its own', async () => {
    // youprop.h:138 spells Wounded_legs as HWounded_legs || EWounded_legs.
    // A hero mid-countdown carries both, so neither operand alone proves the
    // OR; these two states are where it is distinguishable from an AND. The
    // intrinsic-only one is also the state the caller hands over, because
    // timeout.c:671 has just counted the intrinsic down to zero.
    for (const [name, intrinsic, extrinsic] of [
        ['side bits alone', 0, LEFT_SIDE],
        ['a timeout alone', 4, 0],
    ]) {
        const wounded = await unwoundedHeroOnLevelOne();
        wounded.intrinsic = intrinsic;
        wounded.extrinsic = extrinsic;
        game.u.atemp[A_DEX] = -1;

        await heal_legs(game);

        assert.equal(game._ttyToplines, 'Your leg feels better.', name);
        assert.equal(wounded.intrinsic, 0, name);
        assert.equal(wounded.extrinsic, 0, name);
        assert.equal(game.u.atemp[A_DEX], 0, name);
    }
});

test('heal_legs pluralises the line only when both legs are wounded',
    async () => {
        // do.c:2464-2468. objnam.c vtense() agrees with the subject it is
        // given, so the verb moves with the noun: one leg "feels" better and
        // two "feel" better. No caller inside the bear-trap boundary can reach
        // this arm -- trap.c:1520 writes one side bit, `rn2(2) ? RIGHT_SIDE :
        // LEFT_SIDE` -- so the pair is pinned here instead.
        for (const [side, expected] of [
            [LEFT_SIDE, 'Your leg feels better.'],
            [RIGHT_SIDE, 'Your leg feels better.'],
            [BOTH_SIDES, 'Your legs feel better.'],
        ]) {
            const wounded = await unwoundedHeroOnLevelOne();
            wounded.intrinsic = 0;
            wounded.extrinsic = side;

            await heal_legs(game);

            assert.equal(game._ttyToplines, expected);
        }
    });

test('heal_legs says nothing to a mounted hero but still heals', async () => {
    // do.c:2461. While riding, the wound belongs to the steed, so the hero is
    // told nothing about his own legs. steed.c mount_steed() refuses a hero
    // who already carries the wound and js/hack.js refuses a ride outright, so
    // the field is written directly here.
    const wounded = await unwoundedHeroOnLevelOne();
    wounded.intrinsic = 0;
    wounded.extrinsic = RIGHT_SIDE;
    game.u.atemp[A_DEX] = -1;
    game.u.usteed = { mx: game.u.ux, my: game.u.uy };

    await heal_legs(game);

    assert.equal(game._ttyToplines, '');
    // Everything outside the message still ran.
    assert.equal(wounded.extrinsic, 0);
    assert.equal(game.u.atemp[A_DEX], 0);
    assert.equal(game.disp.botl, true);
    game.u.usteed = null;
});

test('heal_legs gives back one point of Dexterity and no more', async () => {
    // do.c:2453-2454. set_wounded_legs() spends a point only for a fresh wound
    // (do.c:2427-2428) and this restores one only while the total is still
    // negative, so the two guards differ and the pair is not a plain inverse.
    // Each row is a temporary Dexterity the hero could hold when the count
    // runs out.
    for (const [before, after] of [
        [-2, -1], // two wounds' worth, or one plus another drain
        [-1, 0],  // the ordinary case, one bear trap
        [0, 0],   // nothing to give back
        [1, 1],   // a hero whose Dexterity was raised while wounded
    ]) {
        const wounded = await unwoundedHeroOnLevelOne();
        wounded.intrinsic = 0;
        wounded.extrinsic = LEFT_SIDE;
        game.u.atemp[A_DEX] = before;

        await heal_legs(game);

        assert.equal(game.u.atemp[A_DEX], after, `from ${before}`);
    }
});

test('the expiring timeout interrupts what the hero was doing', async () => {
    // timeout.c:776. heal_legs() is followed by stop_occupation(), which for a
    // hero with no occupation running takes allmain.c:694's `else if (multi >=
    // 0) nomul(0)` and so ends a run through hack.c end_running(). Nothing
    // else on this path clears context.run.
    const wounded = await unwoundedHeroOnLevelOne();
    wounded.intrinsic = 1;
    wounded.extrinsic = LEFT_SIDE;
    game.context.run = 3;

    await nh_timeout_elapsed_turn(game);

    assert.equal(wounded.intrinsic & TIMEOUT, 0);
    assert.equal(game.context.run, 0);
});

// The seam nh_timeout_elapsed_turn() threads through to heal_legs() and
// encumber_msg(). The elapsed turn is dry run on a cloned state before it is
// run live, and that pass has to write nothing; the env is how it stays
// silent. Both halves are asserted here, because a seam that ignores its
// argument and a seam that has no default are the same mistake seen from
// either side.
test('the elapsed turn writes its recovery line through the seam it is given',
    async () => {
        const injected = await unwoundedHeroOnLevelOne();
        injected.intrinsic = 1; // one turn left, so this turn runs it out
        injected.extrinsic = LEFT_SIDE;
        game.u.atemp[A_DEX] = -1;
        const recorded = [];

        await nh_timeout_elapsed_turn(game, {
            message: async (text) => { recorded.push(text); },
            statusRefresh: () => {},
        });

        assert.deepEqual(recorded, ['Your leg feels better.']);
        assert.equal(game._ttyToplines, '',
                     'and nothing reached the live display');
        // The state changes happen either way; only where the line went moved.
        assert.equal(injected.intrinsic & TIMEOUT, 0);
        assert.equal(injected.extrinsic, 0);
        assert.equal(game.u.atemp[A_DEX], 0);

        // With no env the same call takes heal_legs()'s own default, which is
        // js/tty_message.js ttyPline, and the line lands on the live display.
        const live = await unwoundedHeroOnLevelOne();
        live.intrinsic = 1;
        live.extrinsic = LEFT_SIDE;
        game.u.atemp[A_DEX] = -1;

        await nh_timeout_elapsed_turn(game);

        assert.equal(game._ttyToplines, 'Your leg feels better.');
        assert.equal(live.intrinsic & TIMEOUT, 0);
        assert.equal(game.u.atemp[A_DEX], 0);
    });

test('the planning round heals the clone and leaves the live hero alone',
    async () => {
        // The burdened Knight, one key short of its recovery, taken through
        // js/unported_monster_actions.js preflightSimpleMonsterActions() --
        // the production dry run. Its advanceRound is where allmain.c's
        // once-per-turn block runs on the clone, and the silent pair supplied
        // here is the one the live call site passes when planning.
        const [knight] = loadWoundedLegsRecipe().segments;
        await runSegment({ ...knight, moves: knight.moves.slice(0, 11) });
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        const live = woundedLegs();
        assert.ok(live.extrinsic, 'the walk-in wounded a leg');
        // What the turn under test starts from: one tick left on the count.
        // The Knight is two short of that at this key, and how many keys it
        // takes is not what this case is about.
        live.intrinsic = 1;
        game.u.atemp[A_DEX] = -1;

        const recorded = [];
        let reachedRound = false;
        const inspected = new Error('planning round inspected');

        await assert.rejects(
            () => preflightSimpleMonsterActions(game, {
                async advanceRound(planned) {
                    reachedRound = true;
                    await nh_timeout_elapsed_turn(planned, {
                        message: async (text) => { recorded.push(text); },
                        statusRefresh: () => {},
                    });
                    const clone = planned.u.uprops[WOUNDED_LEGS];
                    // The same state changes the live pass will make.
                    assert.equal(clone.intrinsic & TIMEOUT, 0);
                    assert.equal(clone.extrinsic, 0);
                    assert.equal(planned.u.atemp[A_DEX], 0);
                    // A burdened hero crosses back to UNENCUMBERED as the
                    // wound heals, so encumber_msg() adds its own line behind
                    // heal_legs()'s. ttyPline() would join the two on one top
                    // line; the recorder keeps them as written.
                    assert.deepEqual(recorded, [
                        'Your leg feels better.',
                        'Your movements are now unencumbered.',
                    ]);
                    throw inspected;
                },
            }),
            (error) => error === inspected,
        );

        assert.ok(reachedRound, 'the planning round must have run');
        // Nothing the round computed reached the live game.
        assert.equal(game._ttyToplines, '');
        assert.equal(live.intrinsic, 1);
        assert.ok(live.extrinsic);
        assert.equal(game.u.atemp[A_DEX], -1);
    });

test('the planning clone leaves the live canned command queue alone',
    async () => {
        // The interruption above is why this case exists. stop_occupation()
        // reaches cmdq_clear(CQ_CANNED) through nomul(0) and again
        // unconditionally at allmain.c:352, and cmdq_clear() empties the array
        // in place. Every other route into stop_occupation() from the dry run
        // is gated on an active occupation; this one is gated on nothing, so
        // it fires on any turn a wounded-legs timeout expires -- which is a
        // burdened hero's ordinary turn.
        //
        // planningState() isolates state by naming fields, so a field nobody
        // named is shared. If command_queue is shared, the dry run discards a
        // canned sequence the live game had pending. It stays invisible in a
        // replay because the live pass then repeats the same clear.
        const wounded = await unwoundedHeroOnLevelOne();
        wounded.intrinsic = 1;
        wounded.extrinsic = LEFT_SIDE;
        // cmd.c cmdq_add_ec() pushes rows like these; only their identity
        // matters here, so the queue is loaded directly. The live game has
        // already materialized command_queue by this point, through
        // rhack()'s own cmdq_pop(), so the clone's `??=` cannot give
        // itself a private one.
        const canned = [{ ec_name: 'swap' }, { ec_name: 'fire' }];
        assert.ok(game.command_queue, 'the live queue must already exist');
        game.command_queue[CQ_CANNED].push(...canned);
        let reachedRound = false;
        // The planning round is aborted once it has been inspected: a full
        // round on this fixture goes on to plan the whole level and does not
        // return, and everything this case is about has already happened by
        // the time the round begins.
        const inspected = new Error('planning round inspected');

        await assert.rejects(
            () => preflightSimpleMonsterActions(game, {
                advanceRound(planned) {
                    reachedRound = true;
                    // The clone must hold its own queues. cmdq_clear() empties
                    // an array in place, so a shared one is a live write
                    // however the dry run reaches it, and by this point the
                    // clone has already cleared its own copy.
                    assert.notStrictEqual(planned.command_queue,
                        game.command_queue);
                    assert.notStrictEqual(planned.command_queue[CQ_CANNED],
                        game.command_queue[CQ_CANNED]);
                    throw inspected;
                },
            }),
            (error) => error === inspected,
        );

        assert.ok(reachedRound, 'the planning round must have run');
        assert.deepEqual(game.command_queue[CQ_CANNED], canned);
    });
