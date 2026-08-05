import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    COLNO,
    M_AP_FURNITURE,
    PROT_FROM_SHAPE_CHANGERS,
    TELEPAT,
    CORR,
    DUST,
    FLYING,
    FOUNTAIN,
    HEADSTONE,
    I_SPECIAL,
    LEVITATION,
    MAX_TYPE,
    ROOM,
    ROT_CORPSE,
    ROWNO,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_STEP,
    RUN_TPORT,
    SINK,
    STONE,
    STAIRS,
    STEALTH,
    TIMER_OBJECT,
    WT_ELF,
    ZOMBIFY_MON,
} from '../js/const.js';
import {
    disturb_buried_zombies,
    domove,
    hero_tread_disturbs_buried_zombies,
    lookaround,
    maybe_smudge_engr,
    nomul,
    runmode_delay_output,
    runStopsBeforeMonster,
    spoteffects,
    switch_terrain,
    terrain_changed_under_hero,
} from '../js/hack.js';
import { game } from '../js/gstate.js';
import { M1_FLY, PM_GRID_BUG } from '../js/monsters.js';
import { CORPSE, DAGGER } from '../js/objects.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

function buriedObject(otyp, x, y, next = null) {
    return {
        nobj: next,
        otyp,
        ox: x,
        oy: y,
        timed: 0,
    };
}

function treadState(overrides = {}) {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[FLYING] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[STEALTH] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        u: { uprops, usteed: null },
        // WT_ELF / 2 is the inclusive source threshold for a heavy tread.
        youmonst: { data: { cwt: WT_ELF / 2 } },
        ...overrides,
    };
}

function terrainProperties() {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    uprops[FLYING] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return uprops;
}

function terrainState(currentTyp, previousTyp = STAIRS) {
    const locations = new Map([
        ['4,4', { typ: previousTyp }],
        ['5,4', { typ: currentTyp }],
    ]);
    return {
        u: {
            ux: 5, uy: 4, ux0: 4, uy0: 4, uinwater: false,
            // switch_terrain() refuses a hero whose levitation or flight is
            // already blocked; an ordinary hero has neither blocked.
            uprops: terrainProperties(),
        },
        level: {
            at: (x, y) => locations.get(`${x},${y}`),
            flags: {},
        },
        iflags: { terrain_typ: previousTyp },
        flags: { terrainstatus: true },
        context: { run: 0 },
        disp: { botl: false },
    };
}

function smudgeState(engravings) {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        u: {
            ux: 5,
            uy: 4,
            uprops,
            uswallow: false,
            usteed: null,
            uundetected: false,
            weapon_skills: [],
        },
        youmonst: {
            data: { mflags1: 0, msize: 2, mattk: [] },
        },
        level: {
            at: () => ({ typ: ROOM }),
            traps: [],
        },
        head_engr: engravings,
    };
}

function engraving(x, y, type, next = null) {
    return {
        engr_x: x,
        engr_y: y,
        engr_type: type,
        engr_txt: ['_', '_', '_'],
        nowipeout: false,
        nxt_engr: next,
    };
}

test('hero tread uses the source weight and grounded-property gates', () => {
    const grounded = treadState();
    assert.equal(hero_tread_disturbs_buried_zombies(grounded), true);

    // One unit below WT_ELF / 2 isolates the inclusive weight boundary.
    const light = treadState({ youmonst: { data: { cwt: WT_ELF / 2 - 1 } } });
    assert.equal(hero_tread_disturbs_buried_zombies(light), false);

    for (const property of [LEVITATION, FLYING, STEALTH]) {
        const elevated = treadState();
        elevated.u.uprops[property].extrinsic = 1;
        assert.equal(
            hero_tread_disturbs_buried_zombies(elevated),
            false,
            `active property ${property}`,
        );
    }

    const flyingSteed = treadState();
    flyingSteed.u.usteed = { data: { mflags1: M1_FLY } };
    assert.equal(hero_tread_disturbs_buried_zombies(flyingSteed), false);
    flyingSteed.u.uprops[FLYING].blocked = 1;
    assert.equal(hero_tread_disturbs_buried_zombies(flyingSteed), true);

    const blockedStealth = treadState();
    blockedStealth.u.uprops[STEALTH] = {
        intrinsic: 1,
        extrinsic: 0,
        blocked: 1,
    };
    assert.equal(
        hero_tread_disturbs_buried_zombies(blockedStealth),
        true,
    );
});

