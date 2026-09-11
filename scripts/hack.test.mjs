import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    COLNO,
    COULD_SEE,
    DB_FLOOR,
    DB_ICE,
    DRAWBRIDGE_UP,
    M_AP_FURNITURE,
    PROT_FROM_SHAPE_CHANGERS,
    TELEPAT,
    THRONE,
    CORR,
    DUST,
    FLYING,
    FROMOUTSIDE,
    FOUNTAIN,
    HEADSTONE,
    ICE,
    I_SPECIAL,
    LEVITATION,
    MAX_TYPE,
    MELT_ICE_AWAY,
    PARANOID_SWIM,
    POOL,
    ROOM,
    ROOMOFFSET,
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
    TRAVP_VALID,
    TRAVP_GUESS,
    TIMER_OBJECT,
    WT_ELF,
    ZOMBIFY_MON,
} from '../js/const.js';
import {
    cmp_weights,
    disturb_buried_zombies,
    domove,
    dump_weights,
    end_running,
    findtravelpath,
    furniture_present,
    hero_tread_disturbs_buried_zombies,
    in_town,
    long_to_any,
    lookaround,
    maybe_smudge_engr,
    monstinroom,
    nomul,
    notice_mons_cmp,
    monst_to_any,
    obj_to_any,
    preflightDomoveDestination,
    requireSimpleHeroDestination,
    runmode_delay_output,
    runStopsBeforeMonster,
    spot_checks,
    spoteffects,
    swim_move_danger,
    switch_terrain,
    terrain_changed_under_hero,
    u_simple_floortyp,
    uint_to_any,
    unmul,
} from '../js/hack.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import {
    M1_FLY, PM_GRID_BUG, PM_SOLDIER, monst_globals_init,
} from '../js/monsters.js';
import {
    CORPSE, DAGGER, objects_globals_init,
} from '../js/objects.js';
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
    uprops[STEALTH] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
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

test('monstinroom skips dead monsters and matches species by identity', () => {
    const level = new GameMap();
    const roomno = 2;
    level.rooms[roomno] = {
        lx: 10, ly: 5, hx: 14, hy: 9, rtype: 0,
    };
    level.at(12, 7).roomno = roomno + ROOMOFFSET;
    const soldier = { pmidx: PM_SOLDIER };
    const equalButDistinct = { pmidx: PM_SOLDIER };
    const live = {
        data: soldier, mhp: 5, mx: 12, my: 7, nmon: null,
    };
    const dead = {
        data: soldier, mhp: 0, mx: 12, my: 7, nmon: live,
    };
    level.monlist = dead;
    const state = { level };

    assert.equal(monstinroom(soldier, roomno, state), live);
    assert.equal(monstinroom(equalButDistinct, roomno, state), null);
    level.at(12, 7).roomno = 0;
    assert.equal(monstinroom(soldier, roomno, state), null);
});

