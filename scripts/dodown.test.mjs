// Focused tests for do.c dodown() and the helpers it reaches: hack.c
// u_rooted(), steed.c stucksteed(), cmd.c set_move_cmd(), and trap.c
// uteetering_at_seen_pit() / uescaped_shaft().
//
// The recorded evidence for the arm that prints is
// scripts/run-descend-refusal.mjs, whose seven segments compare complete
// screens, cursors and random-number calls against fresh C recordings. These
// tests cover the guards that no recorded case can reach, each of which stops
// rather than descending.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DIR_DOWN,
    DIR_W,
    ECMD_OK,
    ECMD_TIME,
    HOLE,
    LEVITATION,
    PIT,
    TT_PIT,
    VIBRATING_SQUARE,
} from '../js/const.js';
import { set_move_cmd } from '../js/cmd.js';
import { UnsupportedLevelChangeError, dodown } from '../js/do.js';
import { u_rooted } from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import { BULLWHIP, PICK_AXE } from '../js/objects.js';
import { getRngLog } from '../js/rng.js';
import { stairway_at } from '../js/stairs.js';
import { UnsupportedSteedError } from '../js/steed.js';
import {
    uescaped_shaft,
    uteetering_at_seen_pit,
} from '../js/trap.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    DOWN_COMMAND,
    loadDescendRefusalRecipe,
} from './run-descend-refusal.mjs';

const REFUSAL = "You can't go down here.";

// gt.toplines, which pline.c writes whether or not the row has been repainted.
function toplines(state) {
    return state._ttyToplines ?? '';
}

// Locate a matrix segment by the keys it types, so reordering the matrix
// cannot silently point a test at a different case.
function segmentFor(moves) {
    const found = loadDescendRefusalRecipe().segments.find(
        (segment) => segment.moves === moves,
    );
    assert.ok(found, `the matrix contains a segment typing ${moves}`);
    return found;
}

// Replay a prefix of the first matrix segment and hand back the live state.
async function descendTo(moves) {
    await runSegment({ ...segmentFor('h>..'), moves });
    return game;
}

// Drop the current message so the next pline() starts a fresh top line rather
// than asking for --More--, which no keystroke is left to answer.
function quiet(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
}

test('the descend-refusal matrix contains only source-selected inputs', () => {
    const recipe = loadDescendRefusalRecipe();
    assert.equal(recipe.version, 5);
    // Eight segments: the ordinary square, the up staircase, the no-'>'
    // control, the repeated press, a level carrying a pet, autodig,
    // number_pad, and the '#down' prompt.
    assert.equal(recipe.segments.length, 8);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
    }
    // Exactly one segment reaches dodown() through neither route, and it is
    // the control that pins the random-number claim by typing the first
    // segment's keys without the command.
    assert.deepEqual(
        recipe.segments
            .filter(({ moves }) => !moves.includes(DOWN_COMMAND)
                && !moves.includes('#down'))
            .map(({ moves }) => moves),
        ['h..'],
    );
});

test('the refusal prints, spends no turn, and draws no random number',
    async () => {
    // do.c:1236-1238. The control types the same keys without the '>', so the
    // move counter and the random-number log after it are what the command
    // must leave unchanged.
    await descendTo('h');
    const movesWithout = game.moves;
    const drawsWithout = getRngLog().length;

    const state = await descendTo(`h${DOWN_COMMAND}`);

    assert.equal(toplines(state), REFUSAL);
    assert.equal(state.moves, movesWithout);
    assert.equal(getRngLog().length, drawsWithout);
    // ECMD_OK reaches reset_cmd_vars(), which puts context.move back to 0.
    assert.equal(state.context.move, 0);
});