test('legal-move terrain switching classifies only at the source gate', () => {
    // botl.c reserves pseudo-type 39 for ordinary floor status.
    const X_FLOOR = 39;
    const fountain = terrainState(FOUNTAIN);
    assert.equal(terrain_changed_under_hero(fountain), true);
    switch_terrain(fountain);
    assert.equal(fountain.iflags.terrain_typ, FOUNTAIN);
    assert.equal(fountain.disp.botl, true);

    const running = terrainState(FOUNTAIN);
    running.context.run = 1;
    assert.equal(terrain_changed_under_hero(running), true);
    switch_terrain(running);
    assert.equal(running.iflags.terrain_typ, FOUNTAIN);
    assert.equal(running.disp.botl, false);

    const unchanged = terrainState(ROOM, ROOM);
    unchanged.iflags.terrain_typ = STAIRS;
    assert.equal(terrain_changed_under_hero(unchanged), false);
    assert.equal(unchanged.iflags.terrain_typ, STAIRS);

    // iflags.terrain_typ == MAX_TYPE is spoteffects()'s "none of the above"
    // marker, and forces the call even when the square did not change.
    const forced = terrainState(ROOM, ROOM);
    forced.iflags.terrain_typ = MAX_TYPE;
    assert.equal(terrain_changed_under_hero(forced), true);
    switch_terrain(forced);
    assert.equal(forced.iflags.terrain_typ, X_FLOOR);
    assert.equal(forced.disp.botl, true);
});

test('switch_terrain refuses both arms that would unblock levitation', () => {
    // hack.c:3186-3205. Each `else if` unblocks a property and prints a line
    // this port has no owner for, so each refuses instead of falling through
    // to the flags.terrainstatus tail. Both are fail-closed guards in front of
    // unported behaviour, and the fixture terrainState() builds routes around
    // them.
    //
    // rm.h IS_OBSTRUCTED(typ) is `typ < POOL`, so STONE satisfies `blocklev`
    // and reaches the first arm.
    assert.throws(() => switch_terrain(terrainState(STONE)),
                  /blocks levitation/u);

    // The second arm is C's `else if (BLevitation)` / `else if (BFlying)`: it
    // reads the whole blocked mask, and polyself.c float_vs_flight() is the
    // only writer this port has, which sets I_SPECIAL in it. Either property
    // alone reaches the refusal.
    for (const property of [LEVITATION, FLYING]) {
        const state = terrainState(FOUNTAIN);
        state.u.uprops[property].blocked = I_SPECIAL;
        assert.throws(() => switch_terrain(state),
                      /unblocking levitation or flight/u);
    }
});

