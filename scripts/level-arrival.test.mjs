// The helpers do.c goto_level()'s arrival phase reaches, each pinned against
// the C function it comes from: save.c savelev()'s freeing half, timeout.c
// save_timers()/timer_is_local()/obj_is_local()/mon_is_local(), light.c
// save_light_sources(), stairs.c stairway_free_all()/stairway_find_from(),
// dungeon.c level_info()/dunlev_reached()/builds_up()/dungeon_branch()/
// at_dgn_entrance(), mkroom.c isbig()/has_dnstairs()/has_upstairs()/
// invalid_shop_shape()/mkshop(), mon.c pm_to_cham()/restore_cham(), and
// dog.c update_mlstmv()/losedogs()/mon_arrive().
//
// Every expected value comes from reading those functions. None was copied
// from a run of the port. scripts/run-leave-level.mjs is the recorded
// evidence for the whole path.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    LFILE_EXISTS,
    LS_MONSTER,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MIGRATING,
    OBJ_MINVENT,
    ANTHOLE,
    BARRACKS,
    BEEHIVE,
    COCKNEST,
    COURT,
    DELPHI,
    FILL_NONE,
    FILL_NORMAL,
    LEPREHALL,
    MORGUE,
    OROOM,
    PROT_FROM_SHAPE_CHANGERS,
    RANGE_GLOBAL,
    RANGE_LEVEL,
    ROOM,
    SHOPBASE,
    STEALTH,
    STONE,
    SWAMP,
    TEMPLE,
    THEMEROOM,
    THRONE,
    VAULT,
    TIMER_GLOBAL,
    TIMER_LEVEL,
    TIMER_MONSTER,
    TIMER_OBJECT,
    VISITED,
    LS_OBJECT,
    ZOO,
} from '../js/const.js';
import { losedogs, update_mlstmv } from '../js/dog.js';
import {
    assign_level,
    at_dgn_entrance,
    builds_up,
    dungeon_branch,
    dunlev_reached,
    level_info,
    set_dunlev_reached,
} from '../js/dungeon.js';
import { exp_percent_changing } from '../js/display.js';
import {
    more_experienced,
    newexplevel,
    UnsupportedExperienceChangeError,
} from '../js/exper.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import {
    light_globals_init,
    new_light_source,
    save_light_sources,
} from '../js/light.js';
import { pm_to_cham, restore_cham } from '../js/mon.js';
import { loadTouristArrivalRecipe } from './run-leave-level.mjs';
import { is_shapeshifter } from '../js/mondata.js';
import {
    do_mkroom,
    has_dnstairs,
    has_upstairs,
    invalid_shop_shape,
    isbig,
} from '../js/mkroom.js';
import { m_at, newMonster, place_monster } from '../js/monst.js';
import {
    NON_PM,
    PM_CHAMELEON,
    PM_KOBOLD_ZOMBIE,
    PM_LITTLE_DOG,
    PM_TOURIST,
    PM_WIZARD,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { check_special_room } from '../js/rooms.js';
import { savelev } from '../js/save.js';
import { stairway_add, stairway_find_from, stairway_free_all } from '../js/stairs.js';
import {
    mon_is_local,
    obj_is_local,
    run_timers,
    save_timers,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

// dat/dungeon.lua's first two dungeons: "The Dungeons of Doom" builds down
// from level one, "The Gnomish Mines" branches off it.
function dungeonState() {
    const state = resetGame();
    state.dungeons = [
        {
            dname: 'The Dungeons of Doom',
            depth_start: 1,
            ledger_start: 0,
            num_dunlevs: 29,
            entry_lev: 1,
            dunlev_ureached: 1,
            flags: {},
        },
        {
            dname: 'The Gnomish Mines',
            depth_start: 3,
            ledger_start: 29,
            num_dunlevs: 8,
            entry_lev: 1,
            dunlev_ureached: 0,
            flags: {},
        },
    ];
    state.n_dgns = 2;
    state.branches = [{
        end1: { dnum: 0, dlevel: 3 },
        end2: { dnum: 1, dlevel: 1 },
        end1_up: false,
    }];
    state.u = { uz: { dnum: 0, dlevel: 1 }, ux: 20, uy: 10 };
    state.level = new GameMap();
    return state;
}

test('savelev drops the leaving level and marks its ledger visited', () => {
    const state = dungeonState();
    timeout_globals_init(state);
    light_globals_init(state);
    state.moves = 100;

    // A corpse rotting on the floor of the level being left, and a lit candle
    // in the hero's pack. timeout.c obj_is_local() answers TRUE for OBJ_FLOOR
    // and FALSE for OBJ_INVENT, so save_timers(RANGE_LEVEL) frees the first
    // and keeps the second.
    const floorCorpse = { where: OBJ_FLOOR, timed: 0 };
    const packCandle = { where: OBJ_INVENT, timed: 0 };
    start_timer(50, TIMER_OBJECT, 1 /* ROT_CORPSE */, floorCorpse, state);
    start_timer(60, TIMER_OBJECT, 4 /* BURN_OBJECT */, packCandle, state);
    new_light_source(5, 5, 3, LS_OBJECT, floorCorpse, state);
    new_light_source(20, 10, 3, LS_OBJECT, packCandle, state);
    // light.c's save_light_sources() clears this on the way through.
    state.vision_full_recalc = 1;

    // ledger_no({dnum:0, dlevel:1}) is 1: ledger_start is 0 for dungeon zero.
    savelev(1, state);

    assert.equal(level_info(1, state).flags & VISITED, VISITED);
    assert.equal(state.gt.timer_base.arg, packCandle);
    assert.equal(state.gt.timer_base.next, null);
    assert.equal(state.gl.light_base.id, packCandle);
    assert.equal(state.gl.light_base.next, null);
    assert.equal(state.vision_full_recalc, 0);
});

test('save_timers keeps the range it is not releasing', () => {
    const state = dungeonState();
    timeout_globals_init(state);
    state.gm = { migrating_mons: null, mydogs: null };
    state.moves = 0;

    const levelTimer = { where: OBJ_FLOOR, timed: 0 };
    const globalTimer = { where: OBJ_INVENT, timed: 0 };
    start_timer(10, TIMER_OBJECT, 1, levelTimer, state);
    start_timer(20, TIMER_OBJECT, 4, globalTimer, state);

    // RANGE_GLOBAL releases the timers that travel with the hero and keeps
    // the ones belonging to the level, which is the mirror of RANGE_LEVEL.
    save_timers(RANGE_GLOBAL, state);
    assert.equal(state.gt.timer_base.arg, levelTimer);
    assert.equal(state.gt.timer_base.next, null);
});

test('timer locality follows the four timer kinds', () => {
    const state = dungeonState();
    timeout_globals_init(state);
    state.moves = 0;
    const migrating = newMonster();
    const resident = newMonster();
    state.gm = { migrating_mons: migrating, mydogs: null };

    // timeout.c mon_is_local(): a monster on either travelling list belongs
    // to no level.
    assert.equal(mon_is_local(migrating, state), false);
    assert.equal(mon_is_local(resident, state), true);
    state.gm = { migrating_mons: null, mydogs: migrating };
    assert.equal(mon_is_local(migrating, state), false);

    // timeout.c obj_is_local()'s five cases.
    assert.equal(obj_is_local({ where: OBJ_FLOOR }, state), true);
    assert.equal(obj_is_local({ where: OBJ_INVENT }, state), false);
    assert.equal(obj_is_local({ where: OBJ_MIGRATING }, state), false);
    assert.equal(
        obj_is_local({ where: OBJ_CONTAINED,
            ocontainer: { where: OBJ_FLOOR } }, state),
        true,
    );
    assert.equal(
        obj_is_local({ where: OBJ_MINVENT, ocarry: migrating }, state),
        false,
    );

    // TIMER_LEVEL is local whatever its argument; TIMER_GLOBAL never is.
    const positional = 5 * 0x10000 + 5;
    start_timer(10, TIMER_LEVEL, 8 /* MELT_ICE_AWAY */, positional, state);
    start_timer(20, TIMER_GLOBAL, 1, { where: OBJ_FLOOR }, state);
    start_timer(30, TIMER_MONSTER, 3 /* ZOMBIFY_MON */, resident, state);
    save_timers(RANGE_LEVEL, state);
    // Only the global timer survives: the positional and monster timers are
    // both local.
    assert.equal(state.gt.timer_base.kind, TIMER_GLOBAL);
    assert.equal(state.gt.timer_base.next, null);
});

test('run_timers stops rather than firing an unported timeout arm', () => {
    const state = dungeonState();
    timeout_globals_init(state);
    state.moves = 100;
    // A corpse in the hero's pack: do.c goto_level() carries inventory timers
    // across the descent, and dig.c rot_corpse()'s OBJ_INVENT arm, which
    // writes "Your <corpse> rots away", is not ported.
    start_timer(5, TIMER_OBJECT, 1, { where: OBJ_INVENT, timed: 0 }, state);
    // Scheduled for move 105, which is still ahead of the arrival turn.
    run_timers(state, { newsym: () => {} });
    state.moves = 105;
    // The message names goto_level()'s call, not nh_timeout()'s. Both raise
    // this class over the same field, and boundary triage reads the line to
    // decide which of the two stopped, so the site marker is asserted here and
    // the nh_timeout wording is asserted in scripts/timeout.test.mjs. Neither
    // assertion may be satisfied by the other's string.
    assert.throws(
        () => run_timers(state, {
            newsym: () => {},
            site: "goto_level()'s run_timers()",
        }),
        (error) => error.message === "goto_level()'s run_timers() requires "
            + 'a corpse on the floor, but one is rotting at where=3',
    );
});

test('save_light_sources releases exactly one range', () => {
    const state = dungeonState();
    light_globals_init(state);
    const floorLamp = { where: OBJ_FLOOR };
    const carriedLamp = { where: OBJ_INVENT };
    new_light_source(5, 5, 3, LS_OBJECT, floorLamp, state);
    new_light_source(20, 10, 3, LS_OBJECT, carriedLamp, state);

    save_light_sources(RANGE_GLOBAL, state);
    assert.equal(state.gl.light_base.id, floorLamp);
    assert.equal(state.gl.light_base.next, null);
});

test('a luminous monster is local while it stands on the level', () => {
    const state = dungeonState();
    light_globals_init(state);
    // light.c:373's own mon_is_local is the macro `(mon)->mx > 0`, so a
    // monster parked at column zero -- which dog.c relmon() is what produces
    // -- travels with the hero instead of staying with the level.
    const standing = newMonster();
    standing.mx = 1;
    standing.my = 4;
    const travelling = newMonster();
    travelling.mx = 0;
    travelling.my = 0;
    new_light_source(1, 4, 3, LS_MONSTER, standing, state);
    new_light_source(0, 0, 3, LS_MONSTER, travelling, state);

    save_light_sources(RANGE_LEVEL, state);
    assert.equal(state.gl.light_base.id, travelling);
    assert.equal(state.gl.light_base.next, null);

    // new_light_source() admits only the two mobile types, so the walk's
    // default arm needs a source planted directly on the list.
    state.gl.light_base = { next: null, type: 0, id: standing };
    assert.throws(() => save_light_sources(RANGE_LEVEL, state),
        /save_light_sources: bad type/u);
});

test('the stairway list is emptied and searched by origin', () => {
    const state = dungeonState();
    state.stairs = null;
    // D:2's two stairways: up to D:1, down to D:3. stairway_add() prepends,
    // so the down staircase ends up first in the list.
    stairway_add(10, 5, true, false, { dnum: 0, dlevel: 1 });
    stairway_add(40, 15, false, false, { dnum: 0, dlevel: 3 });
    // A ladder to the same level as the up staircase, so only the isladder
    // term separates them.
    stairway_add(60, 8, true, true, { dnum: 0, dlevel: 1 });

    const stairs = stairway_find_from({ dnum: 0, dlevel: 1 }, false, game);
    assert.deepEqual([stairs.sx, stairs.sy], [10, 5]);
    const ladder = stairway_find_from({ dnum: 0, dlevel: 1 }, true, game);
    assert.deepEqual([ladder.sx, ladder.sy], [60, 8]);
    assert.equal(stairway_find_from({ dnum: 1, dlevel: 1 }, false, game), null);

    stairway_free_all(game);
    assert.equal(game.stairs, null);
});

test('assign_level writes through rather than replacing', () => {
    // dungeon.c assign_level() copies dnum and dlevel into the destination
    // struct. goto_level() moves u.uz through it, so a caller holding the
    // same object keeps seeing the hero's level.
    const destination = { dnum: 0, dlevel: 1 };
    const alias = destination;
    assert.equal(assign_level(destination, { dnum: 0, dlevel: 2 }), alias);
    assert.deepEqual(alias, { dnum: 0, dlevel: 2 });
});

test('the level-identity helpers read dat/dungeon.lua', () => {
    const state = dungeonState();

    // The main dungeon's entry level is its first, so it builds down; the
    // Mines are reached through a branch whose end1_up is false.
    assert.equal(builds_up({ dnum: 0, dlevel: 2 }, state), false);
    assert.equal(builds_up({ dnum: 1, dlevel: 1 }, state), false);

    assert.equal(dunlev_reached({ dnum: 0, dlevel: 2 }, state), 1);
    set_dunlev_reached({ dnum: 0, dlevel: 2 }, 2, state);
    assert.equal(dunlev_reached({ dnum: 0, dlevel: 2 }, state), 2);

    // A fresh ledger row starts with no flags at all, so goto_level() picks
    // mklev() over getlev() for a level it has never built.
    assert.equal(level_info(2, state).flags, 0);
    assert.equal(level_info(2, state).flags & LFILE_EXISTS, 0);
    // maxledgerno() is the last dungeon's ledger_start plus its level count,
    // which is 29 + 8 here, and is itself a valid row.
    assert.equal(level_info(37, state).flags, 0);
    assert.throws(() => level_info(38, state), /out of range/u);
    assert.equal(level_info(0, state).flags, 0);
    assert.throws(() => level_info(-1, state), /out of range/u);

    // dungeon.c's branch lookup keys on the branch's *destination* dungeon.
    assert.equal(dungeon_branch('The Gnomish Mines', state).end1.dlevel, 3);
    assert.throws(
        () => dungeon_branch('Fort Ludios', state),
        /unknown dungeon/u,
    );
    // at_dgn_entrance() compares the hero's level with the branch's end1.
    state.u.uz = { dnum: 0, dlevel: 3 };
    assert.equal(at_dgn_entrance('The Gnomish Mines', state), true);
    state.u.uz = { dnum: 0, dlevel: 2 };
    assert.equal(at_dgn_entrance('The Gnomish Mines', state), false);
});

// Build a rectangular room whose interior is ROOM and give it one door.
function roomLevel(state, { lx, ly, hx, hy, doorx, doory }) {
    for (let x = lx; x <= hx; ++x)
        for (let y = ly; y <= hy; ++y) state.level.at(x, y).typ = ROOM;
    state.level.rooms = [{
        lx, ly, hx, hy, rtype: OROOM, doorct: 1, fdoor: 0, rlit: 1,
        needfill: 0, irregular: false, nsubrooms: 0, sbrooms: [],
    }];
    state.level.nroom = 1;
    state.level.doors = [{ x: doorx, y: doory }];
    state.level.doorindex = 1;
    return state.level.rooms[0];
}

test('mkroom.c room predicates answer from geometry and the stairway list', () => {
    const state = dungeonState();
    // 5 x 5 interior is 25 squares, above isbig()'s threshold of 20; a
    // 5 x 4 interior is 20, which is not above it.
    const big = roomLevel(state, {
        lx: 10, ly: 5, hx: 14, hy: 9, doorx: 9, doory: 7,
    });
    assert.equal(isbig(big), true);
    assert.equal(isbig({ lx: 10, ly: 5, hx: 14, hy: 8 }), false);

    state.stairs = null;
    assert.equal(has_upstairs(big, state), false);
    assert.equal(has_dnstairs(big, state), false);
    state.stairs = { sx: 12, sy: 7, up: true, next: null };
    assert.equal(has_upstairs(big, state), true);
    assert.equal(has_dnstairs(big, state), false);
    state.stairs = { sx: 12, sy: 7, up: false, next: null };
    assert.equal(has_dnstairs(big, state), true);
    // A staircase outside the room belongs to neither.
    state.stairs = { sx: 40, sy: 7, up: false, next: null };
    assert.equal(has_dnstairs(big, state), false);
});

test('invalid_shop_shape rejects a room that pins the shopkeeper', () => {
    const state = dungeonState();
    // A tall room: two squares beside the door are ROOM, so C stops counting
    // there and calls the shape valid without the second scan.
    const wide = roomLevel(state, {
        lx: 10, ly: 5, hx: 14, hy: 9, doorx: 9, doory: 7,
    });
    assert.equal(invalid_shop_shape(wide, state), false);

    // A one-square-tall, two-square-wide room entered from the left: the one
    // square beside the door has exactly one other room square to step to,
    // which is the shape C rejects.
    const state2 = dungeonState();
    const corridorRoom = roomLevel(state2, {
        lx: 10, ly: 5, hx: 11, hy: 5, doorx: 9, doory: 5,
    });
    assert.equal(invalid_shop_shape(corridorRoom, state2), true);

    // A single-square room answers FALSE, because C's second scan counts zero
    // rather than one and its test is an equality against one. Reproduce the
    // source's answer rather than the intended one.
    const state3 = dungeonState();
    const single = roomLevel(state3, {
        lx: 10, ly: 5, hx: 10, hy: 5, doorx: 9, doory: 5,
    });
    assert.equal(invalid_shop_shape(single, state3), false);
});

test('do_mkroom takes the room the level would gain', () => {
    const state = dungeonState();
    roomLevel(state, { lx: 10, ly: 5, hx: 14, hy: 9, doorx: 9, doory: 7 });
    state.stairs = null;
    // mkshop() draws one rnd(100) and nothing else; 1 selects shtypes[0], the
    // general store. A rejected room reaches no draw at all, which is what
    // makes `drawn` the evidence below.
    let drawn = 0;
    const oneRoll = { rnd: () => { drawn += 1; return 1; } };

    do_mkroom(SHOPBASE, state, oneRoll);
    assert.equal(drawn, 1);
    assert.equal(state.level.rooms[0].rtype, SHOPBASE);
    assert.equal(state.level.rooms[0].needfill, FILL_NORMAL);
    state.level.rooms[0].rtype = OROOM;
    state.level.rooms[0].needfill = FILL_NONE;

    // COURT uses pick_room(FALSE). This room has one door and no stairs, so
    // only the initial room-index draw is spent before it is selected.
    let courtDraws = 0;
    do_mkroom(COURT, state, {
        rn2: () => { courtDraws += 1; return 0; },
    });
    assert.equal(courtDraws, 1);
    assert.equal(state.level.rooms[0].rtype, COURT);
    assert.equal(state.level.rooms[0].needfill, FILL_NORMAL);
    state.level.rooms[0].rtype = OROOM;
    state.level.rooms[0].needfill = FILL_NONE;

    // The next room type reaches the named later-family boundary.
    assert.throws(() => do_mkroom(ZOO, state), /do_mkroom\(8\)/u);

    // A room the shop search rejects leaves the level unchanged: mkshop()
    // walks past a room that already holds the down staircase.
    drawn = 0;
    state.stairs = { sx: 12, sy: 7, up: false, next: null };
    do_mkroom(SHOPBASE, state, oneRoll);
    assert.equal(state.level.rooms[0].rtype, OROOM);
    // ... and past a room that holds the up staircase.
    state.stairs = { sx: 12, sy: 7, up: true, next: null };
    do_mkroom(SHOPBASE, state, oneRoll);
    assert.equal(state.level.rooms[0].rtype, OROOM);

    // A room that is already special is passed over, and so is one with a
    // door count other than one: C's loop tests `doorct == 1` rather than a
    // bound, so neither zero nor two is a shop.
    state.stairs = null;
    for (const [field, value] of [['rtype', ZOO], ['doorct', 0],
        ['doorct', 2]]) {
        const room = state.level.rooms[0];
        const was = room[field];
        room[field] = value;
        do_mkroom(SHOPBASE, state, oneRoll);
        room[field] = was;
    }
    // A level with no rooms at all: the loop's bound, not its terminator.
    const rooms = state.level.rooms;
    state.level.nroom = 0;
    do_mkroom(SHOPBASE, state, oneRoll);
    assert.equal(drawn, 0, 'every rejection above reaches no roll');

    // With every rejection undone the search finds the room again, so the
    // walk above stopped for the reason each case names rather than because
    // the loop had ended.
    state.level.nroom = rooms.length;
    do_mkroom(SHOPBASE, state, oneRoll);
    assert.equal(drawn, 1);
    assert.equal(state.level.rooms[0].rtype, SHOPBASE);
});

test('check_special_room handles Court and stops on later room families',
    async () => {
    const state = dungeonState();
    roomLevel(state, { lx: 10, ly: 5, hx: 14, hy: 9, doorx: 9, doory: 7 });
    state.level.at(20, 10).typ = STONE;
    // The hero stands inside the room; move_update(FALSE) records it as newly
    // entered because urooms0 is empty.
    state.u.ux = 12;
    state.u.uy = 7;
    for (let x = 10; x <= 14; ++x)
        for (let y = 5; y <= 9; ++y) state.level.at(x, y).roomno = 3;

    // An ordinary room takes the switch's default arm and says nothing.
    await check_special_room(false, state);

    // Every room type whose arm in hack.c's switch does something. C's
    // `default` arm answers for the rest, so THEMEROOM and VAULT stay silent
    // beside them.
    for (const rt of [ZOO, SWAMP, LEPREHALL, MORGUE, BEEHIVE,
        COCKNEST, ANTHOLE, BARRACKS, DELPHI, TEMPLE]) {
        state.u.urooms = [0, 0, 0, 0, 0];
        state.u.urooms0 = [0, 0, 0, 0, 0];
        state.level.rooms[0].rtype = rt;
        await assert.rejects(
            () => check_special_room(false, state),
            new RegExp(`entering room type ${rt}`, 'u'),
            `room type ${rt}`,
        );
    }
    state.u.urooms = [0, 0, 0, 0, 0];
    state.u.urooms0 = [0, 0, 0, 0, 0];
    // Put the Court at rooms[3].  hack.c subtracts ROOMOFFSET before its
    // wake-loop comparison but compares that index with the still-encoded
    // levl.roomno.  A sleeper in rooms[0] is therefore the one it visits.
    const court = {
        ...state.level.rooms[0],
        rtype: COURT,
        orig_rtype: COURT,
    };
    state.level.rooms.push(
        { ...state.level.rooms[0], rtype: OROOM },
        { ...state.level.rooms[0], rtype: OROOM },
        court,
    );
    state.level.rooms[0].rtype = OROOM;
    state.level.flags.has_court = true;
    // furniture_present() scans both inclusive bounds. Put the only throne at
    // the far corner so either `<` mutation loses the "throne" adjective.
    state.level.at(14, 9).typ = THRONE;
    state.level.at(12, 7).roomno = 6;
    monst_globals_init(state);
    const sleeper = newMonster({
        data: state.mons[PM_KOBOLD_ZOMBIE],
        mnum: PM_KOBOLD_ZOMBIE,
        mhp: 4,
        mhpmax: 4,
        mcanmove: true,
        mcansee: true,
        msleeping: true,
        mx: 11,
        my: 7,
    });
    const courtSleeper = newMonster({
        data: state.mons[PM_KOBOLD_ZOMBIE],
        mnum: PM_KOBOLD_ZOMBIE,
        mhp: 4,
        mhpmax: 4,
        mcanmove: true,
        mcansee: true,
        msleeping: true,
        mx: 12,
        my: 7,
    });
    const dead = newMonster({
        data: state.mons[PM_KOBOLD_ZOMBIE],
        mnum: PM_KOBOLD_ZOMBIE,
        mhp: 0,
        mhpmax: 4,
        mcanmove: true,
        mcansee: true,
        msleeping: true,
        mx: 11,
        my: 6,
    });
    sleeper.nmon = dead;
    dead.nmon = courtSleeper;
    state.level.monlist = sleeper;
    const courtEvents = [];
    await check_special_room(false, state, {
        message: async (line) => {
            if (line.startsWith('You enter an opulent')) {
                assert.equal(state.level.rooms[3].rtype, COURT);
                assert.equal(state.level.flags.has_court, true);
            }
            courtEvents.push(`msg:${line}`);
        },
        random: (limit) => {
            assert.equal(limit, 3);
            assert.equal(state.level.rooms[3].rtype, OROOM);
            assert.equal(state.level.flags.has_court, false);
            courtEvents.push(`rng:${limit}`);
            return 0;
        },
        canSeeMonster: () => true,
    });
    assert.deepEqual(courtEvents, [
        'msg:You enter an opulent throne room!',
        'rng:3',
        'msg:The kobold zombie wakes up.',
    ]);
    assert.equal(state.level.rooms[3].rtype, OROOM);
    assert.equal(state.level.flags.has_court, false);
    assert.equal(sleeper.msleeping, false);
    assert.equal(dead.msleeping, true);
    assert.equal(courtSleeper.msleeping, true);

    async function exerciseStealth({ intrinsic, extrinsic, blocked, draws }) {
        state.u.uprops ??= [];
        state.u.uprops[STEALTH] ??= {};
        state.level.rooms[3].rtype = COURT;
        state.level.flags.has_court = true;
        state.u.urooms = [0, 0, 0, 0, 0];
        state.u.urooms0 = [0, 0, 0, 0, 0];
        state.u.uprops[STEALTH].intrinsic = intrinsic;
        state.u.uprops[STEALTH].extrinsic = extrinsic;
        state.u.uprops[STEALTH].blocked = blocked;
        sleeper.msleeping = true;
        let actualDraws = 0;
        await check_special_room(false, state, {
            message: async () => {},
            random: () => {
                ++actualDraws;
                return 0;
            },
            canSeeMonster: () => true,
        });
        assert.equal(actualDraws, draws);
        assert.equal(sleeper.msleeping, draws === 0);
    }
    await exerciseStealth({ intrinsic: 1, extrinsic: 0, blocked: 0, draws: 0 });
    await exerciseStealth({ intrinsic: 0, extrinsic: 1, blocked: 0, draws: 0 });
    await exerciseStealth({ intrinsic: 1, extrinsic: 0, blocked: 1, draws: 1 });
    state.u.uprops[STEALTH].intrinsic = 0;
    state.u.uprops[STEALTH].extrinsic = 0;
    state.u.uprops[STEALTH].blocked = 0;

    // The same inclusive scan finds no furniture after the far-corner throne
    // is removed. This pins the initial FALSE value as well as both bounds.
    state.level.rooms[3].rtype = COURT;
    state.level.flags.has_court = true;
    state.level.at(14, 9).typ = ROOM;
    state.u.urooms = [0, 0, 0, 0, 0];
    state.u.urooms0 = [0, 0, 0, 0, 0];
    const plainCourtEvents = [];
    await check_special_room(false, state, {
        message: async (line) => plainCourtEvents.push(line),
        random: () => 1,
        canSeeMonster: () => true,
    });
    assert.equal(plainCourtEvents[0], 'You enter an opulent room!');
    state.level.at(12, 7).roomno = 3;

    for (const rt of [THEMEROOM, VAULT]) {
        state.u.urooms = [0, 0, 0, 0, 0];
        state.u.urooms0 = [0, 0, 0, 0, 0];
        state.level.rooms[0].rtype = rt;
        await check_special_room(false, state);
    }

    // The switch's `rt >= SHOPBASE` arm cannot be reached from the loop:
    // move_update() puts a shop into u.ushops_entered as well as u.uentered,
    // and u_entered_shop() answers for it above.
    for (const rt of [SHOPBASE, SHOPBASE + 4]) {
        state.u.urooms = [0, 0, 0, 0, 0];
        state.u.urooms0 = [0, 0, 0, 0, 0];
        state.u.ushops = [0, 0, 0, 0, 0];
        state.u.ushops0 = [0, 0, 0, 0, 0];
        state.level.rooms[0].rtype = rt;
        await assert.rejects(
            () => check_special_room(false, state),
            /untended shop/u,
            `shop type ${rt}`,
        );
    }
    });

test('restore_cham gives a shapeshifter back its shape', () => {
    const state = dungeonState();
    monst_globals_init(state);
    reset_mvitals(state);

    // mondata.h is_shapeshifter() reads M2_SHAPESHIFTER, which the chameleon
    // carries and a little dog does not.
    assert.equal(is_shapeshifter(state.mons[PM_CHAMELEON]), true);
    assert.equal(is_shapeshifter(state.mons[PM_LITTLE_DOG]), false);
    assert.equal(pm_to_cham(PM_CHAMELEON, state), PM_CHAMELEON);
    assert.equal(pm_to_cham(PM_LITTLE_DOG, state), NON_PM);

    const dog = newMonster();
    dog.data = state.mons[PM_LITTLE_DOG];
    dog.cham = NON_PM;
    restore_cham(dog, state);
    assert.equal(dog.cham, NON_PM);

    const chameleon = newMonster();
    chameleon.data = state.mons[PM_CHAMELEON];
    chameleon.cham = NON_PM;
    restore_cham(chameleon, state);
    assert.equal(chameleon.cham, PM_CHAMELEON);

    // The forced-revert arm needs normal_shape(), which is unported. Each of
    // its three terms reaches it on its own.
    for (const set of [
        (mon) => { mon.mcan = 1; },
        () => {
            state.u.uprops = [];
            state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = { intrinsic: 1 };
        },
        () => {
            state.u.uprops = [];
            state.u.uprops[PROT_FROM_SHAPE_CHANGERS] = { extrinsic: 1 };
        },
    ]) {
        const mon = newMonster();
        mon.data = state.mons[PM_CHAMELEON];
        mon.cham = NON_PM;
        state.u.uprops = [];
        set(mon);
        assert.throws(
            () => restore_cham(mon, state),
            /natural shape is future work/u,
        );
    }
});

test('update_mlstmv ages the level the hero is leaving', () => {
    const state = dungeonState();
    state.moves = 4321;
    const alive = newMonster();
    alive.mhp = 5;
    alive.mlstmv = 0;
    const dead = newMonster();
    dead.mhp = 0;
    dead.mlstmv = 0;
    alive.nmon = dead;
    state.level.monlist = alive;

    update_mlstmv(state);
    assert.equal(alive.mlstmv, 4321);
    // DEADMONSTER() skips the corpse-in-waiting.
    assert.equal(dead.mlstmv, 0);
});

test('losedogs stops on every list it cannot deliver', () => {
    const state = dungeonState();
    state.gm = { mydogs: null, migrating_mons: null };
    // Nothing on either list: the walk finds nothing to place.
    losedogs({ state });

    const shopkeeper = newMonster();
    shopkeeper.isshk = true;
    state.gm.migrating_mons = shopkeeper;
    assert.throws(
        () => losedogs({ state }),
        /shopkeeper returning to its shop level/u,
    );

    // A monster whose destination is the level being arrived on belongs to
    // one of mon_arrive()'s independent-arrival modes.
    const arriving = newMonster();
    arriving.mux = 0;
    arriving.muy = 1;
    state.gm.migrating_mons = arriving;
    assert.throws(
        () => losedogs({ state }),
        /migrating to the arrival level/u,
    );
});

// dog.c mon_arrive()'s With_you arm (468-480). Disposition changes one thing,
// the bound of the single rn2() that decides whether the follower takes the
// hero's own square: 10 for a pet, 5 for a peaceful monster, 2 for a hostile
// one. Nothing else in the arm reads tameness, and monmove.c set_apparxy()
// answers the hero's own square for all three because mon_arrive() has just
// written it into mux/muy, so its `u_at(mx, my)` clause (2211) holds.
function arrivalState() {
    const state = dungeonState();
    monst_globals_init(state);
    reset_mvitals(state);
    state.u.uprops = [];
    // A three-by-three room around the hero, so that enexto() has a square to
    // offer a follower that does not land on her.
    for (let x = state.u.ux - 1; x <= state.u.ux + 1; ++x) {
        for (let y = state.u.uy - 1; y <= state.u.uy + 1; ++y) {
            state.level.at(x, y).typ = ROOM;
        }
    }
    state.gm = { mydogs: null, migrating_mons: null };
    return state;
}

// One species across all three dispositions, because the selector reads
// mtame and mpeaceful and nothing else. A kobold zombie is what the two
// scanned seeds that reach the hostile arm actually send down the stairs.
function arrivingFollower(state, m_id) {
    const monster = newMonster();
    monster.data = state.mons[PM_KOBOLD_ZOMBIE];
    monster.mhp = 6;
    monster.mhpmax = 6;
    monster.m_id = m_id;
    // dog.c relmon() leaves a monster on gm.mydogs holding no square.
    monster.mx = 0;
    monster.my = 0;
    return monster;
}

function recordingRandom(result) {
    const bounds = [];
    return {
        bounds,
        random: {
            rn2(bound) {
                bounds.push(bound);
                return result;
            },
        },
    };
}

test('mon_arrive weights the hero own square by the follower disposition',
    () => {
        for (const [label, disposition, bound] of [
            ['a pet', (mon) => { mon.mtame = 1; }, 10],
            ['a peaceful monster', (mon) => { mon.mpeaceful = true; }, 5],
            ['a hostile stalker', () => {}, 2],
        ]) {
            const state = arrivalState();
            const follower = arrivingFollower(state, 77);
            disposition(follower);
            state.gm.mydogs = follower;
            // A zero answer is the "arrives at your intended destination"
            // case, which takes rloc_to() and draws nothing further.
            const { bounds, random } = recordingRandom(0);

            losedogs({ state, random });

            assert.deepEqual(bounds, [bound], label);
            assert.deepEqual([follower.mx, follower.my],
                [state.u.ux, state.u.uy], label);
            assert.equal(state.level.monlist, follower, label);
            assert.deepEqual([follower.mux, follower.muy],
                [state.u.ux, state.u.uy], label);
            assert.equal(state.gm.mydogs, null, label);
        }
    });

test('mon_arrive puts a follower beside the hero when the roll misses', () => {
    // The two halves of C's `!MON_AT(u.ux, u.uy) && !rn2(...)`, run against
    // one another. Both reach mnexto(), and their draw sequences differ by
    // exactly the selector the occupied square short-circuits away.
    const missed = arrivalState();
    const walkIn = arrivingFollower(missed, 78);
    missed.gm.mydogs = walkIn;
    // Any nonzero answer fails `!rn2(...)`, so mnexto() places the follower.
    const miss = recordingRandom(1);
    losedogs({ state: missed, random: miss.random });

    const occupied = arrivalState();
    const sitter = arrivingFollower(occupied, 79);
    place_monster(sitter, occupied.u.ux, occupied.u.uy, occupied);
    const arriving = arrivingFollower(occupied, 80);
    occupied.gm.mydogs = arriving;
    // A zero answer would take the hero's square if the selector were
    // reached, so this fails if MON_AT() stops guarding it.
    const taken = recordingRandom(0);
    losedogs({ state: occupied, random: taken.random });

    assert.equal(miss.bounds[0], 2);
    // enexto() shuffles its candidate rings, so every later draw is
    // collect_coords()'s and is common to both runs.
    assert.deepEqual(taken.bounds, miss.bounds.slice(1));

    for (const [state, follower] of [[missed, walkIn], [occupied, arriving]]) {
        assert.notDeepEqual([follower.mx, follower.my],
            [state.u.ux, state.u.uy]);
        assert.equal(
            Math.max(Math.abs(follower.mx - state.u.ux),
                Math.abs(follower.my - state.u.uy)),
            1,
        );
    }
    assert.equal(m_at(occupied.u.ux, occupied.u.uy, occupied), sitter);
});

// --- the sightseeing grant at do.c:1961-1964 ---

// exper.c more_experienced() reads u.uexp, u.urexp, flags.showexp, disp.botl,
// urole.mnum and flags.beginner, and nothing else.
function sightseerState({ role = PM_TOURIST, showexp = true } = {}) {
    const state = resetGame();
    state.u = { uz: { dnum: 0, dlevel: 2 }, ulevel: 1, uexp: 0, urexp: 0 };
    state.urole = { mnum: role };
    state.flags = { showexp, beginner: true };
    state.disp = { botl: false };
    state.iflags = { status_hilites: [] };
    return state;
}

test('more_experienced pays the score four times the experience', () => {
    const state = sightseerState();

    // do.c:1962 grants level_difficulty(), which on D:2 of the main dungeon
    // is depth(), so 2. exper.c:174 makes the score increment
    // 4 * exper + rexp.
    more_experienced(2, 0, state);

    assert.equal(state.u.uexp, 2);
    assert.equal(state.u.urexp, 8);
    // exper.c:185-186: the points are on the status line, so it is stale.
    assert.equal(state.disp.botl, true);
});

test('more_experienced leaves the status line alone without showexp', () => {
    const state = sightseerState({ showexp: false });

    more_experienced(2, 0, state);

    assert.equal(state.u.uexp, 2);
    assert.equal(state.u.urexp, 8);
    // exper.c:185-186 is the whole of the redraw for this grant: with
    // SCORE_ON_BOTL undefined the u.urexp half at 196-198 sets nothing, and
    // exp_percent_changing() answers FALSE without a highlight rule.
    assert.equal(state.disp.botl, false);
});

test('more_experienced skips the experience half of a score-only grant', () => {
    const state = sightseerState();

    // engrave.c:1057 and read.c:62 grant (0, 10): score only. exper.c:183
    // guards the whole experience block on newexp != oldexp.
    more_experienced(0, 10, state);

    assert.equal(state.u.uexp, 0);
    assert.equal(state.u.urexp, 10);
    assert.equal(state.disp.botl, false);
});

test('more_experienced refuses a total JavaScript cannot hold exactly', () => {
    // exper.c:178-181 caps each total at LONG_MAX when C's 64-bit addition
    // drives it negative. A JavaScript number stops being an exact integer at
    // 2**53 - 1 instead, so the port refuses there rather than answering with
    // a total that is neither C's cap nor the true sum. Each half stands on
    // its own: the score takes four times the experience, so a grant u.uexp
    // still holds exactly can already have left u.urexp behind, and a hero
    // sitting at the limit overflows u.uexp on a grant of one point while her
    // score stays small.
    const scoreOverflows = sightseerState();
    assert.throws(
        () => more_experienced(Number.MAX_SAFE_INTEGER, 0, scoreOverflows),
        UnsupportedExperienceChangeError,
    );

    const experienceOverflows = sightseerState();
    experienceOverflows.u.uexp = Number.MAX_SAFE_INTEGER;
    assert.throws(
        () => more_experienced(1, 0, experienceOverflows),
        UnsupportedExperienceChangeError,
    );
});

test('more_experienced clears flags.beginner at the role threshold', () => {
    // exper.c:201-202 compares u.urexp against 1000 for a Wizard and 2000
    // for everyone else, after the increment. Each pair below straddles its
    // threshold by one point: 1992 + 4 * 2 is exactly 2000, and 1991 + 8 is
    // one short.
    for (const [role, cleared, kept] of [
        [PM_TOURIST, 1992, 1991],
        [PM_WIZARD, 992, 991],
    ]) {
        const reached = sightseerState({ role });
        reached.u.urexp = cleared;
        more_experienced(2, 0, reached);
        assert.equal(reached.flags.beginner, false, `${role} at threshold`);

        const short = sightseerState({ role });
        short.u.urexp = kept;
        more_experienced(2, 0, short);
        assert.equal(short.flags.beginner, true, `${role} below threshold`);
    }
});

test('newexplevel leaves the level alone below the next threshold', async () => {
    const state = sightseerState();
    state.u.uexp = 2;

    // exper.c:301: newuexp(1) is 10 * 2**1, so a Tourist needs 20 points to
    // leave experience level 1 and D:2 pays 2 of them.
    await newexplevel(state, { message: async () => {} });

    assert.equal(state.u.ulevel, 1);
    assert.equal(state.u.uexp, 2);
});

test('newexplevel raises the hero once the threshold is met', async () => {
    const state = sightseerState();
    state.u.uexp = 20;

    // exper.c:302 calls pluslvl(TRUE), the arm this port refuses: the
    // smallest fresh case that reaches it is a Tourist on D:6, where
    // 2 + 3 + 4 + 5 + 6 first meets newuexp(1).
    await assert.rejects(
        () => newexplevel(state, { message: async () => {} }),
        UnsupportedExperienceChangeError,
    );
});

test('newexplevel stops at MAXULEV however many points are banked', async () => {
    const state = sightseerState();
    state.u.ulevel = 30;
    // newuexp(30) is 10000000 * (30 - 19), and the hero holds more, so only
    // exper.c:301's `u.ulevel < MAXULEV` stands between her and pluslvl().
    state.u.uexp = 110_000_002;

    await newexplevel(state, { message: async () => {} });

    assert.equal(state.u.ulevel, 30);
});

test('exp_percent_changing answers for the Xp field alone', () => {
    // botl.c:2100 skips the whole test when a redraw is already pending, and
    // botl.c:2109-2111 needs a threshold rule on BL_XP, initblstats[]'s
    // "experience-level" row, before it looks at any percentage.
    const bare = sightseerState();
    assert.equal(exp_percent_changing(bare), false);

    const elsewhere = sightseerState();
    elsewhere.iflags.status_hilites = [{ field: 'hitpoints' }];
    assert.equal(exp_percent_changing(elsewhere), false);

    const pending = sightseerState();
    pending.disp.botl = true;
    pending.iflags.status_hilites = [{ field: 'experience-level' }];
    assert.equal(exp_percent_changing(pending), false);

    const rule = sightseerState();
    rule.iflags.status_hilites = [{ field: 'experience-level' }];
    assert.throws(() => exp_percent_changing(rule),
        UnsupportedExperienceChangeError);

    // botl.c:2111 tests curr->thresholds alone, and botl.c:2799-2810 chains
    // every rule for the field onto it whatever its kind, so an 'always' rule
    // refuses exactly as a percentage rule does. The refusal is the diagnostic
    // a stopped session reports, so it must name what was tested -- a
    // highlight rule on Xp -- and not the narrower thing it once claimed.
    const always = sightseerState();
    always.iflags.status_hilites = [
        { field: 'experience-level', behavior: 'always', color: 'red' },
    ];
    assert.throws(
        () => exp_percent_changing(always),
        (error) => error instanceof UnsupportedExperienceChangeError
            && /status-highlight rule on Xp/u.test(error.message),
    );
});

// The sightseeing grant's own guard, do.c:1963's Role_if(PM_TOURIST), is not
// reachable from a unit test: it sits inside goto_level()'s arrival tail,
// after the level has been built and drawn. What proves it is the recorded
// matrix in scripts/run-leave-level.mjs, whose Valkyrie segment walks the same
// staircase and must arrive with no experience at all. That segment is the
// only thing separating a correct guard from `if (true)`, and nothing else
// notices if it is dropped, so this test pins the shape of the matrix the way
// scripts/level-change.test.mjs pins its sibling's.
test('the tourist-arrival matrix keeps the segments that prove the guard',
    () => {
        const segments = loadTouristArrivalRecipe().segments;
        const roleOf = (segment) =>
            /role:(\w+)/u.exec(segment.nethackrc)?.[1];
        // showexp rides a comma-separated OPTIONS line, and an option is
        // cleared by a leading '!', so neither anchor nor bare substring will
        // do.
        const showsExp = (segment) =>
            /(?<![!\w])showexp\b/u.test(segment.nethackrc);

        // The control: a non-Tourist descending the same way. Without it the
        // matrix cannot tell "only a Tourist is paid" from "everyone is".
        const control = segments.filter(
            (segment) => roleOf(segment) !== 'Tourist',
        );
        assert.equal(control.length, 1);
        assert.equal(roleOf(control[0]), 'Valkyrie');
        assert.ok(showsExp(control[0]),
            'the control must show Xp, or its arrival proves nothing');

        // The showexp pair: same walk, same seed, one option apart. It is what
        // separates more_experienced()'s disp.botl gate from an unconditional
        // redraw, because with showexp clear nothing may reach the screen.
        const tourists = segments.filter(
            (segment) => roleOf(segment) === 'Tourist',
        );
        const paired = tourists.filter((segment) => tourists.some(
            (other) => other !== segment
                && other.moves === segment.moves
                && showsExp(other) !== showsExp(segment),
        ));
        assert.equal(paired.length, 2);

        // The pet segment: see_monsters() needs a live monster to pass through
        // newsym(), and no other segment carries one.
        assert.ok(segments.some(
            (segment) => /pettype:dog/u.test(segment.nethackrc),
        ));
    });
