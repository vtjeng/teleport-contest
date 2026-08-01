// Focused tests for do.c dodown() and goto_level()'s opening phase, plus the
// helpers they reach: hack.c u_rooted(), steed.c stucksteed(), cmd.c
// set_move_cmd(), and trap.c uteetering_at_seen_pit() / uescaped_shaft().
//
// The recorded evidence is two matrices, both of which compare complete
// screens, cursors and random-number calls against fresh C recordings:
// scripts/run-descend-refusal.mjs for the arm that prints "You can't go down
// here.", and scripts/run-leave-level.mjs for a hero who walks to the down
// staircase and presses '>'. These tests cover the guards that neither
// recording can reach, each of which stops rather than descending, and the
// state goto_level() leaves behind when it stops.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DIR_DOWN,
    DIR_W,
    ECMD_OK,
    ECMD_TIME,
    HOLE,
    LEVITATION,
    LFILE_EXISTS,
    PIT,
    STRAT_WAITFORU,
    TT_BURIEDBALL,
    TT_PIT,
    VIBRATING_SQUARE,
} from '../js/const.js';
import { set_move_cmd } from '../js/cmd.js';
import { UnsupportedLevelChangeError, dodown } from '../js/do.js';
import { ledger_no, level_info } from '../js/dungeon.js';
import { u_rooted } from '../js/hack.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { mksobj } from '../js/obj.js';
import { BOULDER, BULLWHIP, PICK_AXE } from '../js/objects.js';
import { getRngLog } from '../js/rng.js';
import { stairway_add, stairway_at } from '../js/stairs.js';
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

// Put a down staircase under the hero, which is what separates a descent from
// the refusal above. The hero starts on the level's up staircase, and
// stairway_add() prepends, so stairway_at() answers this one; the destination
// is the next level of the same dungeon, exactly what mklev.c gives the real
// down staircase.
function downStairsUnderHero(state, isladder = false, dest = null) {
    stairway_add(state.u.ux, state.u.uy, false, isladder, dest ?? {
        dnum: state.u.uz.dnum,
        dlevel: state.u.uz.dlevel + 1,
    });
    return stairway_at(state.u.ux, state.u.uy, state);
}

async function heroOnDownStairs(moves = '>', isladder = false) {
    const state = await descendTo(moves);
    quiet(state);
    downStairsUnderHero(state, isladder);
    return state;
}

// Mark the destination's ledger as a level that already has a file, so that
// do.c:1692 picks getlev() over mklev() and goto_level() stops at the reload
// this port does not do. Everything the leaving phase changed is then still
// in place and observable, which building D:2 would bury.
function destinationAlreadyVisited(state, destination = null) {
    const target = destination ?? {
        dnum: state.u.uz.dnum,
        dlevel: state.u.uz.dlevel + 1,
    };
    level_info(ledger_no(target, state), state).flags |= LFILE_EXISTS;
    return state;
}

// The refusal destinationAlreadyVisited() arranges.
function rejectsAtTheReload(state) {
    return assert.rejects(
        dodown(state),
        (error) => error instanceof UnsupportedLevelChangeError
            && /returning to a level already visited/u.test(error.message),
    );
}

// The matrix's fifth segment starts a Ranger with a little dog; every other
// segment sets pettype:none. Replay it, move the hero next to the pet, and put
// a down staircase under her, which is the state keepdogs() reads.
async function petBesideHeroOnDownStairs() {
    await runSegment({ ...segmentFor(`l${DOWN_COMMAND}.`), moves: 'l' });
    const state = game;
    quiet(state);
    const pet = state.level.monlist;
    assert.ok(pet?.mtame, 'the fixture has a tame monster on the level');
    state.u.ux = pet.mx + 1;
    state.u.uy = pet.my;
    downStairsUnderHero(state);
    return { state, pet };
}

test('a down staircase or ladder builds and enters the level below',
    async () => {
    // do.c:1288-1291 into goto_level(). Both stairs and a ladder reach
    // next_level() the same way; ga.at_ladder reads levl[][].typ, not the
    // stairway's own isladder flag, so both leave it FALSE here.
    for (const isladder of [false, true]) {
        const state = await heroOnDownStairs('>', isladder);
        // docrt()'s message flush stops on a --More-- for "You descend the
        // stairs."; a space is quitchars[]'s first entry.
        state.nhDisplay.pushKey(' '.charCodeAt(0));
        await dodown(state);

        assert.equal(state.ga.at_ladder, false);
        assert.equal(state.u.uz.dlevel, 2);
        // stairs.c u_on_upstairs()'s square: goto_level() puts the hero on
        // the new level's stairway back to the one she left.
        const arrival = stairway_at(state.u.ux, state.u.uy, state);
        assert.ok(arrival?.up, 'the hero arrives on the new level upstairs');
        assert.deepEqual(arrival.tolev, { dnum: 0, dlevel: 1 });
        assert.equal(arrival.u_traversed, true);
    }
});