test('a levitating hero over a sink stops for dosinkfall()', async () => {
    // hack.c:3353-3354, spoteffects()'s only IS_FURNITURE arm:
    // `if (IS_SINK(levl[u.ux][u.uy].typ) && Levitation) dosinkfall();`
    // Both terms have to hold, and the destination seam now admits a sink, so
    // the arm needs a guard of its own. youprop.h:240 defines Levitation as
    // `(HLevitation || ELevitation) && !BLevitation`, so an extrinsic source
    // reaches it as an intrinsic one does and a blocked one does not.
    for (const field of ['intrinsic', 'extrinsic']) {
        const state = terrainState(SINK);
        state.u.uprops[LEVITATION][field] = 1;
        await assert.rejects(
            spoteffects(false, state),
            /dosinkfall\(\)/u,
            field,
        );

        state.u.uprops[LEVITATION].blocked = I_SPECIAL;
        // A blocked property leaves switch_terrain()'s own refusal ahead of
        // this one, which is why the message differs rather than passing.
        await assert.rejects(
            spoteffects(false, state),
            /unblocking levitation or flight/u,
            `${field} blocked`,
        );

        // That arm never reaches the sink guard, so on its own it says nothing
        // about propertyActiveUnblocked()'s `blocked` half: deleting that half
        // leaves it green. Arriving on a sink from a sink makes
        // terrain_changed_under_hero() false, so switch_terrain() does not run
        // and the sink guard is the first thing a blocked hero meets -- and
        // must not stop, because C's Levitation is false when blocked.
        const settled = terrainState(SINK, SINK);
        settled.u.uprops[LEVITATION][field] = 1;
        settled.u.uprops[LEVITATION].blocked = I_SPECIAL;
        await spoteffects(false, settled);
    }

    // Neither term alone reaches it. A sink under a hero with no levitation
    // falls through to check_here(), and a levitating hero on any other
    // terrain never asks.
    const sinkOnly = terrainState(SINK);
    sinkOnly.level.objects = [];
    await spoteffects(false, sinkOnly);

    const levitationOnly = terrainState(FOUNTAIN);
    levitationOnly.u.uprops[LEVITATION].intrinsic = 1;
    levitationOnly.level.objects = [];
    await spoteffects(false, levitationOnly);
});

test('spoteffects calls pickup only for an enabled ordinary arrival',
    async () => {
        const disabled = terrainState(ROOM, ROOM);
        // pickup() resets this source field before any early return. Keeping
        // the sentinel proves pick=false did not call it.
        disabled.gp = { pickup_encumbrance: 7 };
        await spoteffects(false, disabled);
        assert.equal(disabled.gp.pickup_encumbrance, 7);

        const dismounting = terrainState(ROOM, ROOM);
        dismounting.gp = { pickup_encumbrance: 7 };
        dismounting.in_steed_dismounting = true;
        await spoteffects(true, dismounting);
        assert.equal(dismounting.gp.pickup_encumbrance, 7);
    });

test('movement smudges old then new engravings in source RNG order', () => {
    const destination = engraving(5, 4, DUST);
    const state = smudgeState(engraving(4, 4, DUST, destination));
    const draws = [];
    const random = {
        rnd(bound) {
            draws.push(['rnd', bound]);
            return 1;
        },
        rn2(bound) {
            draws.push(['rn2', bound]);
            // Selecting the only byte, then a nonzero rubout, erases '_'.
            return bound === 1 ? 0 : 3;
        },
    };

    assert.equal(maybe_smudge_engr(4, 4, 5, 4, state, random), true);
    assert.deepEqual(draws, [
        ['rnd', 5], ['rn2', 1], ['rn2', 4],
        ['rnd', 5], ['rn2', 1], ['rn2', 4],
    ]);
    assert.equal(state.head_engr, null);
});

test('movement smudging skips headstones, duplicate spots, and high floors',
    () => {
        const headstone = engraving(4, 4, HEADSTONE);
        const state = smudgeState(headstone);
        const noDraw = {
            rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        };

        assert.equal(
            maybe_smudge_engr(4, 4, 4, 4, state, noDraw),
            false,
        );
        state.u.uprops[LEVITATION].extrinsic = 1;
        headstone.engr_type = DUST;
        assert.equal(
            maybe_smudge_engr(4, 4, 5, 4, state, noDraw),
            false,
        );
        assert.equal(state.head_engr, headstone);
    });