test('set_move_cmd(DIR_DOWN) leaves the hero facing down and commits no move',
    async () => {
    // cmd.c:1386-1399 over decl.c's zdir[]. zdir[DIR_DOWN] is 1, which is what
    // keeps the `!u.dz` guard from setting a walk or rush intent.
    const state = await descendTo(`h${DOWN_COMMAND}`);
    assert.equal(state.u.dz, 1);
    assert.equal(state.u.dx, 0);
    assert.equal(state.u.dy, 0);

    // rhack()'s reset_cmd_vars() clears the intent after dodown() returns, so
    // the guard is read back from a direct call. A run mode is passed to show
    // that context.run is not written either.
    state.domoveAttempting = 0;
    state.context.run = 7;
    set_move_cmd(DIR_DOWN, 3, state);
    assert.equal(state.domoveAttempting, 0);
    assert.equal(state.context.run, 7);
});

test('set_move_cmd commits a walk intent for a horizontal direction',
    async () => {
    // The other side of the same guard: zdir[DIR_W] is 0, so the walk intent
    // and the run mode are written.
    const state = await descendTo('h');
    state.domoveAttempting = 0;
    state.context.run = 9;

    set_move_cmd(DIR_W, 0, state);

    assert.equal(state.u.dz, 0);
    assert.equal(state.u.dx, -1);
    assert.equal(state.u.dy, 0);
    assert.equal(state.domoveAttempting, 1); /* DOMOVE_WALK */
    assert.equal(state.context.run, 0);
});

test('set_move_cmd suppresses autopickup under the #reqmenu prefix',
    async () => {
    // cmd.c:1391-1393. iflags.menu_requested is the '-m' prefix's only effect
    // on this path.
    const state = await descendTo('h');
    state.context.nopick = 0;
    state.iflags.menu_requested = false;
    set_move_cmd(DIR_DOWN, 0, state);
    assert.equal(state.context.nopick, 0);

    state.iflags.menu_requested = true;
    set_move_cmd(DIR_DOWN, 0, state);
    assert.equal(state.context.nopick, 1);
});

test('a hero standing on the up staircase is refused, not descended',
    async () => {
    // do.c:1147. `!stway->up` is the whole difference between this square and
    // a descent, and the hero starts every game on the up staircase.
    await runSegment({ ...segmentFor('>..'), moves: '>' });
    const state = game;
    const stway = stairway_at(state.u.ux, state.u.uy, state);
    assert.ok(stway, 'the hero starts on a stairway');
    assert.equal(stway.up, true);
    assert.equal(toplines(state), REFUSAL);
    assert.equal(state.context.move, 0);
});

test('a down staircase or ladder stops before goto_level()', async () => {
    // do.c:1283-1292. Turning the staircase the hero stands on into a down
    // staircase is what separates this from the test above.
    for (const isladder of [false, true]) {
        const state = await descendTo('>');
        quiet(state);
        const stway = stairway_at(state.u.ux, state.u.uy, state);
        stway.up = false;
        stway.isladder = isladder;
        await assert.rejects(
            dodown(state),
            (error) => error instanceof UnsupportedLevelChangeError
                && /descending from this square/u.test(error.message),
        );
    }
});

test('a levitating hero stops before the levitation arm', async () => {
    // do.c:1154. Either half of `HLevitation || ELevitation` reaches it.
    for (const field of ['intrinsic', 'extrinsic']) {
        const state = await descendTo('h');
        quiet(state);
        state.u.uprops[LEVITATION][field] = 1;
        await assert.rejects(
            dodown(state),
            (error) => error instanceof UnsupportedLevelChangeError
                && /levitating hero/u.test(error.message),
        );
    }
});

test('a polymorphed hero stops before the ceiling-hider arm', async () => {
    // do.c:1204. Upolyd is (u.umonnum != u.umonster); js/u_init.js is the
    // port's only writer and sets them equal, so this state is fabricated.
    const state = await descendTo('h');
    quiet(state);
    state.u.umonnum = state.u.umonster + 1;
    await assert.rejects(
        dodown(state),
        (error) => error instanceof UnsupportedLevelChangeError
            && /polymorphed hero/u.test(error.message),
    );
});