test('furniture_present checks inclusive bounds and irregular interiors', () => {
    const level = new GameMap();
    const roomno = 1;
    level.rooms[roomno] = {
        lx: 10,
        ly: 5,
        hx: 14,
        hy: 9,
        irregular: true,
        roomnoidx: roomno,
    };
    const state = { level };
    const corner = level.at(14, 9);
    corner.typ = THRONE;
    corner.roomno = roomno + ROOMOFFSET;
    corner.edge = false;

    assert.equal(furniture_present(THRONE, roomno, state), true);
    corner.edge = true;
    assert.equal(furniture_present(THRONE, roomno, state), false);
    corner.edge = false;
    corner.typ = ROOM;
    assert.equal(furniture_present(THRONE, roomno, state), false);
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

test('a sink only disturbs active, unblocked levitation', async () => {
    // hack.c:3353-3354, spoteffects()'s only IS_FURNITURE arm:
    // `if (IS_SINK(levl[u.ux][u.uy].typ) && Levitation) dosinkfall();`
    // FROMOUTSIDE is innate levitation in dosinkfall(), so it takes the
    // no-damage wobble arm and retains the source bit.
    const active = terrainState(SINK, SINK);
    active.u.uprops[LEVITATION].intrinsic = FROMOUTSIDE;
    await spoteffects(false, active);
    assert.equal(active._ttyToplines,
        'You wobble unsteadily for a moment.');
    assert.equal(active.u.uprops[LEVITATION].intrinsic, FROMOUTSIDE);

    for (const field of ['intrinsic', 'extrinsic']) {
        // A blocked property leaves switch_terrain()'s own refusal ahead of
        // dosinkfall(). Arriving on a sink from a sink makes
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

test('anything converters reuse and overwrite the shared C union', () => {
    const state = {};
    const mon = { m_id: 7 };
    const obj = { o_id: 9 };
    const first = uint_to_any(0xFFFFFFFF + 2, state);
    assert.equal(first.a_uint, 1);
    assert.strictEqual(long_to_any(14.9, state), first);
    assert.deepEqual(first, {
        a_uint: 0, a_long: 14, a_monst: null, a_obj: null,
    });
    assert.strictEqual(monst_to_any(mon, state), first);
    assert.strictEqual(first.a_monst, mon);
    assert.strictEqual(obj_to_any(obj, state), first);
    assert.strictEqual(first.a_obj, obj);
    assert.equal(first.a_monst, null);
});

test('notice distance comparator and simplified floor type follow hack.c', () => {
    const state = {
        u: { ux: 10, uy: 10, uprops: [] },
        youmonst: { data: { mflags1: 0 } },
        level: new GameMap(),
    };
    state.u.uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    state.u.uprops[FLYING] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    assert.equal(notice_mons_cmp(
        { mx: 11, my: 10 }, { mx: 12, my: 12 }, state,
    ), -7);
    state.level.at(11, 10).typ = ROOM;
    assert.equal(u_simple_floortyp(11, 10, state), ROOM);
});

function swimDangerState() {
    const level = new GameMap();
    level.at(10, 10).typ = ROOM;
    level.at(11, 10).typ = POOL;
    level.at(11, 10).seenv = 1;
    return {
        level,
        u: {
            ux: 10,
            uy: 10,
            uinwater: false,
            usteed: null,
            uprops: [],
        },
        youmonst: { data: { mflags1: 0, mmove: 12 } },
        context: { nopick: 0, tips: 0 },
        flags: { paranoia_bits: PARANOID_SWIM, tips: false },
    };
}

test('known liquid warning passes the walking seam and stops before arrival',
    async () => {
        // hack.c test_move():1255 admits POOL. domove_core():2852 then calls
        // swim_move_danger(), whose known unsafe liquid arm returns TRUE when
        // paranoid_confirm:Swim is set, before domove_core() changes u.ux.
        const state = swimDangerState();
        assert.doesNotThrow(
            () => preflightDomoveDestination(11, 10, state),
        );
        assert.equal(await swim_move_danger(11, 10, state), true);
        assert.equal(
            state._ttyToplines,
            'You avoid stepping into the pool of water.',
        );
        assert.deepEqual([state.u.ux, state.u.uy], [10, 10]);

        // teleport.c teleds() does not call swim_move_danger(), so its use of
        // the shared destination seam must continue to reject the pool.
        assert.throws(
            () => requireSimpleHeroDestination(11, 10, state),
            /door or special terrain movement/u,
        );
    });

test('liquid admission requires a warning that will stop the move', () => {
    // Each variation follows a FALSE arm of hack.c swim_move_danger(): an
    // unseen pool, a forced m-prefix step, or disabled paranoid_confirm:Swim.
    // Those moves would reach the unported liquid-arrival effects, so the
    // admission seam remains closed.
    const cases = [
        ['unseen pool', (state) => { state.level.at(11, 10).seenv = 0; }],
        ['m-prefix', (state) => { state.context.nopick = 1; }],
        ['no paranoid warning', (state) => {
            state.flags.paranoia_bits = 0;
        }],
    ];
    for (const [name, change] of cases) {
        const state = swimDangerState();
        change(state);
        assert.throws(
            () => preflightDomoveDestination(11, 10, state),
            /door or special terrain movement/u,
            name,
        );
    }
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
        youmonst: { data: { mmove: 12 } },
        context: { run: 1, travel: 0, travel1: 0, mv: 1, move: 1 },
        disp: { botl: false },
        flags: { runmode: RUN_LEAP, time: false },
        multi: COLNO,
        moves: 3,
        ...overrides,
    };
}

test('in_town uses a containing subroom parent as the town boundary', () => {
    // hack.c:3569-3584. A town level without subrooms admits every square;
    // once any room has subrooms, only that parent room and its one-square
    // border are in town.
    const wholeLevel = { level: { flags: { has_town: true }, rooms: [
        { lx: 4, hx: 8, ly: 3, hy: 6, nsubrooms: 0 },
    ] } };
    assert.equal(in_town(70, 19, wholeLevel), true);

    const bounded = { level: { flags: { has_town: true }, rooms: [
        { lx: 4, hx: 8, ly: 3, hy: 6, nsubrooms: 1 },
    ] } };
    assert.equal(in_town(3, 2, bounded), true);
    assert.equal(in_town(9, 7, bounded), true);
    assert.equal(in_town(10, 7, bounded), false);
    bounded.level.flags.has_town = false;
    assert.equal(in_town(5, 4, bounded), false);
});

test('cmp_weights compares the complete prefixed source name', () => {
    // hack.c:4491 compares nm rather than wt. The seven-digit prefix orders
    // weights first; the suffix breaks equal-weight ties bytewise.
    assert.ok(cmp_weights(
        { nm: '0000010the body of an ant' },
        { nm: '0000100an arrow' },
    ) < 0);
    assert.ok(cmp_weights(
        { nm: '0000100the body of a jackal' },
        { nm: '0000100an arrow' },
    ) > 0);
    assert.equal(cmp_weights({ nm: '0000010an apple' },
        { nm: '0000010an apple' }), 0);
});

test('dump_weights prints the source initializer in cmp_weights order', () => {
    const state = {};
    monst_globals_init(state);
    objects_globals_init(state);
    const lines = [];
    dump_weights(state, {
        random: () => 0,
        rawPrint: (line) => lines.push(line),
    });

    assert.equal(lines[0], 'int all_weights[] = {');
    assert.equal(lines.at(-2), '};');
    assert.equal(lines.at(-1), '');
    const rows = lines.slice(1, -2);
    assert.ok(rows.length > 700);
    const weights = rows.map((line) => Number(line.slice(4, 11)));
    assert.deepEqual(weights, [...weights].sort((a, b) => a - b));
    assert.ok(rows.some((line) => line.includes('the body of a giant ant')));
    assert.ok(rows.some((line) => line.includes('an arrow')));
});

test('spot_checks cancels melting before adjusting objects off ice', () => {
    const location = { typ: ROOM, flags: 0 };
    const state = { level: { at: () => location } };
    const events = [];
    spot_checks(7, 4, ICE, state, {
        spotTimeLeft: (...args) => {
            events.push(['time', ...args.slice(0, 3)]);
            return 9;
        },
        spotStopTimers: (...args) =>
            events.push(['stop', ...args.slice(0, 3)]),
        objIceEffects: (x, y, buried) =>
            events.push(['objects', x, y, buried]),
    });
    assert.deepEqual(events, [
        ['time', 7, 4, MELT_ICE_AWAY],
        ['stop', 7, 4, MELT_ICE_AWAY],
        ['objects', 7, 4, false],
    ]);

    // A raised drawbridge remains icy when only non-underlay mask bits differ.
    location.typ = DRAWBRIDGE_UP;
    location.flags = DB_ICE;
    events.length = 0;
    spot_checks(7, 4, DRAWBRIDGE_UP, state, {
        spotTimeLeft: () => assert.fail('unchanged ice has no timer check'),
        objIceEffects: () => assert.fail('unchanged ice has no object check'),
    });
    assert.deepEqual(events, []);

    location.flags = DB_FLOOR;
    spot_checks(7, 4, DRAWBRIDGE_UP, state, {
        spotTimeLeft: () => 0,
        objIceEffects: (x, y, buried) =>
            events.push(['objects', x, y, buried]),
    });
    assert.deepEqual(events, [['objects', 7, 4, false]]);
});

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

test('nomul(0) clears the multi reason fields', () => {
    // hack.c:4169-4170 clears both only for nval == 0. The buffer values are
    // arbitrary non-empty markers: any value survives a mistaken omission, and
    // C reaches this line with whatever the interrupted action last wrote.
    const state = runState({
        multi_reason: 'digging', multireasonbuf: 'digging down',
    });
    nomul(0, state);
    assert.equal(state.multi_reason, null);
    assert.equal(state.multireasonbuf, '');
});

test('nomul with a nonzero request leaves the multi reason fields alone',
    () => {
    // hack.c:4169 guards the pair with `nval == 0`, so a paralysis keeps the
    // reason it is about to be described by. -3 is any negative request the
    // "bug fix by ab@unido" guard admits from multi 0.
    const state = runState({
        multi: 0, multi_reason: 'frozen', multireasonbuf: 'frozen by a spell',
    });
    nomul(-3, state);
    assert.equal(state.multi, -3);
    assert.equal(state.multi_reason, 'frozen');
    assert.equal(state.multireasonbuf, 'frozen by a spell');
});

// hack.c unmul() (4176-4208) ends what nomul() with a negative value began.
// A synthetic state is enough: ttyPline() leaves the composed line in
// _pending_message when no display is attached.
function unmulState(overrides = {}) {
    return runState({
        multi: -1, context: { run: 0, travel: 0, travel1: 0, mv: 0, move: 1 },
        ...overrides,
    });
}

test('unmul releases the hero and prints the message that was waiting',
    async () => {
        const state = unmulState({ nomovemsg: 'You finish your prayer.' });
        state.disp.botl = false;
        await unmul(null, state);
        // hack.c:4178-4179: disp.botl unconditionally, and multi zeroed here
        // even though every caller has already done it.
        assert.equal(state.disp.botl, true);
        assert.equal(state.multi, 0);
        assert.equal(state._pending_message, 'You finish your prayer.');
        // hack.c:4203-4205 leaves nothing behind for the next wait.
        assert.equal(state.nomovemsg, null);
        assert.equal(state.u.usleep, 0);
        assert.equal(state.multi_reason, null);
        assert.equal(state.multireasonbuf, '');
    });

test('unmul falls back to You_can_move_again and prefers an override',
    async () => {
        // hack.c:4183-4184: decl.c:47's shared string is what a caller who
        // scheduled no message gets.
        const silent = unmulState();
        await unmul(null, silent);
        assert.equal(silent._pending_message, 'You can move again.');

        // hack.c:4181-4182: msg_override replaces whatever was scheduled.
        const overridden = unmulState({ nomovemsg: 'You finish your prayer.' });
        await unmul('You wake up.', overridden);
        assert.equal(overridden._pending_message, 'You wake up.');
    });

test('unmul prints nothing for an empty scheduled message', async () => {
    // hack.c:4183 tests the pointer and :4185 tests `*gn.nomovemsg`, so an
    // empty string reaches the second guard and is silenced there rather than
    // being replaced by You_can_move_again. do_wear.c:2401 and polyself.c:225
    // call unmul("") for exactly that, and pickup.c:3009, detect.c:1262 and
    // artifact.c:1361 leave an empty message behind for the same reason.
    for (const [name, scheduled, override] of [
        ['an empty scheduled message', '', null],
        ['an empty override', 'You finish your prayer.', ''],
    ]) {
        const state = unmulState({ nomovemsg: scheduled });
        await unmul(override, state);
        assert.equal(state._pending_message ?? null, null, name);
        assert.equal(state.nomovemsg, null, name);
    }
});

test('unmul clears afternmv before running it', async () => {
    // hack.c:4207-4213 copies the callback out and zeroes the global before
    // the call, so a callback that schedules another delayed action is not
    // overwritten when this one returns.
    const state = unmulState({ nomovemsg: '' });
    const seen = [];
    state.afternmv = (called) => {
        seen.push(called.afternmv);
        called.afternmv = () => seen.push('rescheduled');
    };
    await unmul(null, state);
    assert.deepEqual(seen, [null]);
    assert.equal(typeof state.afternmv, 'function');

    // With nothing scheduled the call is skipped entirely.
    const idle = unmulState({ nomovemsg: '' });
    await unmul(null, idle);
    assert.equal(idle.afternmv ?? null, null);
});

test('end_running frees the travel map whether or not a run was going', () => {
    // hack.c:4151-4154 frees gt.travelmap outside both the `context.run` block
    // and the `and_travel` arm, so neither guard can withhold the clear. The
    // sentinel stands for the selection C would selection_free(); this port
    // has no reader for it yet, so only its disposal is observable.
    for (const run of [0, 1]) {
        const state = runState({ context: { run, travel: 1, mv: 1 } });
        state.travelmap = { sentinel: true };
        end_running(true, state);
        assert.equal(state.travelmap, null, `travelmap with run ${run}`);
    }
});

test('end_running(FALSE) preserves travel intent for the adjacent fast path',
    () => {
    // hack.c:1276 calls end_running(FALSE): the old selection is discarded,
    // but findtravelpath() must leave context.travel, travel1, and mv set so
    // domove_core() continues with the direction it is about to establish.
    const state = runState({
        context: { run: 8, travel: 1, travel1: 1, mv: 1 },
    });
    state.travelmap = new Uint8Array(COLNO * ROWNO);
    end_running(false, state);
    assert.equal(state.context.run, 0);
    assert.equal(state.context.travel, 1);
    assert.equal(state.context.travel1, 1);
    assert.equal(state.context.mv, 1);
    assert.equal(state.travelmap, null);
});

test('travel validation does not consume the adjacent travel state', async () => {
    const base = runState();
    const state = runState({
        u: {
            ...base.u,
            tx: 11,
            ty: 10,
            dx: -7,
            dy: 6,
        },
        context: { run: 8, travel: 1, travel1: 1, mv: 1 },
        iflags: { travelcc: { x: 4, y: 5 } },
        multi: 4,
    });
    state.level = new GameMap();
    for (let x = 8; x <= 14; ++x) state.level.at(x, 10).typ = ROOM;
    state.travelmap = new Uint8Array(COLNO * ROWNO);

    assert.equal(await findtravelpath(TRAVP_VALID, state), true);
    // hack.c:1278-1287 updates u.dx/u.dy, nomul(), travelcc, and run only
    // for TRAVP_TRAVEL. The validator still calls end_running(FALSE), which
    // clears a positive multi but preserves the caller's travel intent.
    assert.deepEqual([state.u.dx, state.u.dy], [-7, 6]);
    assert.deepEqual(state.iflags.travelcc, { x: 4, y: 5 });
    assert.deepEqual(
        state.context,
        {
            run: 0,
            travel: 1,
            travel1: 1,
            mv: 1,
            door_opened: false,
        },
    );
    assert.equal(state.multi, 0);
});

test('travel guessing selects a visible reachable point and restarts travel',
    async () => {
        // hack.c:1451-1513. The target at <14,10> is enclosed by STONE, so
        // TRAVP_TRAVEL cannot reach the hero. The only visible reachable
        // square closer to that target is <11,10>; TRAVP_GUESS must choose it
        // and then return the eastward direction from the restarted search.
        const base = runState();
        const state = runState({
            u: {
                ...base.u,
                ux: 10,
                uy: 10,
                tx: 14,
                ty: 10,
                dx: 0,
                dy: 0,
            },
            context: { run: 8, travel: 1, travel1: 0, mv: 1, move: 1 },
            flags: { runmode: RUN_LEAP, time: false, mention_walls: false },
        });
        state.level = new GameMap();
        state.level.at(10, 10).typ = ROOM;
        state.level.at(11, 10).typ = ROOM;
        state.viz_array = Array.from(
            { length: ROWNO },
            () => new Uint8Array(COLNO).fill(COULD_SEE),
        );
        state.travelmap = new Uint8Array(COLNO * ROWNO);

        assert.equal(await findtravelpath(TRAVP_GUESS, state), true);
        assert.deepEqual([state.u.dx, state.u.dy], [1, 0]);
        assert.equal(state.travelmap.some((value) => value !== 0), true);
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
    // These tests exercise ordinary run interruption, not the travel command;
    // leave travel unset so domove() does not enter findtravelpath().
    state.u.uinvulnerable = true;
    state.u.usleep = 5;
    state.context.travel = 0;
    state.context.travel1 = 0;
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
    state.u.uhp = state.u.uhpmax = 20;
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