test('disturb_buried_zombies shortens only nearby zombification timers', () => {
    const state = {
        moves: 100,
        level: { buriedobjlist: null },
    };
    timeout_globals_init(state);

    const distant = buriedObject(CORPSE, 12, 10);
    const ordinaryRot = buriedObject(CORPSE, 10, 10, distant);
    const nonCorpse = buriedObject(DAGGER, 10, 10, ordinaryRot);
    const nearby = buriedObject(CORPSE, 9, 11, nonCorpse);
    state.level.buriedobjlist = nearby;

    // Ninety remaining turns expose the exact two-thirds reduction to 60.
    start_timer(90, TIMER_OBJECT, ZOMBIFY_MON, nearby, state);
    start_timer(80, TIMER_OBJECT, ZOMBIFY_MON, distant, state);
    start_timer(70, TIMER_OBJECT, ROT_CORPSE, ordinaryRot, state);
    start_timer(50, TIMER_OBJECT, ZOMBIFY_MON, nonCorpse, state);

    disturb_buried_zombies(10, 10, state);

    assert.equal(peek_timer(ZOMBIFY_MON, nearby, state), 160);
    assert.equal(peek_timer(ZOMBIFY_MON, distant, state), 180);
    assert.equal(peek_timer(ROT_CORPSE, ordinaryRot, state), 170);
    assert.equal(peek_timer(ZOMBIFY_MON, nonCorpse, state), 150);
    assert.deepEqual(
        [nearby.timed, distant.timed, ordinaryRot.timed, nonCorpse.timed],
        [1, 1, 1, 1],
    );
});

test('disturb_buried_zombies keeps a one-turn timer at one', () => {
    const state = {
        moves: 7,
        level: { buriedobjlist: null },
    };
    timeout_globals_init(state);
    const corpse = buriedObject(CORPSE, 4, 4);
    state.level.buriedobjlist = corpse;
    // One remaining turn exercises max(1, t * 2 / 3).
    start_timer(1, TIMER_OBJECT, ZOMBIFY_MON, corpse, state);

    disturb_buried_zombies(4, 4, state);

    assert.equal(peek_timer(ZOMBIFY_MON, corpse, state), 8);
    assert.equal(corpse.timed, 1);
});

// ── nomul(), lookaround() and runmode_delay_output() ──

// A synthetic 80x21 level whose squares are all STONE, so a test can carve
// exactly the terrain the branch under test needs. levl[x][y] is indexed the
// way js/mklev.js builds it: level.at(x, y).
function runLevel() {
    const grid = [];
    const monsters = [];
    for (let x = 0; x < COLNO; ++x) {
        grid.push([]);
        monsters.push([]);
        for (let y = 0; y < ROWNO; ++y) {
            grid[x].push({ typ: STONE, flags: 0, doormask: 0, lit: 1 });
            monsters[x].push(null);
        }
    }
    return {
        at: (x, y) => grid[x]?.[y],
        monsters,
        monlist: null,
        objects: [],
        regions: [],
        flags: {},
    };
}

// A hero at <10,10> inside a five-square-wide strip of ROOM running east.
function runState(overrides = {}) {
    const level = runLevel();
    for (let x = 8; x <= 14; ++x) level.at(x, 10).typ = ROOM;
    const uprops = [];
    uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        level,
        u: {
            ux: 10, uy: 10, dx: 1, dy: 0, umonnum: 0,
            last_str_turn: 0, uinvulnerable: true, usleep: 5,
            uprops,
        },
        youmonst: { data: {} },
        context: { run: 1, travel: 0, travel1: 0, mv: 1, move: 1 },
        disp: { botl: false },
        flags: { runmode: RUN_LEAP, time: false },
        multi: COLNO,
        moves: 3,
        ...overrides,
    };
}

test('nomul(0) clears the run and the source fields around it', () => {
    const state = runState();
    nomul(0, state);
    // hack.c nomul(): disp.botl is set only for a non-negative multi, and
    // end_running(TRUE) then zeroes run, travel, travel1 and mv.
    assert.equal(state.multi, 0);
    assert.equal(state.context.run, 0);
    assert.equal(state.context.mv, 0);
    assert.equal(state.disp.botl, true);
    assert.equal(state.u.uinvulnerable, false);
    assert.equal(state.u.usleep, 0);
});

test('nomul returns early when multi is already lower than the request', () => {
    // hack.c nomul()'s "bug fix by ab@unido": a paralysis of -5 outlasts a
    // later request for -2, so nothing is written.
    const state = runState({ multi: -5 });
    nomul(-2, state);
    assert.equal(state.multi, -5);
    assert.equal(state.context.run, 1);
    assert.equal(state.disp.botl, false);
});