test('a held hero stops at u_stuck_cannot_go()', async () => {
    // do.c:1221. u.ustuck is null on every admitted path, so this is
    // fabricated from the pet standing beside the hero.
    const state = await descendTo('h');
    quiet(state);
    state.u.ustuck = { data: state.youmonst.data };
    await assert.rejects(
        dodown(state),
        (error) => error instanceof UnsupportedLevelChangeError
            && /u_stuck_cannot_go\("down"\)/u.test(error.message),
    );
});

test('a steed that cannot move stops at stucksteed()', async () => {
    // do.c:1142 through steed.c:876-895. checkfeeding is TRUE from dodown(),
    // so the meal test is live here where apply.c's FALSE call skips it.
    const cases = [
        [{ msleeping: 1, mcanmove: 1, meating: 0 }, /won't move/u],
        [{ msleeping: 0, mcanmove: 0, meating: 0 }, /won't move/u],
        [{ msleeping: 0, mcanmove: 1, meating: 3 }, /still eating/u],
    ];
    for (const [steed, expected] of cases) {
        const state = await descendTo('h');
        quiet(state);
        state.u.usteed = { ...steed, data: state.youmonst.data };
        await assert.rejects(
            dodown(state),
            (error) => error instanceof UnsupportedSteedError
                && expected.test(error.message),
        );
    }
    // A steed that is awake, mobile and not eating passes straight through.
    const state = await descendTo('h');
    quiet(state);
    state.u.usteed = {
        msleeping: 0, mcanmove: 1, meating: 0, data: state.youmonst.data,
    };
    assert.equal(await dodown(state), ECMD_OK);
    assert.equal(toplines(state), REFUSAL);
});

test('u_rooted() answers a form that cannot move, and costs a turn',
    async () => {
    // hack.c:1693-1705. mmove is the permonst speed field, so a mold is the
    // shape that reaches the message.
    const state = await descendTo('h');
    quiet(state);
    const rooted = state.mons.find(({ mmove }) => mmove === 0);
    assert.ok(rooted, 'the monster table holds an immobile form');
    state.youmonst.data = rooted;
    state.multi = 4;

    assert.equal(await dodown(state), ECMD_TIME);

    assert.equal(toplines(state), 'You are rooted to the ground.');
    assert.equal(state.multi, 0); /* nomul(0) */
});

test('u_rooted() names levitation rather than the ground', async () => {
    // The other half of hack.c:1696-1699. youprop.h:240 defines Levitation as
    // (HLevitation || ELevitation) && !BLevitation, so a blocked property
    // still reports the ground.
    const state = await descendTo('h');
    quiet(state);
    state.youmonst.data = state.mons.find(({ mmove }) => mmove === 0);
    state.u.uprops[LEVITATION].extrinsic = 1;

    assert.equal(await u_rooted(state), true);
    assert.equal(toplines(state), 'You are rooted in place.');

    quiet(state);
    state.u.uprops[LEVITATION].blocked = 1;
    assert.equal(await u_rooted(state), true);
    assert.equal(toplines(state), 'You are rooted to the ground.');

    // The other two disjuncts. Neither is reachable from dungeon level one,
    // so the hero is moved onto each special level directly.
    state.u.uprops[LEVITATION].extrinsic = 0;
    for (const level of [state.air_level, state.water_level]) {
        quiet(state);
        assert.ok(level, 'the dungeon topology names the special level');
        state.u.uz = { ...level };
        assert.equal(await u_rooted(state), true);
        assert.equal(toplines(state), 'You are rooted in place.');
    }
});

test('a mobile form answers FALSE without printing', async () => {
    const state = await descendTo('h');
    quiet(state);
    assert.ok(state.youmonst.data.mmove > 0);
    assert.equal(await u_rooted(state), false);
    assert.equal(toplines(state), '');
});

test('a vibrating square adds "yet" to the refusal', async () => {
    // do.c:1237-1238. The trap is under the hero but is neither a pit nor a
    // hole, so it changes the wording without changing the arm.
    const state = await descendTo('h');
    quiet(state);
    state.level.traps.push({
        tx: state.u.ux, ty: state.u.uy, ttyp: VIBRATING_SQUARE, tseen: 1,
    });

    assert.equal(await dodown(state), ECMD_OK);

    assert.equal(toplines(state), "You can't go down here yet.");
});

test('a known pit or hole under the hero stops before dotrap()', async () => {
    // do.c:1226-1228, reached through trap.c uteetering_at_seen_pit() and
    // uescaped_shaft().
    for (const ttyp of [PIT, HOLE]) {
        const state = await descendTo('h');
        quiet(state);
        state.level.traps.push({
            tx: state.u.ux, ty: state.u.uy, ttyp, tseen: 1,
        });
        await assert.rejects(
            dodown(state),
            (error) => error instanceof UnsupportedLevelChangeError
                && /plunging into a pit, hole or trap door/u
                    .test(error.message),
        );
    }
});

test('an unseen pit or hole under the hero leaves the ordinary refusal',
    async () => {
    // Both predicates require trap->tseen, so an undiscovered trap reaches
    // do.c:1229's else-if instead. The unseen hole reaches it through that
    // else-if's own `!trap->tseen` term as well.
    for (const ttyp of [PIT, HOLE]) {
        const state = await descendTo('h');
        quiet(state);
        state.level.traps.push({
            tx: state.u.ux, ty: state.u.uy, ttyp, tseen: 0,
        });

        assert.equal(await dodown(state), ECMD_OK);

        assert.equal(toplines(state), REFUSAL);
    }
});

test('a hero still caught in a pit is not teetering on it', async () => {
    // trap.c:6651. u.utrap with TT_PIT means the hero is in the pit rather
    // than standing on its edge, which is the only term separating the two
    // predicates for the same trap.
    const state = await descendTo('h');
    quiet(state);
    const trap = {
        tx: state.u.ux, ty: state.u.uy, ttyp: PIT, tseen: 1,
    };
    state.u.utrap = 3;
    state.u.utraptype = TT_PIT;

    assert.equal(uteetering_at_seen_pit(trap, state), false);
    assert.equal(uescaped_shaft(trap, state), false);
    // A hole ignores u.utrap entirely.
    assert.equal(
        uescaped_shaft({ ...trap, ttyp: HOLE }, state), true,
    );
    // Neither predicate looks past the hero's own square.
    const elsewhere = { ...trap, tx: state.u.ux + 1 };
    state.u.utrap = 0;
    assert.equal(uteetering_at_seen_pit(elsewhere, state), false);
    assert.equal(uteetering_at_seen_pit(trap, state), true);
});

test('autodig with a wielded pick stops before use_pick_axe2()', async () => {
    // do.c:1230-1234. flags.autodig parses today, so the wielded weapon is
    // the only term keeping the arm dormant: u_init.c:44 wields the bullwhip
    // that precedes the Archeologist's pick-axe at u_init.c:48.
    const state = await descendTo('h');
    quiet(state);
    state.flags.autodig = true;
    state.uwep = mksobj(PICK_AXE, false, false, { state });
    state.context.nopick = 0;

    await assert.rejects(
        dodown(state),
        (error) => error instanceof UnsupportedLevelChangeError
            && /digging down with a wielded pick-axe/u.test(error.message),
    );

    // Each of the other three terms alone puts the refusal back.
    for (const undo of [
        (s) => { s.flags.autodig = false; },
        (s) => { s.context.nopick = 1; },
        (s) => { s.uwep = mksobj(BULLWHIP, false, false, { state: s }); },
        (s) => { s.uwep = null; },
    ]) {
        const other = await descendTo('h');
        quiet(other);
        other.flags.autodig = true;
        other.uwep = mksobj(PICK_AXE, false, false, { state: other });
        other.context.nopick = 0;
        undo(other);
        assert.equal(await dodown(other), ECMD_OK);
        assert.equal(toplines(other), REFUSAL);
    }
});