test('the descent marks the staircase traversed before building the level',
    async () => {
    // dungeon.c:1503-1504 sets u_traversed on the staircase being left, which
    // stairs.c stairs_description() reads. It happens before mklev() draws
    // its first random number, so the flag survives the level change even
    // though the stairway list it belongs to does not.
    const state = await heroOnDownStairs();
    const stway = stairway_at(state.u.ux, state.u.uy, state);
    assert.notEqual(stway.u_traversed, true);
    const drawsBefore = getRngLog().length;

    state.nhDisplay.pushKey(' '.charCodeAt(0));
    await dodown(state);

    assert.equal(stway.u_traversed, true);
    // mklev() generates the destination, so the descent is far from silent.
    assert.ok(getRngLog().length > drawsBefore + 100,
        'building the destination level draws random numbers');
});

test('goto_level() discards the context belonging to the level being left',
    async () => {
    // do.c:1601-1622. Each field is given a value the discard has to clear, so
    // that dropping any one line leaves it set.
    const state = await heroOnDownStairs();
    state.xlock = { usedtime: 3, chance: 4, picktyp: 1, magic_key: true,
        door: {}, box: null };
    state.context.polearm = { hitmon: { m_id: 7 } };
    state.u.utrap = 5;
    state.u.utraptype = TT_PIT;
    // u.ustuck itself cannot be set here, because dodown()'s own
    // u_stuck_cannot_go() refuses a held hero first. What set_ustuck(null)
    // still clears is the swallow pair, which nothing else on this path
    // writes.
    state.u.uswallow = 1;
    state.u.uswldtim = 9;
    state.u.uundetected = true;

    await rejectsAtTheReload(destinationAlreadyVisited(state));

    assert.deepEqual(state.xlock, {
        usedtime: 0, chance: 0, picktyp: 0, magic_key: false,
        door: null, box: null,
    });
    assert.equal(state.context.polearm.hitmon, null);
    assert.equal(state.u.utrap, 0);
    // set_uinwater(0) at do.c:1621 must leave the flag alone rather than set
    // it; the hero is not in water, and switch_terrain() would fire if it did.
    assert.equal(state.u.uinwater, false);
    assert.equal(state.u.uswallow, 0);
    assert.equal(state.u.uswldtim, 0);
    assert.equal(state.u.uundetected, false);
    // move_update(TRUE) at the head of check_special_room().
    assert.deepEqual([...state.u.urooms], [0, 0, 0, 0, 0]);
});

test('goto_level() settles a boulder into the pit it is leaving', async () => {
    // do.c:1619. trap.c fill_pit() drops a boulder resting over a pit once the
    // thing pinning it leaves, and this port stops at flooreffects(). The pit
    // and the boulder are fabricated: no generated square carries a staircase
    // and a trap at once, so the call site has no recordable case.
    const state = await heroOnDownStairs();
    state.level.traps.push({ tx: state.u.ux, ty: state.u.uy, ttyp: PIT });
    const boulder = mksobj(BOULDER, true, false, { state });
    boulder.nexthere = null;
    state.level.objects[state.u.ux][state.u.uy] = boulder;

    await assert.rejects(
        dodown(state),
        (error) => /fill_pit\(\) settling a boulder/u.test(error.message),
    );
});

test('goto_level() takes the hero out of the water she was in', async () => {
    // do.c:1621. A hero who was swimming is no longer swimming on the level
    // she arrives at. hack.c set_uinwater() reaches switch_terrain() only for
    // this direction of the flag, so the ordinary descent above cannot show it.
    const state = await heroOnDownStairs();
    state.u.uinwater = true;

    await rejectsAtTheReload(destinationAlreadyVisited(state));

    assert.equal(state.u.uinwater, false);
});