test('lookaround leaves an empty room run alone', async () => {
    const state = runState();
    await lookaround(state);
    assert.equal(state.context.run, 1);
    assert.equal(state.multi, COLNO);
    // corrct stays 0 inside a room, so the corner-turning block cannot fire.
    assert.deepEqual([state.u.dx, state.u.dy], [1, 0]);
});

test('lookaround stops the run for a visible monster directly in front',
    async () => {
        const state = runState();
        // hack.c lookaround(): at run == 1 only the infront arm applies, and
        // it needs mon_visible(), which is minvis and mundetected only.
        state.level.monsters[11][10] = {
            mx: 11, my: 10, minvis: 0, mundetected: 0, m_ap_type: 0,
        };
        await lookaround(state);
        assert.equal(state.context.run, 0);
        assert.equal(state.multi, 0);
    });

test('lookaround ignores a visible monster that is not in front', async () => {
    const state = runState();
    // <10,9> is adjacent but off the line of travel, so neither the infront
    // arm nor the run != 1 arm applies.
    state.level.at(10, 9).typ = ROOM;
    state.level.monsters[10][9] = {
        mx: 10, my: 9, minvis: 0, mundetected: 0, m_ap_type: 0,
    };
    await lookaround(state);
    assert.equal(state.context.run, 1);
});

test('lookaround ignores an unseen monster in front', async () => {
    const state = runState();
    state.level.monsters[11][10] = {
        mx: 11, my: 10, minvis: 1, mundetected: 0, m_ap_type: 0,
    };
    await lookaround(state);
    assert.equal(state.context.run, 1);
});

test('lookaround returns immediately for a blind hero', async () => {
    const state = runState();
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    state.level.monsters[11][10] = {
        mx: 11, my: 10, minvis: 0, mundetected: 0, m_ap_type: 0,
    };
    await lookaround(state);
    assert.equal(state.context.run, 1);
});

test('lookaround stops a grid bug asked to move diagonally', async () => {
    const state = runState();
    state.u.umonnum = PM_GRID_BUG;
    state.u.dy = 1;
    // hack.c lookaround()'s first branch runs before the Blind test and
    // before any square is examined, and it ends the run outright.
    await lookaround(state);
    assert.equal(state.context.run, 0);
    assert.equal(state.multi, 0);
});

// A hero on a corridor square at <10,10> running east, with the square in
// front of it, <11,10>, left as stone. hack.c lookaround()'s bcorr label needs
// levl[u.ux][u.uy].typ != ROOM, which the room strip runState() carves does
// not satisfy, so each corner-turn test starts from this shape and carves the
// corridor squares its branch needs.
function corridorRunState(overrides = {}) {
    const state = runState(overrides);
    for (let x = 8; x <= 14; ++x) state.level.at(x, 10).typ = STONE;
    state.level.at(9, 10).typ = CORR;
    state.level.at(10, 10).typ = CORR;
    return state;
}

test('lookaround turns a half turn right around a corridor corner',
    async () => {
        const state = corridorRunState();
        // The only corridor square bcorr counts is <11,11>, diagonally ahead:
        // corrct is 1, dist2(11,11, 11,10) is 1 so i0 is 1, and m0 is 0. The
        // u.dx && u.dy arm is skipped because u.dy is 0, so the last arm runs
        // with x0 - u.ux == y0 - u.uy == 1 and !u.dy, giving i = 1.
        state.level.at(11, 11).typ = CORR;
        await lookaround(state);
        assert.equal(state.context.run, 1);
        assert.deepEqual([state.u.dx, state.u.dy], [1, 1]);
        assert.equal(state.u.last_str_turn, 1);
    });

test('lookaround turns a straight turn right around a corridor corner',
    async () => {
        const state = corridorRunState();
        // <10,11> lies at dist2 2 from the square in front, so i0 is 2 and the
        // first arm applies: u.dx == y0 - u.uy (1) and u.dy == u.ux - x0 (0),
        // so i is 2 and the run turns fully south.
        state.level.at(10, 11).typ = CORR;
        await lookaround(state);
        assert.deepEqual([state.u.dx, state.u.dy], [0, 1]);
        assert.equal(state.u.last_str_turn, 2);
    });

