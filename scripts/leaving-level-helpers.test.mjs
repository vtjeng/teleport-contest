// The helpers do.c goto_level()'s opening phase reaches, each pinned against
// the C function it comes from: wizard.c mon_has_amulet(), mon.c
// get_iter_mons(), mondata.c levl_follower(), apply.c next_to_u(), lock.c
// reset_pick()/maybe_reset_pick(), hack.c set_uinwater()/check_special_room(),
// and dungeon.c dunlevs_in_dungeon()/In_hell()/next_level().
//
// Every expected value comes from reading those functions. None was copied
// from a run of the port. scripts/dodown.test.mjs pins what goto_level() does
// with them, and scripts/run-leave-level.mjs is the recorded evidence for the
// whole path.

import assert from 'node:assert/strict';
import test from 'node:test';

import { In_tutorial, OBJ_FLOOR, OBJ_INVENT } from '../js/const.js';
import { next_to_u } from '../js/apply_next_to_u.js';
import {
    In_hell,
    dunlevs_in_dungeon,
    next_level,
} from '../js/dungeon.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { set_uinwater } from '../js/hack.js';
import { maybe_reset_pick, reset_pick } from '../js/lock.js';
import { get_iter_mons } from '../js/mon.js';
import { levl_follower } from '../js/mondata.js';
import { newMonster } from '../js/monst.js';
import {
    PM_HOUSECAT,
    PM_SEWER_RAT,
    PM_STALKER,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { AMULET_OF_YENDOR, ELVEN_DAGGER } from '../js/objects.js';
import { check_special_room } from '../js/rooms.js';
import { is_fshk } from '../js/shk.js';
import { mon_has_amulet } from '../js/wizard.js';

const ROOM_BUFFER_SIZE = 5;
const HERO_X = 20;
const HERO_Y = 10;

function heroState() {
    const state = {
        // Two dungeons with different level counts, one of them hellish.
        // In_hell() reads the flag and dunlevs_in_dungeon() reads
        // num_dunlevs; the counts differ so that a port reading the wrong
        // dungeon's row answers the other number.
        dungeons: [
            { depth_start: 1, ledger_start: 0, num_dunlevs: 29,
                flags: { hellish: false } },
            { depth_start: 30, ledger_start: 29, num_dunlevs: 20,
                flags: { hellish: true } },
        ],
        level: new GameMap(),
        stairs: null,
        u: {
            ux: HERO_X,
            uy: HERO_Y,
            uz: { dnum: 0, dlevel: 4 },
            uinwater: false,
            usteed: null,
            uprops: [],
            urooms: new Array(ROOM_BUFFER_SIZE).fill(0),
            urooms0: new Array(ROOM_BUFFER_SIZE).fill(0),
            uentered: new Array(ROOM_BUFFER_SIZE).fill(0),
            ushops: new Array(ROOM_BUFFER_SIZE).fill(0),
            ushops0: new Array(ROOM_BUFFER_SIZE).fill(0),
            ushops_entered: new Array(ROOM_BUFFER_SIZE).fill(0),
            ushops_left: new Array(ROOM_BUFFER_SIZE).fill(0),
        },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    return state;
}

function monsterOf(state, pmidx, overrides = {}) {
    return newMonster({
        data: state.mons[pmidx],
        mhp: 4,
        mhpmax: 4,
        mcanmove: true,
        ...overrides,
    });
}

test('mon_has_amulet finds the Amulet anywhere in a monster inventory', () => {
    // wizard.c:110-113 walks minvent by nobj and tests otyp alone, so a second
    // object in the chain must not hide the Amulet behind it.
    const dagger = { otyp: ELVEN_DAGGER, nobj: null };
    const amulet = { otyp: AMULET_OF_YENDOR, nobj: null };
    assert.equal(mon_has_amulet({ minvent: null }), false);
    assert.equal(mon_has_amulet({ minvent: dagger }), false);
    assert.equal(mon_has_amulet({ minvent: amulet }), true);
    assert.equal(
        mon_has_amulet({ minvent: { ...dagger, nobj: amulet } }),
        true,
    );
});

test('get_iter_mons skips the dead and the off-map', () => {
    // mon.c:2419-2429. DEADMONSTER() is mhp < 1 and mon_offmap() is a nonzero
    // mstate, so exactly the third monster here is a candidate.
    const state = heroState();
    const live = monsterOf(state, PM_SEWER_RAT, { m_id: 3 });
    const offmap = monsterOf(state, PM_SEWER_RAT,
        { m_id: 2, mstate: 4, nmon: live });
    const dead = monsterOf(state, PM_SEWER_RAT,
        { m_id: 1, mhp: 0, nmon: offmap });
    state.level.monlist = dead;

    const seen = [];
    assert.equal(
        get_iter_mons((mon) => {
            seen.push(mon.m_id);
            return false;
        }, state),
        null,
    );
    assert.deepEqual(seen, [3]);
    assert.equal(get_iter_mons(() => true, state), live);
});

test('get_iter_mons survives a predicate that unlinks its monster', () => {
    // C caches mtmp->nmon before calling bfunc for exactly this reason.
    const state = heroState();
    const second = monsterOf(state, PM_SEWER_RAT, { m_id: 2 });
    const first = monsterOf(state, PM_SEWER_RAT, { m_id: 1, nmon: second });
    state.level.monlist = first;

    const seen = [];
    get_iter_mons((mon) => {
        seen.push(mon.m_id);
        mon.nmon = null;
        return false;
    }, state);

    assert.deepEqual(seen, [1, 2]);
});

test('levl_follower answers each of mondata.c:1211-1225 in turn', () => {
    const state = heroState();
    const amulet = { otyp: AMULET_OF_YENDOR, nobj: null };

    const steed = monsterOf(state, PM_SEWER_RAT);
    state.u.usteed = steed;
    assert.equal(levl_follower(steed, state), true, 'the steed always follows');
    state.u.usteed = null;

    // The Wizard with the Amulet does not bother following.
    assert.equal(
        levl_follower(monsterOf(state, PM_SEWER_RAT,
            { iswiz: true, minvent: amulet }), state),
        false,
    );
    // Without it he does, and so does any tame monster.
    assert.equal(
        levl_follower(monsterOf(state, PM_SEWER_RAT, { iswiz: true }), state),
        true,
    );
    assert.equal(
        levl_follower(monsterOf(state, PM_HOUSECAT, { mtame: 5 }), state),
        true,
    );
    // A following shopkeeper follows; a resident one does not.
    assert.equal(
        levl_follower(monsterOf(state, PM_SEWER_RAT, {
            isshk: true, mextra: { eshk: { following: 1 } },
        }), state),
        true,
    );
    assert.equal(
        levl_follower(monsterOf(state, PM_SEWER_RAT, {
            isshk: true, mextra: { eshk: { following: 0 } },
        }), state),
        false,
    );

    // M2_STALK: a stalker follows unless it is fleeing, and follows even then
    // once the hero carries the Amulet. A sewer rat has no M2_STALK at all.
    state.u.uhave = { amulet: false };
    assert.equal(levl_follower(monsterOf(state, PM_STALKER), state), true);
    assert.equal(
        levl_follower(monsterOf(state, PM_STALKER, { mflee: true }), state),
        false,
    );
    state.u.uhave.amulet = true;
    assert.equal(
        levl_follower(monsterOf(state, PM_STALKER, { mflee: true }), state),
        true,
    );
    assert.equal(levl_follower(monsterOf(state, PM_SEWER_RAT), state), false);
});

test('next_to_u lets an unencumbered hero leave and refuses a leash', () => {
    // apply.c:918-926. get_iter_mons() answers null when no monster is
    // leashed, which is every state this port can build.
    const state = heroState();
    state.level.monlist = monsterOf(state, PM_HOUSECAT, { mtame: 5 });
    assert.equal(next_to_u(state), true);

    state.level.monlist.mleashed = true;
    assert.throws(() => next_to_u(state), /leashed companion/u);
});

test('next_to_u refuses a mounted hero and blocks a steed with the Amulet',
    () => {
    // apply.c:922-923. The Amulet arm is the one that answers FALSE; every
    // other steed reaches keepdogs()'s unported u.usteed branch, so it stops.
    const state = heroState();
    state.u.usteed = monsterOf(state, PM_SEWER_RAT);
    assert.throws(() => next_to_u(state), /with a steed/u);

    state.u.usteed.minvent = { otyp: AMULET_OF_YENDOR, nobj: null };
    assert.equal(next_to_u(state), false);
});

test('reset_pick zeroes every field of gx.xlock', () => {
    // lock.c:258-266.
    const state = {};
    reset_pick(state);
    assert.deepEqual(state.xlock, {
        usedtime: 0,
        chance: 0,
        picktyp: 0,
        magic_key: false,
        door: null,
        box: null,
    });
});

test('maybe_reset_pick keeps context for a carried box and drops the rest',
    () => {
    // lock.c:268-285. A level change passes null: the context survives only
    // when the box the hero was picking travels with her.
    const carriedBox = { where: OBJ_INVENT };
    const floorBox = { where: OBJ_FLOOR };

    let state = { xlock: { box: carriedBox, usedtime: 4 } };
    maybe_reset_pick(null, state);
    assert.equal(state.xlock.box, carriedBox, 'a carried box keeps context');
    assert.equal(state.xlock.usedtime, 4);

    state = { xlock: { box: floorBox, usedtime: 4 } };
    maybe_reset_pick(null, state);
    assert.equal(state.xlock.box, null, 'a floor box loses context');
    assert.equal(state.xlock.usedtime, 0);

    // A door being picked has a null box, so a level change clears it too.
    state = { xlock: { box: null, door: {}, usedtime: 4 } };
    maybe_reset_pick(null, state);
    assert.equal(state.xlock.door, null);

    // obfree() passes the container it is deleting; an unrelated one is kept.
    state = { xlock: { box: carriedBox, usedtime: 4 } };
    maybe_reset_pick(floorBox, state);
    assert.equal(state.xlock.box, carriedBox);
    maybe_reset_pick(carriedBox, state);
    assert.equal(state.xlock.box, null);
});

test('set_uinwater only reaches switch_terrain() when the flag changes', () => {
    // hack.c:3220-3227. switch_terrain() refuses on this port's map, so an
    // inert call is the difference between stopping and continuing.
    const state = heroState();
    state.u.uinwater = false;
    set_uinwater(0, state);
    assert.equal(state.u.uinwater, false);
    set_uinwater(false, state);
    assert.equal(state.u.uinwater, false);

    state.u.uinwater = true;
    set_uinwater(1, state);
    assert.equal(state.u.uinwater, true);

    // A real change calls switch_terrain(), which refuses the blank fixture
    // map because STONE satisfies IS_OBSTRUCTED(); the throw proves the call
    // happened, and its absence above proves the inert calls did not make it.
    assert.throws(
        () => set_uinwater(1, heroState()),
        /switch_terrain\(\) onto terrain that blocks levitation/u,
    );
});

test('check_special_room(TRUE) clears the room strings and stops for a shop',
    () => {
    // hack.c:3624-3654. move_update(TRUE) blanks u.uentered and
    // u.ushops_entered, so the early return is unconditional for a new level.
    const state = heroState();
    state.u.urooms[0] = 3;
    state.u.uentered[0] = 3;

    check_special_room(true, state);

    assert.deepEqual([...state.u.urooms], [0, 0, 0, 0, 0]);
    assert.deepEqual([...state.u.uentered], [0, 0, 0, 0, 0]);
    assert.deepEqual([...state.u.urooms0], [3, 0, 0, 0, 0]);

    // u.ushops0 is what move_update() copied from u.ushops, so a hero leaving
    // a shop reaches u_left_shop().
    const shopper = heroState();
    shopper.u.ushops[0] = 5;
    assert.throws(() => check_special_room(true, shopper), /leaving a shop/u);

    const town = heroState();
    town.level.flags = { has_town: true };
    assert.throws(() => check_special_room(true, town), /holding a town/u);
});

test('dunlevs_in_dungeon and In_hell read the dungeon the level belongs to',
    () => {
    // dungeon.c:1331-1335 and 1941-1945.
    const state = heroState();
    assert.equal(dunlevs_in_dungeon({ dnum: 0, dlevel: 1 }, state), 29);
    assert.equal(dunlevs_in_dungeon({ dnum: 1, dlevel: 1 }, state), 20);
    assert.equal(In_hell({ dnum: 0, dlevel: 1 }, state), false);
    assert.equal(In_hell({ dnum: 1, dlevel: 1 }, state), true);
});

test('next_level follows the staircase it stands on, or descends one level',
    async () => {
    // dungeon.c:1496-1514. The branch that matters is `at_stairs && stway`:
    // with both, the destination comes from the stairway and `falling` is
    // FALSE; without either, it is the next level down and `falling` is
    // !at_stairs.
    const state = heroState();
    // stairs.c stairway_add() writes the module-level game rather than a
    // supplied state, so the node is built here in the shape it produces.
    const stway = { sx: HERO_X, sy: HERO_Y, up: false, isladder: false,
        tolev: { dnum: 1, dlevel: 1 }, next: null };
    state.stairs = stway;

    const calls = [];
    const gotoLevel = (...args) => calls.push(args.slice(0, 4));

    next_level(true, state, { gotoLevel });
    assert.equal(stway.u_traversed, true);
    assert.deepEqual(calls.at(-1),
        [{ dnum: 1, dlevel: 1 }, true, false, false]);

    // No stairway under the hero: a trap door drops her to dlevel + 1 and
    // marks the arrival as a fall.
    state.stairs = null;
    next_level(false, state, { gotoLevel });
    assert.deepEqual(calls.at(-1),
        [{ dnum: 0, dlevel: 5 }, false, true, false]);

    // at_stairs TRUE with no stairway keeps falling FALSE.
    next_level(true, state, { gotoLevel });
    assert.deepEqual(calls.at(-1),
        [{ dnum: 0, dlevel: 5 }, true, false, false]);

    // next_level() is async because goto_level() is; the missing-operation
    // check still runs before its first await, so it rejects rather than
    // throwing.
    await assert.rejects(() => next_level(true, state, {}), TypeError);
});

test('is_fshk needs both the shopkeeper flag and the following flag', () => {
    // shk.c:5010-5015. `following` alone belongs to no shopkeeper, so the
    // isshk half is what keeps a stray mextra from answering TRUE.
    assert.equal(is_fshk({ isshk: false, mextra: { eshk: { following: 1 } } }),
        false);
    assert.equal(is_fshk({ isshk: true, mextra: { eshk: { following: 1 } } }),
        true);
    assert.equal(is_fshk({ isshk: true, mextra: { eshk: { following: 0 } } }),
        false);
    assert.equal(is_fshk({ isshk: true }), false);
});

test('get_iter_mons visits a monster on its last hit point', () => {
    // DEADMONSTER() is `mhp < 1`, so one hit point is still alive.
    const state = heroState();
    const dying = monsterOf(state, PM_SEWER_RAT, { m_id: 5, mhp: 1 });
    state.level.monlist = dying;

    assert.equal(get_iter_mons(() => true, state), dying);
});

test('maybe_reset_pick builds gx.xlock zeroed when the state has none', () => {
    // The struct C declares zeroed. Passing a container that is not the box
    // leaves reset_pick() unrun, so the initial values are what remain.
    const state = {};
    maybe_reset_pick({ where: OBJ_FLOOR }, state);
    assert.deepEqual(state.xlock, {
        usedtime: 0,
        chance: 0,
        picktyp: 0,
        magic_key: false,
        door: null,
        box: null,
    });
});

test('In_tutorial answers FALSE when there is no tutorial dungeon', () => {
    // dungeon.h:142 over a port whose game.tutorial_dnum is undefined unless
    // dat/dungeon.lua's tutorial branch was loaded. Without the integer test,
    // a level with no dnum would match an undefined tutorial_dnum.
    const state = resetGame();
    assert.equal(state.tutorial_dnum, undefined);
    assert.equal(In_tutorial({ dlevel: 1 }), false);
    assert.equal(In_tutorial({ dnum: 0, dlevel: 1 }), false);

    state.tutorial_dnum = 3;
    assert.equal(In_tutorial({ dnum: 3, dlevel: 1 }), true);
    assert.equal(In_tutorial({ dnum: 0, dlevel: 1 }), false);
});