test('goto_level() takes the pet off the level and onto gm.mydogs',
    async () => {
    // do.c:1624 into dog.c keepdogs():850-856. The matrix segment typing
    // `l>.` starts a Ranger with a little dog, and the pet is beside the hero
    // when she reaches the staircase.
    const { state, pet } = await petBesideHeroOnDownStairs();
    const petX = pet.mx;
    const petY = pet.my;

    await rejectsAtTheReload(destinationAlreadyVisited(state));

    assert.equal(state.gm.mydogs, pet);
    assert.equal(m_at(petX, petY, state), null);
    for (let mon = state.level.monlist; mon; mon = mon.nmon)
        assert.notEqual(mon, pet, 'the pet has left the level chain');
    assert.equal(pet.mx, 0);
    assert.equal(pet.my, 0);
    assert.equal(pet.wormno, 0);
    assert.equal(pet.mlstmv, state.moves);
});

test('a pet that has not noticed the hero stays on the level', async () => {
    // dog.c:813, the STRAT_WAITFORU term. keep_mon_accessible() answers FALSE
    // for an ordinary pet, so it is neither followed nor migrated: it stays on
    // the level chain to be saved with the level.
    const { state, pet } = await petBesideHeroOnDownStairs();
    pet.mstrategy = (pet.mstrategy ?? 0) | STRAT_WAITFORU;

    await rejectsAtTheReload(destinationAlreadyVisited(state));

    assert.equal(state.gm?.mydogs ?? null, null);
    assert.equal(state.level.monlist, pet, 'the pet heads the level chain');
});

test('a sleeping pet stays behind but a following one does not', async () => {
    // dog.c:815-816, monst.h:251 helpless(). Both halves are exercised, so a
    // port that dropped either term would take the wrong branch in one of them.
    for (const [field, value, follows] of [
        ['msleeping', 1, false],
        ['mcanmove', 0, false],
        ['msleeping', 0, true],
    ]) {
        const { state, pet } = await petBesideHeroOnDownStairs();
        pet[field] = value;

        await rejectsAtTheReload(destinationAlreadyVisited(state));

        assert.equal(Boolean(state.gm?.mydogs), follows,
            `${field}=${value} decides whether the pet follows`);
    }
});