test('lookaround widens a corridor only at run 2, and says so', async () => {
    // hack.c:4025-4029: `if (corrct > 1 && svc.context.run == 2)`. The rush
    // commands set svc.context.run to 3 and the run commands to 1, and
    // js/cmd.js admits no command that sets 2, so nothing in a recorded game
    // reaches this arm; the port carries it because lookaround() is ported
    // whole. Two corridor squares ahead give corrct == 2.
    const widening = corridorRunState();
    widening.flags.mention_walls = true;
    widening.context.run = 2;
    widening.level.at(11, 9).typ = CORR;
    widening.level.at(11, 11).typ = CORR;
    await lookaround(widening);
    assert.equal(widening.context.run, 0);
    assert.equal(widening.multi, 0);
    assert.equal(widening._ttyToplines, 'The corridor widens here.');

    // The same corridor at run 1 walks past the widening without a word.
    const running = corridorRunState();
    running.flags.mention_walls = true;
    running.level.at(11, 9).typ = CORR;
    running.level.at(11, 11).typ = CORR;
    await lookaround(running);
    assert.equal(running.context.run, 1);
    assert.equal(running._ttyToplines, undefined);
});

test('lookaround refuses the blocked-path message rather than inventing it',
    async () => {
    // hack.c:3933-3939 prints "%s blocks your path." through a_monnam(),
    // which has no ported owner, so the port converts the arm into a
    // fail-closed boundary. The arm needs svc.context.run != 1, which is why
    // no run matrix reaches it even with the option on.
    const state = runState({ context: { run: 3, travel: 0, travel1: 0, mv: 1,
        move: 1 } });
    state.flags.mention_walls = true;
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS] =
        { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.level.monsters[11][10] = {
        mx: 11, my: 10, minvis: 0, mundetected: 0, m_ap_type: 0,
        mpeaceful: 0, mtame: 0, data: {},
    };

    await assert.rejects(
        () => lookaround(state),
        /a blocked-path message/u,
    );
});

test('lookaround marks noturn when two corridor squares are not adjacent',
    async () => {
        const state = corridorRunState();
        // <11,9> is counted first, so corrct is 1 when <11,11> is examined;
        // dist2 between them is 4, which sets noturn and blocks the turn even
        // though corrct == 2 and i0 == 1 would otherwise allow it.
        state.level.at(11, 9).typ = CORR;
        state.level.at(11, 11).typ = CORR;
        await lookaround(state);
        assert.deepEqual([state.u.dx, state.u.dy], [1, 0]);
        assert.equal(state.u.last_str_turn, 0);
        // corrct above 1 stops the run only at svc.context.run == 2.
        assert.equal(state.context.run, 1);
    });

test('lookaround refuses a corner turn that would turn too far', async () => {
    // u.last_str_turn already holds 2, so the half turn right adds up to 3 and
    // fails hack.c's `i <= 2 && i >= -2` guard. Neither u.dx/u.dy nor
    // u.last_str_turn is written.
    const state = corridorRunState();
    state.u.last_str_turn = 2;
    state.level.at(11, 11).typ = CORR;
    await lookaround(state);
    assert.deepEqual([state.u.dx, state.u.dy], [1, 0]);
    assert.equal(state.u.last_str_turn, 2);
});

test('lookaround refuses a corner turn onto a monster', async () => {
    // bcorr sets m0 from m_at() alone, and the corner turn needs !m0. The
    // monster is invisible so lookaround()'s mon_visible() arm does not stop
    // the run first.
    const state = corridorRunState();
    state.level.at(11, 11).typ = CORR;
    state.level.monsters[11][11] = {
        mx: 11, my: 11, minvis: 1, mundetected: 0, m_ap_type: 0,
    };
    await lookaround(state);
    assert.equal(state.context.run, 1);
    assert.deepEqual([state.u.dx, state.u.dy], [1, 0]);
});

test('lookaround leaves a straight corridor run alone', async () => {
    // The one square bcorr counts is the square being moved onto, so i0 stays
    // 0 and the corner turn's `i0` term fails.
    const state = corridorRunState();
    state.level.at(11, 10).typ = CORR;
    await lookaround(state);
    assert.equal(state.context.run, 1);
    assert.deepEqual([state.u.dx, state.u.dy], [1, 0]);
    assert.equal(state.u.last_str_turn, 0);
});

test('runmode_delay_output follows each source cadence', async () => {
    // hack.c runmode_delay_output(): RUN_TPORT emits nothing, RUN_LEAP emits
    // one delay only when moves % 7 is zero, RUN_STEP emits one every call,
    // and RUN_CRAWL emits five.
    const cases = [
        { runmode: RUN_TPORT, moves: 7, expected: 0 },
        { runmode: RUN_LEAP, moves: 3, expected: 0 },
        { runmode: RUN_LEAP, moves: 7, expected: 1 },
        { runmode: RUN_LEAP, moves: 14, expected: 1 },
        { runmode: RUN_STEP, moves: 3, expected: 1 },
        { runmode: RUN_CRAWL, moves: 3, expected: 5 },
    ];
    // curs_on_u() flushes the module-global `game`, so this drives that object
    // rather than a synthetic state: threading another one would write
    // disp.time_botl where flush_screen() would never read it.
    const saved = {
        context: game.context, multi: game.multi, moves: game.moves,
        flags: game.flags, disp: game.disp, hook: game._animationFrameHook,
    };
    try {
        for (const { runmode, moves, expected } of cases) {
            let frames = 0;
            let botlWhenDrawn = null;
            game.context = { run: 1 };
            game.multi = 80;
            game.moves = moves;
            game.flags = { runmode, time: true };
            game.disp = {};
            // C sets disp.time_botl, then curs_on_u() flushes, and only then
            // does the frame land; bot() clears the flag on the way through.
            // Sampling inside the hook pins that order rather than the value
            // left behind afterwards.
            game._animationFrameHook = () => {
                frames++;
                botlWhenDrawn ??= game.disp.time_botl;
            };
            await runmode_delay_output(game);
            assert.equal(
                frames, expected, `runmode ${runmode} at moves ${moves}`,
            );
            // The flag is consumed by the flush, so a frame that saw it still
            // set would mean the status refresh had not happened yet.
            if (expected) assert.equal(botlWhenDrawn, false);
        }
    } finally {
        game.context = saved.context;
        game.multi = saved.multi;
        game.moves = saved.moves;
        game.flags = saved.flags;
        game.disp = saved.disp;
        game._animationFrameHook = saved.hook;
    }
});

test('runmode_delay_output refuses a state that is not the global game',
    async () => {
        // curs_on_u() -> flush_screen() reads the module-global `game`. A
        // caller threading another object would write disp.time_botl into one
        // state and have bot() read and clear it from another, so the mismatch
        // has to fail loudly rather than flush the wrong game.
        const state = runState({ moves: 3 });
        state.flags = { runmode: RUN_STEP, time: true };
        state._animationFrameHook = () => {};
        await assert.rejects(
            () => runmode_delay_output(state),
            (error) => error instanceof TypeError
                && /global game state/u.test(error.message),
        );
    });

test('runmode_delay_output stays silent with no run and no multi', async () => {
    let frames = 0;
    const state = runState({ multi: 0 });
    state.context.run = 0;
    state.flags = { runmode: RUN_STEP, time: false };
    state._animationFrameHook = () => { frames++; };
    await runmode_delay_output(state);
    assert.equal(frames, 0);
});

// hack.c domove_core() ends a run through nomul(0), never by writing multi,
// context.run and context.mv itself. The extra state nomul() touches is
// invisible in an ordinary game, because a running hero is neither asleep nor
// invulnerable, so these two tests set it up deliberately: without them, both
// call sites could be replaced by three assignments and every recorded matrix
// would still match byte for byte.
function interruptibleRunState(overrides = {}) {
    const state = runState(overrides);
    // hack.c nomul() clears both, and end_running() clears the travel pair.
    state.u.uinvulnerable = true;
    state.u.usleep = 5;
    state.context.travel = 1;
    state.context.travel1 = 1;
    state.disp.botl = false;
    return state;
}