test('vision_recalc(2) leaves the hero seeing nothing', async () => {
    // do.c:1631. C's comment says the hero no longer sees anything on the
    // level she is leaving, which is what control 2 means.
    const state = await heroOnDownStairs();
    assert.ok(state.viz_array.some((row) => row.some((cell) => cell)),
        'the hero can see something before she leaves');

    await rejectsAtTheReload(destinationAlreadyVisited(state));

    assert.ok(state.viz_array.every((row) => row.every((cell) => !cell)));
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

// goto_level()'s guards at do.c:1501-1581. Each needs a dungeon state D:1
// cannot reach, so each fabricates it on the live game and then descends.
// Marking the destination as a level that already exists makes the getlev()
// reload the "nothing stopped earlier" answer, which is cheaper to assert
// than a generated level.
const DESTINATION_REFUSAL = /returning to a level already visited/u;

test('goto_level returns without a refusal when the destination is this level',
    async () => {
    // do.c:1583, "this can happen". A staircase whose destination is the level
    // the hero is already on ends the command with a spent turn and no throw.
    const state = await descendTo('>');
    quiet(state);
    downStairsUnderHero(state, false, { ...state.u.uz });

    assert.equal(await dodown(state), ECMD_TIME);
    // do.c:1291 clears ga.at_ladder once next_level() returns. This is the one
    // case in which it does return, so it is the only place the clear shows.
    assert.equal(state.ga.at_ladder, false);
});

test('goto_level stops when the destination leaves the dungeon', async () => {
    // do.c:1518-1519, done(ESCAPED). ledger_no() of dlevel 0 in the first
    // dungeon is 0, which is the only ledger a descent can produce here.
    const state = await descendTo('>');
    quiet(state);
    downStairsUnderHero(state, false, { dnum: state.u.uz.dnum, dlevel: 0 });

    await assert.rejects(
        dodown(state),
        (error) => /escaping the dungeon/u.test(error.message),
    );
});

test('goto_level stops for the endgame and for either tutorial arm',
    async () => {
    // do.c:1504-1514. All three sit behind `newdungeon`, so each case sends
    // the hero to dungeon 1 and changes which of the three tests answers TRUE.
    const cases = [
        ['astral_level', { dnum: 1, dlevel: 1 }],
        ['tutorial_dnum', 1], /* entering the tutorial */
        ['tutorial_dnum', 0], /* leaving it: the hero's own dungeon */
    ];
    for (const [field, value] of cases) {
        const state = await descendTo('>');
        quiet(state);
        state[field] = value;
        downStairsUnderHero(state, false, { dnum: 1, dlevel: 1 });

        await assert.rejects(
            dodown(state),
            (error) => /endgame or the tutorial/u.test(error.message),
            `${field}=${JSON.stringify(value)} stops`,
        );
    }
});

// Put the hero deep in a hellish dungeon carrying the Amulet, which is what
// do.c:1541's mysterious force needs. `dlevel` and `num_dunlevs` are chosen
// per case; the guard reads both.
function inGehennom(state, { dlevel, num_dunlevs, amulet = true }) {
    state.dungeons[state.u.uz.dnum].flags.hellish = true;
    state.dungeons[state.u.uz.dnum].num_dunlevs = num_dunlevs;
    state.u.uz.dlevel = dlevel;
    state.u.uhave.amulet = amulet;
}

test('the mysterious force stops a climb but leaves every other case alone',
    async () => {
    // do.c:1541-1542. Each case below turns exactly one term of the guard off
    // and must reach the destination choice instead.
    const climbing = await descendTo('>');
    quiet(climbing);
    inGehennom(climbing, { dlevel: 5, num_dunlevs: 29 });
    downStairsUnderHero(climbing, false,
        { dnum: climbing.u.uz.dnum, dlevel: 4 });
    await assert.rejects(
        dodown(climbing),
        (error) => /mysterious force/u.test(error.message),
    );

    const cases = [
        // Descending rather than climbing: `up` is FALSE.
        [{ dlevel: 5, num_dunlevs: 29 }, 6],
        // Without the Amulet the force has nothing to hold back.
        [{ dlevel: 5, num_dunlevs: 29, amulet: false }, 4],
        // Within three levels of the bottom, dunlev is not less than
        // dunlevs_in_dungeon - 3.
        [{ dlevel: 5, num_dunlevs: 8 }, 4],
        // The same level, where `up` compares two equal depths.
        [{ dlevel: 5, num_dunlevs: 29 }, 5],
    ];
    for (const [setup, dlevel] of cases) {
        const state = await descendTo('>');
        quiet(state);
        inGehennom(state, setup);
        downStairsUnderHero(state, false,
            { dnum: state.u.uz.dnum, dlevel });
        destinationAlreadyVisited(state, { dnum: state.u.uz.dnum, dlevel });
        const reached = await dodown(state).then(
            () => 'returned',
            (error) => error.message,
        );
        assert.ok(
            reached === 'returned' || DESTINATION_REFUSAL.test(reached),
            `${JSON.stringify(setup)} -> D:${dlevel} met no force, got `
            + reached,
        );
    }
});

test('goto_level stops on the first quest level', async () => {
    // do.c:1578-1581. quest.c ok_to_quest() decides whether the leader has
    // let the hero pass, and is unported.
    const state = await descendTo('>');
    quiet(state);
    state.qstart_level = { ...state.u.uz };
    downStairsUnderHero(state);

    await assert.rejects(
        dodown(state),
        (error) => /first quest level/u.test(error.message),
    );
});

test('goto_level stops for a hero tethered to a buried ball', async () => {
    // do.c:1593-1595. buried_ball_to_punishment() is unported.
    const state = await descendTo('>');
    quiet(state);
    state.u.utrap = 3;
    state.u.utraptype = TT_BURIEDBALL;
    downStairsUnderHero(state);

    await assert.rejects(
        dodown(state),
        (error) => /tethered to a buried ball/u.test(error.message),
    );
});

test('goto_level stops for a punished hero', async () => {
    // do.c:1616-1617, ball.c unplacebc(). Punished is (u.uball != 0), and the
    // port's single home for C's global `uball` is `state.uball` -- the
    // location js/steed.js Punished(), js/insight.js, js/monmove.js,
    // js/steal.js and js/worn.js all read. Writing `state.u.uball` would leave
    // the guard reading an undefined field, so the refusal would pass this
    // test while never firing for a hero the game actually punished.
    const state = await descendTo('>');
    quiet(state);
    state.uball = { otyp: 0 };
    downStairsUnderHero(state);

    await assert.rejects(
        dodown(state),
        (error) => /punished hero/u.test(error.message),
    );
});