function assertRunEndedThroughNomul(state, label) {
    assert.equal(state.multi, 0, `${label} multi`);
    assert.equal(state.context.run, 0, `${label} run`);
    assert.equal(state.context.mv, 0, `${label} mv`);
    // The five fields the explicit zeroing never wrote.
    assert.equal(state.u.uinvulnerable, false, `${label} uinvulnerable`);
    assert.equal(state.u.usleep, 0, `${label} usleep`);
    assert.equal(state.disp.botl, true, `${label} botl`);
    assert.equal(state.context.travel, 0, `${label} travel`);
    assert.equal(state.context.travel1, 0, `${label} travel1`);
}

test('a run refused by test_move ends through nomul, not by zeroing fields',
    async () => {
    // hack.c:2843-2849. <11,10> is the square in front; leaving it STONE makes
    // test_move() fail, which is the arm that gives up the move.
    const state = interruptibleRunState();
    state.level.at(11, 10).typ = STONE;

    await domove(state);

    assert.equal(state.context.move, 0);
    assert.deepEqual([state.u.ux, state.u.uy], [10, 10]);
    assertRunEndedThroughNomul(state, 'test_move refusal');
});

test('a run stopped before a monster ends through nomul too', async () => {
    // hack.c:2768-2775, the don't-attack-while-running arm. A visible hostile
    // in front stops the run without spending the move.
    const state = interruptibleRunState();
    state.u.uprops[PROT_FROM_SHAPE_CHANGERS] =
        { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.level.monsters[11][10] = {
        mx: 11, my: 10, minvis: 0, mundetected: 0, m_ap_type: 0,
        mpeaceful: 0, mtame: 0, data: {},
    };

    await domove(state);

    assert.equal(state.context.move, 0);
    assert.deepEqual([state.u.ux, state.u.uy], [10, 10]);
    assertRunEndedThroughNomul(state, 'monster in front');
});

test('the run stop before a monster reads each of C\'s three terms', () => {
    // hack.c:2764: `context.run && ((!Blind && mon_visible(mtmp)
    // && ((M_AP_TYPE != M_AP_FURNITURE && != M_AP_OBJECT)
    // || Protection_from_shape_changers)) || sensemon(mtmp))`.
    // Each case below moves exactly one term.
    const base = () => {
        const state = runState({ moves: 3 });
        state.u.uprops[BLINDED] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
        state.u.uprops[PROT_FROM_SHAPE_CHANGERS] =
            { intrinsic: 0, extrinsic: 0, blocked: 0 };
        return state;
    };
    const hostile = { mpeaceful: 0, mtame: 0, m_ap_type: 0, data: {} };

    // run 0 short-circuits before anything else is read.
    assert.equal(runStopsBeforeMonster(hostile, 0, base()), false);
    // The ordinary case: sighted hero, visible hostile.
    assert.equal(runStopsBeforeMonster(hostile, 1, base()), true);

    // Blindness alone clears the first disjunct, and with no sensemon the
    // run does not stop: C falls through and attacks.
    const blind = base();
    blind.u.uprops[BLINDED].intrinsic = 1;
    assert.equal(runStopsBeforeMonster(hostile, 1, blind), false);

    // sensemon alone restores the stop while still blind, which is the
    // second disjunct C tests independently.
    const sensed = base();
    sensed.u.uprops[BLINDED].intrinsic = 1;
    sensed.u.uprops[TELEPAT] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    sensed.youmonst = { ...sensed.youmonst, data: { mlevel: 1 } };
    assert.equal(runStopsBeforeMonster(hostile, 1, sensed), true);

    // A monster mimicking furniture is not "seen" for this purpose unless the
    // hero has protection from shape changers.
    const mimic = base();
    const disguised = { ...hostile, m_ap_type: M_AP_FURNITURE };
    assert.equal(runStopsBeforeMonster(disguised, 1, mimic), false);
    mimic.u.uprops[PROT_FROM_SHAPE_CHANGERS].intrinsic = 1;
    assert.equal(runStopsBeforeMonster(disguised, 1, mimic), true);
});
