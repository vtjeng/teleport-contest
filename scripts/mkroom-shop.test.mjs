// Tests for mkroom.c mkshop()'s tail, special-room filling, and the
// shknam.c shtypes[] table it
// rolls against. Every expected value below was read from
// nethack-c/upstream/src/mkroom.c:179-215 and
// nethack-c/upstream/src/shknam.c:206-350, not from a recorded session.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BARRACKS,
    BEEHIVE,
    FILL_NONE,
    FILL_NORMAL,
    COURT,
    G_GONE,
    LOW_PM,
    MORGUE,
    M_AP_OBJECT,
    OROOM,
    ROOM,
    ROOMOFFSET,
    SHOPBASE,
    THRONE,
    VAULT,
    ismnum,
} from '../js/const.js';
import { ledger_no } from '../js/dungeon.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { game, resetGame } from '../js/gstate.js';
import {
    UnsupportedSpecialRoomError,
    courtCellIsFillable,
    courtmon,
    do_mkroom,
    fill_zoo,
    pick_room,
    squadmon,
} from '../js/mkroom.js';
import { m_at } from '../js/monst.js';
import { init_objects } from '../js/o_init.js';
import {
    NON_PM,
    NUMMONS,
    PM_JACKAL,
    PM_BUGBEAR,
    PM_DWARF_RULER,
    PM_GNOME_RULER,
    PM_HOBGOBLIN,
    PM_HUMAN,
    PM_KILLER_BEE,
    PM_LICHEN,
    PM_QUEEN_BEE,
    PM_SOLDIER,
    PM_SERGEANT,
    PM_LIEUTENANT,
    PM_CAPTAIN,
    M2_GNOME,
    S_MIMIC,
    S_GNOME,
    S_KOBOLD,
    S_ORC,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { SIR_TERRY_NOVELS } from '../js/do_name.js';
import {
    AMULET_CLASS,
    APPLE,
    ARMOR_CLASS,
    CHEST,
    CORPSE,
    CRAM_RATION,
    EGG,
    ELVEN_CLOAK,
    EUCALYPTUS_LEAF,
    FOOD_CLASS,
    FOOD_RATION,
    GEM_CLASS,
    ICE_BOX,
    LEATHER_GLOVES,
    LUMP_OF_ROYAL_JELLY,
    LARGE_BOX,
    MEATBALL,
    NUM_OBJECTS,
    POTION_CLASS,
    POT_BOOZE,
    POT_FRUIT_JUICE,
    POT_FULL_HEALING,
    POT_HEALING,
    POT_WATER,
    RANDOM_CLASS,
    RING_CLASS,
    SCROLL_CLASS,
    SCR_CHARGING,
    SCR_FOOD_DETECTION,
    SLIME_MOLD,
    SPBOOK_CLASS,
    SPE_NOVEL,
    STRANGE_OBJECT,
    TIN,
    TOOL_CLASS,
    TOUCHSTONE,
    TRIPE_RATION,
    WAND_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    SHTYPES,
    shkarmors,
    shkbooks,
    shkgeneral,
    shkliquors,
    shkrings,
    shktools,
    shkweapons,
} from '../js/shtypes_data.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { timeout_globals_init } from '../js/timeout.js';
import { nameshk, shkveg, stock_room, veggy_item } from '../js/shknam.js';
import {
    loadLevelTeleportArrivalRecipe,
    verifyLevelTeleportArrival,
} from './run-level-teleport-arrival.mjs';

// shknam.c shtypes[] in source order. mkroom.c stores the index as
// rtype - SHOPBASE, so these are also the rtype offsets mkroom.h's
// ARMORSHOP..CANDLESHOP enumerate.
const GENERAL_STORE = 0;
const ARMOR_SHOP = 1;
const SCROLL_SHOP = 2;
const LIQUOR_EMPORIUM = 3;
const WEAPON_SHOP = 4;
const JEWELERS = 6;
const WAND_SHOP = 7;
const TOOL_SHOP = 8;
const BOOKSTORE = 9;

function initializedState() {
    const state = resetGame();
    state.u = { ulevel: 1, uz: { dnum: 0, dlevel: 2 } };
    state.level = new GameMap();
    state.level.nroom = 0;
    state.level.rooms = [];
    state.stairs = null;
    return state;
}

function initializedCourtState() {
    const state = initializedState();
    state.astral_level = { dnum: 9, dlevel: 9 };
    state.branches = [];
    state.context = { current_fruit: 1, ident: 2, mon_moving: false };
    state.dungeons = [{
        depth_start: 1,
        ledger_start: 0,
        num_dunlevs: 29,
        entry_lev: 1,
        dunlev_ureached: 5,
        flags: {},
    }];
    state.flags = {};
    state.gz = { zombify: false };
    state.in_mklev = true;
    state.moves = 0;
    state.program_state = { gameover: false };
    state.quest_dnum = 1;
    state.rogue_level = { dnum: 0, dlevel: 15 };
    state.sanctum_level = { dnum: 9, dlevel: 8 };
    state.specialLevels = [];
    state.u = {
        ualign: { type: -1, record: 20, abuse: 0 },
        uhave: { amulet: 0 },
        ulevel: 5,
        uz: { dnum: 0, dlevel: 5 },
    };
    state.urace = { lovemask: 0, hatemask: 0 };
    state.urole = { mnum: PM_HUMAN };
    monst_globals_init(state);
    reset_mvitals(state);
    init_objects(state, () => 0);
    timeout_globals_init(state);
    return state;
}

function courtFillRandom(rulerRoll) {
    let pendingRulerRoll = rulerRoll;
    return {
        d: (count) => count,
        rn1: (_bound, base) => base,
        rn2(bound) {
            // courtmon() receives 16 and selects the gnome class. A hero with
            // the matching race affinity necessarily makes those subjects
            // peaceful before fill_zoo() applies the Court hostility override.
            if (bound === 60) return 16;
            if (bound === 15) return 0;
            return bound > 1 ? 1 : 0;
        },
        rnd(bound) {
            if (pendingRulerRoll !== null && bound === 5) {
                const result = pendingRulerRoll;
                pendingRulerRoll = null;
                return result;
            }
            return 1;
        },
        rne: () => 1,
        rnz: (value) => value,
    };
}

// A rectangular room with one door, no staircase, and enough floor beside the
// door that invalid_shop_shape() accepts it. `lit` is C's sroom->rlit.
function shopCandidate(state, {
    lx = 10, ly = 5, hx = 14, hy = 8, lit = 1, rtype = OROOM,
} = {}) {
    for (let x = lx; x <= hx; ++x)
        for (let y = ly; y <= hy; ++y) state.level.at(x, y).typ = ROOM;
    const door = { x: lx - 1, y: ly };
    state.level.doors = [door];
    const room = {
        lx, ly, hx, hy, rtype, rlit: lit, doorct: 1, fdoor: 0,
        roomnoidx: state.level.nroom, needfill: FILL_NONE, irregular: false,
        nsubrooms: 0, sbrooms: [],
    };
    state.level.rooms.push(room);
    state.level.nroom = state.level.rooms.length;
    return room;
}

// mkshop() draws exactly one rnd(100). Returning `roll` from it is what makes
// the shop type predictable without a seed.
function oneRoll(roll) {
    let drawn = 0;
    return {
        random: {
            rnd(bound) {
                assert.equal(bound, 100, 'mkshop draws only rnd(100)');
                drawn += 1;
                return roll;
            },
        },
        drawn: () => drawn,
    };
}

test('shtypes[] carries shknam.c\'s twelve rows with their source shares',
    () => {
        // shknam.c:206-350. Names, shares and symbols read from the array
        // literal; the sentinel row is not carried.
        assert.deepEqual(
            SHTYPES.map(({ name, prob }) => [name, prob]),
            [
                ['general store', 42],
                ['used armor dealership', 14],
                ['second-hand bookstore', 10],
                ['liquor emporium', 10],
                ['antique weapons outlet', 5],
                ['delicatessen', 5],
                ['jewelers', 3],
                ['quality apparel and accessories', 3],
                ['hardware store', 3],
                ['rare books', 3],
                ['health food store', 2],
                ['lighting store', 0],
            ],
        );
        // The shares have to total 100, or mkshop()'s walk runs off the end of
        // the table. shknam.c's disabled init_shop_selection() asserts the
        // same total.
        assert.equal(
            SHTYPES.reduce((sum, { prob }) => sum + prob, 0),
            100,
        );
        // Each shop's item shares total 100 for the same reason in
        // get_shop_item().
        for (const shop of SHTYPES) {
            assert.equal(
                shop.iprobs.reduce((sum, { iprob }) => sum + iprob, 0),
                100,
                shop.name,
            );
        }
    });

test('shtypes[] rows share one name list where shknam.c shares the pointer',
    () => {
        // shknam.c gives both bookshops the shkbooks array, and shkinit() and
        // nameshk() branch on that pointer's identity, so the two rows have to
        // be the same array here too.
        assert.equal(SHTYPES[SCROLL_SHOP].shknms, shkbooks);
        assert.equal(SHTYPES[BOOKSTORE].shknms, shkbooks);
        assert.notEqual(SHTYPES[GENERAL_STORE].shknms, shkbooks);
        // Lengths read from the C arrays. shktools ends at "Telloc Cyaj":
        // every name after it sits behind a platform #ifdef the recorder build
        // leaves undefined.
        assert.equal(shkgeneral.length, 30);
        assert.equal(shkarmors.length, 30);
        assert.equal(shkweapons.length, 31);
        assert.equal(shkbooks.length, 26);
        assert.equal(SHTYPES[8].shknms.length, 40);
        assert.equal(shkgeneral[0], 'Hebiwerie');
        assert.equal(shkarmors[shkarmors.length - 1], 'Nallihan');
    });

test('the shop-type roll lands on each row at the source share boundaries',
    () => {
        // C: for (j = rnd(100), i = 0; (j -= shtypes[i].prob) > 0; i++).
        // rnd(100) answers 1..100, so row 0 keeps j <= 42, row 1 keeps
        // 42 < j <= 56, and so on. These are the only draws that can shift a
        // whole column of shop types without changing the random-number log.
        const boundaries = [
            [1, GENERAL_STORE], [42, GENERAL_STORE],
            [43, ARMOR_SHOP], [56, ARMOR_SHOP],
            [57, SCROLL_SHOP], [66, SCROLL_SHOP],
            [67, 3], [76, 3],
            [77, WEAPON_SHOP], [81, WEAPON_SHOP],
            [82, 5], [86, 5],
            [87, 6], [89, 6],
            [90, WAND_SHOP], [92, WAND_SHOP],
            [93, 8], [95, 8],
            [96, BOOKSTORE], [98, BOOKSTORE],
            [99, 10], [100, 10],
        ];
        for (const [roll, expected] of boundaries) {
            const state = initializedState();
            // A four-by-four room, sixteen squares: comfortably under
            // isbig()'s `area > 20`, so the wand and spellbook override
            // cannot rewrite the rolled type. The override's own boundary is
            // exercised one square either side in the next test; this one only
            // needs a room that is not big.
            const room = shopCandidate(state, { hx: 13, hy: 8 });
            const rolled = oneRoll(roll);
            do_mkroom(SHOPBASE, state, rolled.random);
            assert.equal(rolled.drawn(), 1, `roll ${roll} draws once`);
            assert.equal(
                room.rtype - SHOPBASE, expected, `roll ${roll}`,
            );
        }
    });

test('a big room turns a wand or spellbook shop into a general store', () => {
    // mkroom.c:196-201. isbig() is area > 20, and only the wand shop's
    // WAND_CLASS and the bookstore's SPBOOK_CLASS symb are rewritten.
    assert.equal(SHTYPES[WAND_SHOP].symb, WAND_CLASS);
    assert.equal(SHTYPES[BOOKSTORE].symb, SPBOOK_CLASS);
    assert.equal(SHTYPES[GENERAL_STORE].symb, RANDOM_CLASS);
    assert.equal(SHTYPES[ARMOR_SHOP].symb, ARMOR_CLASS);
    assert.equal(SHTYPES[WEAPON_SHOP].symb, WEAPON_CLASS);

    // shopCandidate() puts every room at lx 10, ly 5, so the area is
    // (hx - 9) * (hy - 4). These two sit one square either side of isbig()'s
    // `area > 20`, which is the only boundary the override turns on.
    // Seven by three, twenty-one squares: one over, so isbig() is true.
    const big = { hx: 16, hy: 7 };
    // Five by four, twenty squares: the largest room isbig() calls small.
    const small = { hx: 14, hy: 8 };
    const cases = [
        // roll 90 selects the wand shop, roll 96 the bookstore.
        [big, 90, GENERAL_STORE], [big, 96, GENERAL_STORE],
        [small, 90, WAND_SHOP], [small, 96, BOOKSTORE],
        // A big room leaves every other rolled type alone; roll 43 is the
        // armor shop, whose symb fails the second half of the test.
        [big, 43, ARMOR_SHOP],
    ];
    for (const [bounds, roll, expected] of cases) {
        const state = initializedState();
        const room = shopCandidate(state, bounds);
        do_mkroom(SHOPBASE, state, oneRoll(roll).random);
        assert.equal(
            room.rtype - SHOPBASE, expected,
            `${bounds.hx - 10 + 1}x${bounds.hy - 5 + 1} room, roll ${roll}`,
        );
    }
});

test('mkshop lights an unlit shop and the one-cell border around it', () => {
    // mkroom.c:179-187 runs x from lx-1 to hx+1 and y from ly-1 to hy+1, so
    // the walls and the doorway are lit along with the floor. The loop draws
    // no random number, so a wrong bound shows up only on the screen.
    const state = initializedState();
    const room = shopCandidate(state, { hx: 13, hy: 8, lit: 0 });
    for (let x = room.lx - 2; x <= room.hx + 2; ++x)
        for (let y = room.ly - 2; y <= room.hy + 2; ++y)
            state.level.at(x, y).lit = 0;

    do_mkroom(SHOPBASE, state, oneRoll(1).random);

    assert.equal(room.rlit, 1);
    for (let x = room.lx - 2; x <= room.hx + 2; ++x) {
        for (let y = room.ly - 2; y <= room.hy + 2; ++y) {
            const inside = x >= room.lx - 1 && x <= room.hx + 1
                && y >= room.ly - 1 && y <= room.hy + 1;
            assert.equal(
                state.level.at(x, y).lit, inside ? 1 : 0, `<${x},${y}>`,
            );
        }
    }
});

test('mkshop leaves a lit shop room untouched', () => {
    // The `if (!sroom->rlit)` guard. A room that is already lit keeps every
    // cell of its border dark, which is what separates the guard from an
    // unconditional lighting pass.
    const state = initializedState();
    const room = shopCandidate(state, { hx: 13, hy: 8, lit: 1 });
    for (let x = room.lx - 1; x <= room.hx + 1; ++x)
        for (let y = room.ly - 1; y <= room.hy + 1; ++y)
            state.level.at(x, y).lit = 0;

    do_mkroom(SHOPBASE, state, oneRoll(1).random);

    assert.equal(state.level.at(room.lx - 1, room.ly - 1).lit, 0);
    assert.equal(state.level.at(room.lx, room.ly).lit, 0);
});

test('mkshop marks the room for filling and topologizes it', () => {
    // mkroom.c:203-215. The room is not stocked here: makelevel()'s tail
    // reaches stock_room() through fill_special_room() because needfill is
    // FILL_NORMAL.
    const state = initializedState();
    const room = shopCandidate(state, { hx: 13, hy: 8 });

    do_mkroom(SHOPBASE, state, oneRoll(1).random);

    assert.equal(room.needfill, FILL_NORMAL);
    const roomno = room.roomnoidx + ROOMOFFSET;
    assert.equal(state.level.at(room.lx, room.ly).roomno, roomno);
    assert.equal(state.level.at(room.hx, room.hy).roomno, roomno);
    // topologize() marks the border as an edge square of the same room.
    assert.equal(state.level.at(room.lx - 1, room.ly - 1).roomno, roomno);
    assert.equal(state.level.at(room.lx - 1, room.ly - 1).edge, true);
});

test('mkshop skips a room that is not an ordinary unoccupied one-door room',
    () => {
        // The search's three rejections, each on its own. A level whose rooms
        // all fail leaves every room unchanged and draws nothing at all,
        // because the roll sits after the search.
        const rejections = [
            ['already a special room', { rtype: VAULT }],
            ['no door', { doorct: 0 }],
            ['two doors', { doorct: 2 }],
        ];
        for (const [label, overrides] of rejections) {
            const state = initializedState();
            const room = shopCandidate(state, { hx: 13, hy: 8 });
            Object.assign(room, overrides);
            const rolled = oneRoll(1);
            do_mkroom(SHOPBASE, state, rolled.random);
            assert.equal(rolled.drawn(), 0, label);
            assert.equal(room.rtype, overrides.rtype ?? OROOM, label);
            assert.equal(room.needfill, FILL_NONE, label);
        }
    });

test('mkshop takes the first eligible room and leaves the later ones alone',
    () => {
        // C breaks out of the search on the first eligible room, so a second
        // one stays ordinary.
        const state = initializedState();
        const skipped = shopCandidate(state, { hx: 13, hy: 8 });
        skipped.doorct = 2;
        const chosen = shopCandidate(state, {
            lx: 30, ly: 5, hx: 33, hy: 8,
        });
        const ignored = shopCandidate(state, {
            lx: 50, ly: 5, hx: 53, hy: 8,
        });
        // Each room's own door: shopCandidate() replaces the door list, so
        // point each room at the entry it needs.
        state.level.doors = [
            { x: skipped.lx - 1, y: skipped.ly },
            { x: chosen.lx - 1, y: chosen.ly },
            { x: ignored.lx - 1, y: ignored.ly },
        ];
        skipped.fdoor = 0;
        chosen.fdoor = 1;
        ignored.fdoor = 2;

        do_mkroom(SHOPBASE, state, oneRoll(1).random);

        assert.equal(skipped.rtype, OROOM);
        assert.equal(chosen.rtype, SHOPBASE + GENERAL_STORE);
        assert.equal(ignored.rtype, OROOM);
    });

test('stock_room rejects a row shtypes[] does not carry', () => {
    // Every row the table carries now stocks, so the only refusal left here is
    // a subscript past the end, which is a programming error rather than a
    // segment boundary. shtypes[11], the lighting store, is inside the table
    // and stocks like any other row; mkshop() cannot roll it, because its prob
    // column is 0.
    const state = initializedState();
    const room = shopCandidate(state, { hx: 13, hy: 8 });
    assert.throws(() => stock_room(12, room, { state }), RangeError);
});

test('do_mkroom supports zoo families through Barracks and refuses later rooms',
    () => {
        // COURT and BEEHIVE dispatch to mkzoo(). TEMPLE dispatches to
        // mktemple(). BARRACKS now shares mkzoo() with the earlier families;
        // the remaining later types stay named refusals until
        // their complete population and entry effects are ported.
        const state = initializedState();
        const room = shopCandidate(state, { hx: 13, hy: 8 });

        // COURT (roomtype 2): pick_room selects, mkzoo sets rtype and needfill.
        room.rtype = OROOM;
        room.needfill = FILL_NONE;
        do_mkroom(COURT, state, { rn2: () => 0 });
        assert.equal(room.rtype, COURT);
        assert.equal(room.needfill, FILL_NORMAL);

        // BEEHIVE (roomtype 5): same pick_room path as COURT.
        room.rtype = OROOM;
        room.needfill = FILL_NONE;
        do_mkroom(BEEHIVE, state, { rn2: () => 0 });
        assert.equal(room.rtype, BEEHIVE);
        assert.equal(room.needfill, FILL_NORMAL);

        // MORGUE (roomtype 6): same pick_room path as COURT.
        room.rtype = OROOM;
        room.needfill = FILL_NONE;
        do_mkroom(MORGUE, state, { rn2: () => 0 });
        assert.equal(room.rtype, MORGUE);
        assert.equal(room.needfill, FILL_NORMAL);

        // BARRACKS (roomtype 7): the same pick_room path as MORGUE.
        room.rtype = OROOM;
        room.needfill = FILL_NONE;
        do_mkroom(BARRACKS, state, { rn2: () => 0 });
        assert.equal(room.rtype, BARRACKS);
        assert.equal(room.needfill, FILL_NORMAL);

        // Remaining zoo families and swamp are still refused (TEMPLE=10 is
        // now ported and omitted from this list).
        for (const roomtype of [3, 8, 11, 12, 13]) {
            assert.throws(
                () => do_mkroom(roomtype, state),
                UnsupportedSpecialRoomError,
                `roomtype ${roomtype}`,
            );
        }
    });

test('pick_room preserves strict stairs, wrap count, and source draw order',
    () => {
        const state = initializedState();
        const down = shopCandidate(state, { lx: 10, hx: 13 });
        const up = shopCandidate(state, { lx: 30, hx: 33 });
        const clear = shopCandidate(state, { lx: 50, hx: 53 });
        state.stairs = {
            sx: 11, sy: 6, up: false,
            next: { sx: 31, sy: 6, up: true, next: null },
        };

        let draws = [];
        assert.equal(pick_room(true, state, {
            rn2: (bound) => { draws.push(bound); return 0; },
        }), clear);
        assert.deepEqual(draws, [3]);

        draws = [];
        assert.equal(pick_room(false, state, {
            rn2: (bound) => {
                draws.push(bound);
                return 0;
            },
        }), down, 'rn2(3)==0 admits the down-stair room');
        assert.deepEqual(draws, [3, 3]);

        draws = [];
        assert.equal(pick_room(false, state, {
            rn2: (bound) => {
                draws.push(bound);
                return bound === 3 && draws.length === 2 ? 1 : 0;
            },
        }), clear, 'nonzero rn2(3) rejects down; up is unconditional');
        assert.deepEqual(draws, [3, 3]);

        state.stairs = null;
        for (const room of state.level.rooms) room.doorct = 0;
        draws = [];
        assert.equal(pick_room(false, state, {
            rn2: (bound) => {
                draws.push(bound);
                return bound === 3 ? 0 : 1;
            },
        }), null);
        assert.deepEqual(draws, [3, 5, 5, 5], 'exactly nroom candidates');

        down.hx = -1;
        clear.doorct = 1;
        assert.equal(pick_room(false, state, { rn2: () => 0 }), null,
            'the rooms[] terminator ends the search immediately');
        down.hx = 13;

        down.doorct = 0;
        state.wizard = true;
        draws = [];
        assert.equal(pick_room(false, state, {
            rn2: (bound) => { draws.push(bound); return bound === 5 ? 1 : 0; },
        }), down);
        assert.deepEqual(draws, [3, 5], 'wizard is after the rn2(5) draw');
        state.wizard = false;

        down.doorct = 1;
        draws = [];
        assert.equal(pick_room(false, state, {
            rn2: (bound) => { draws.push(bound); return 0; },
        }), down);
        assert.deepEqual(draws, [3], 'one door short-circuits rn2(5)');
        assert.equal(up.rtype, OROOM);

        const nonstrictState = initializedState();
        const downOnly = shopCandidate(nonstrictState, { hx: 13 });
        nonstrictState.stairs = {
            sx: 11, sy: 6, up: false, next: null,
        };
        do_mkroom(COURT, nonstrictState, { rn2: () => 0 });
        assert.equal(
            downOnly.rtype,
            COURT,
            'mkzoo calls the non-strict selector and admits rn2(3)==0',
        );
    });

test('D:5 courtmon uses strict source thresholds for each reachable class',
    () => {
        const state = initializedState();
        state.u.uz.dlevel = 5;
        state.u.ulevel = 5;
        state.dungeons = [{
            depth_start: 1,
            ledger_start: 0,
            num_dunlevs: 29,
            entry_lev: 1,
            dunlev_ureached: 5,
            flags: {},
        }];
        monst_globals_init(state);
        reset_mvitals(state);

        const cases = [
            [[15, 0], { mlet: S_KOBOLD }],
            [[16, 0], { mlet: S_GNOME }],
            [[30, 0], { mlet: S_GNOME }],
            [[31, 0], { pmidx: PM_HOBGOBLIN }],
            [[45, 0], { pmidx: PM_HOBGOBLIN }],
            [[46, 0], { pmidx: PM_BUGBEAR }],
            [[59, 1], { pmidx: PM_BUGBEAR }],
            [[59, 2], { mlet: S_ORC }],
        ];
        for (const [prefix, expected] of cases) {
            const values = [...prefix];
            const species = courtmon(state, {
                rn2: () => values.length ? values.shift() : 0,
                rnd: () => 1,
            });
            if (Object.hasOwn(expected, 'mlet')) {
                assert.equal(
                    species.mlet,
                    expected.mlet,
                    `sum ${prefix[0] + prefix[1]}`,
                );
            } else {
                assert.equal(
                    species.pmidx,
                    expected.pmidx,
                    `sum ${prefix[0] + prefix[1]}`,
                );
            }
        }
    });

test('squadmon follows its cumulative table and fallback draw', () => {
    // mkroom.c:809-837. At D:20, rnd(80 + level_difficulty()) is rnd(100),
    // so every cumulative boundary and the cpro==100 fallback is reachable.
    const state = initializedCourtState();
    state.u.uz.dlevel = 20;
    const cases = [
        [1, PM_SOLDIER],
        [80, PM_SERGEANT],
        [95, PM_LIEUTENANT],
        [99, PM_CAPTAIN],
    ];
    for (const [roll, expected] of cases) {
        let bound = null;
        const species = squadmon(state, {
            rnd: (limit) => { bound = limit; return roll; },
            rn2: () => { throw new Error('fallback draw was not expected'); },
        });
        assert.equal(bound, 100, `roll ${roll} bound`);
        assert.equal(species.pmidx, expected, `roll ${roll}`);
    }

    const fallbackDraws = [];
    const fallback = squadmon(state, {
        rnd: (limit) => { fallbackDraws.push(['rnd', limit]); return 100; },
        rn2: (limit) => {
            fallbackDraws.push(['rn2', limit]);
            return 2;
        },
    });
    assert.equal(fallback.pmidx, PM_LIEUTENANT);
    assert.deepEqual(fallbackDraws, [['rnd', 100], ['rn2', 4]]);

    state.mvitals[PM_SOLDIER].mvflags |= G_GONE;
    assert.equal(
        squadmon(state, { rnd: () => 1, rn2: () => 0 }),
        null,
        'a gone soldier type is not returned',
    );
});

test('Barracks fill populates soldiers, payroll, and the level flag', () => {
    // mkroom.c fill_zoo():344-361, 397-400, and 436-437. A 3x3 room with no
    // door has nine fillable cells; force every payroll roll to succeed and
    // rn2(3)==1 to select LARGE_BOX.
    const state = initializedCourtState();
    const room = shopCandidate(state, {
        lx: 10, ly: 5, hx: 12, hy: 7,
    });
    room.rtype = BARRACKS;
    room.doorct = 0;
    const random = {
        d: (count) => count,
        rn1: (_bound, base) => base,
        rn2(bound) {
            if (bound === 20) return 0;
            if (bound === 3) return 1;
            return 0;
        },
        rnd: () => 1,
        rne: () => 1,
        rnz: (value) => value,
    };
    fill_zoo(room, objectGenerationEnv({
        state,
        random,
        hooks: { populateContainer: () => {} },
    }));

    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            const monster = m_at(x, y, state);
            assert.ok(monster, `soldier at (${x},${y})`);
            assert.equal(monster.mnum, PM_SOLDIER);
            assert.equal(monster.msleeping, true);
        }
    }
    let payroll = 0;
    for (let obj = state.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === LARGE_BOX) payroll++;
    assert.equal(payroll, 9, 'one initialized payroll box per cell');
    assert.equal(state.level.flags.has_barracks, true);
});

test('Court fill geometry excludes exactly the door-facing boundary', () => {
    const state = initializedState();
    const room = shopCandidate(state, { lx: 10, ly: 5, hx: 13, hy: 8 });
    room.rtype = COURT;
    const orientations = [
        [{ x: 9, y: 6 }, [10, 8], [11, 8]],
        [{ x: 14, y: 6 }, [13, 5], [12, 5]],
        [{ x: 11, y: 4 }, [13, 5], [13, 6]],
        [{ x: 11, y: 9 }, [10, 8], [10, 7]],
    ];
    for (const [door, excluded, admitted] of orientations) {
        state.level.doors[0] = door;
        assert.equal(courtCellIsFillable(room, ...excluded, state), false);
        assert.equal(courtCellIsFillable(room, ...admitted, state), true);
    }
    state.level.doors[0] = { x: 9, y: 6 };
    state.level.at(11, 7).typ = 0;
    assert.equal(courtCellIsFillable(room, 11, 7, state), false);
    state.level.at(11, 7).typ = ROOM;
    room.doorct = 0;
    assert.equal(courtCellIsFillable(room, 10, 5, state), true);
});

test('D:5 Court ruler boundaries include the reachable roll-five upper edge',
    () => {
        for (const [roll, expected] of [
            [2, PM_GNOME_RULER],
            [3, PM_DWARF_RULER],
            [5, PM_DWARF_RULER],
        ]) {
            const state = initializedCourtState();
            const room = shopCandidate(state, {
                lx: 10, ly: 5, hx: 11, hy: 6,
            });
            room.rtype = COURT;
            room.doorct = 0;
            const random = courtFillRandom(roll);
            fill_zoo(room, objectGenerationEnv({
                state,
                random,
                hooks: { populateContainer: () => {} },
            }));

            const throne = [];
            for (let x = room.lx; x <= room.hx; ++x) {
                for (let y = room.ly; y <= room.hy; ++y) {
                    if (state.level.at(x, y).typ === THRONE) throne.push([x, y]);
                }
            }
            assert.equal(throne.length, 1, `roll ${roll} creates one throne`);
            assert.equal(
                m_at(throne[0][0], throne[0][1], state)?.mnum,
                expected,
                `ruler roll ${roll}`,
            );
        }
    });

test('Court fill forces peaceful subjects hostile and initializes coffers',
    () => {
        const state = initializedCourtState();
        state.urace.lovemask = M2_GNOME;
        const room = shopCandidate(state, {
            lx: 10, ly: 5, hx: 11, hy: 6,
        });
        room.rtype = COURT;
        room.doorct = 0;
        const random = courtFillRandom(2);
        fill_zoo(room, objectGenerationEnv({
            state,
            random,
            hooks: { populateContainer: () => {} },
        }));

        const subjects = [];
        for (let monster = state.level.monlist; monster; monster = monster.nmon) {
            if (monster.mnum !== PM_GNOME_RULER) subjects.push(monster);
        }
        assert.ok(subjects.length > 0, 'Court creates at least one subject');
        assert.ok(
            subjects.every((monster) => monster.mpeaceful === false),
            'co-aligned subjects are forced hostile',
        );

        let chest = null;
        for (let obj = state.level.objlist; obj; obj = obj.nobj) {
            if (obj.otyp === CHEST) chest = obj;
        }
        assert.ok(chest, 'Court creates its royal chest');
        assert.equal(chest.olocked, true, 'royal chest runs object initialization');
        assert.equal(state.level.flags.has_court, true);
    });

test('Court throne selection stops after exactly one hundred failed spots',
    () => {
        const state = initializedCourtState();
        const room = shopCandidate(state, {
            lx: 10, ly: 5, hx: 10, hy: 5,
        });
        room.rtype = COURT;
        room.doorct = 0;
        state.level.traps.push({ tx: room.lx, ty: room.ly, ttyp: 0 });

        const stop = new Error('stop after throne-selection retries');
        let coordinateDrawsAtRuler = null;
        const random = {
            rn1(_bound, base) {
                coordinateDrawsAtRuler = (coordinateDrawsAtRuler ?? 0) + 1;
                return base;
            },
            rn2: () => 0,
            rnd() {
                const draws = coordinateDrawsAtRuler;
                coordinateDrawsAtRuler = { draws };
                throw stop;
            },
        };
        assert.throws(
            () => fill_zoo(room, { state, random }),
            (error) => error === stop,
        );
        assert.equal(
            coordinateDrawsAtRuler.draws,
            100 * 101 * 2,
            '100 outer tries, each with somexyspace()\'s 101 candidates',
        );
    });

test('live D:5 Court fill pins population bounds, ruler, coffers, and flag',
    async () => {
        const segment = loadLevelTeleportArrivalRecipe().segments.find(
            ({ seed }) => seed === 7640011,
        );
        assert.ok(segment);
        await verifyLevelTeleportArrival(segment);
    });

// C ref: mkroom.c fill_zoo() lines 305-316, 350-353, 392-396, 448-449.
// A 3x3 BEEHIVE room (width 3, height 3) places its center at lx+1, ly+1.
// The queen bee goes at the center; killer bees fill the remaining eight
// cells. Royal jelly appears when !rn2(3) succeeds.

function beehiveFillRandom() {
    // A deterministic random source for beehive fill_zoo() tests. rn2(3)
    // controls jelly placement: returning 0 means !rn2(3) is true, so jelly
    // appears. Returning 1 means no jelly.
    return {
        d: (count) => count,
        rn1: (_bound, base) => base,
        rn2(bound) {
            // rn2(3) for jelly: return 0 so every cell gets jelly.
            if (bound === 3) return 0;
            return bound > 1 ? 1 : 0;
        },
        rnd: () => 1,
        rne: () => 1,
        rnz: (value) => value,
    };
}

test('Beehive fill places queen at center and killer bees elsewhere', () => {
    // A 3x3 room with no door gives nine fillable cells. C integer division
    // puts the center at lx + trunc(3/2) = lx+1, ly + trunc(3/2) = ly+1.
    const state = initializedCourtState();
    const room = shopCandidate(state, {
        lx: 10, ly: 5, hx: 12, hy: 7,
    });
    room.rtype = BEEHIVE;
    room.doorct = 0;
    const random = beehiveFillRandom();
    fill_zoo(room, objectGenerationEnv({
        state,
        random,
        hooks: { populateContainer: () => {} },
    }));

    // Check queen at center (11, 6), killer bees everywhere else.
    const queen = m_at(11, 6, state);
    assert.ok(queen, 'queen bee placed at room center');
    assert.equal(queen.mnum, PM_QUEEN_BEE, 'center monster is PM_QUEEN_BEE');
    for (let x = 10; x <= 12; ++x) {
        for (let y = 5; y <= 7; ++y) {
            if (x === 11 && y === 6) continue;
            const mon = m_at(x, y, state);
            assert.ok(mon, `killer bee at (${x},${y})`);
            assert.equal(
                mon.mnum, PM_KILLER_BEE,
                `non-center cell (${x},${y}) is PM_KILLER_BEE`,
            );
        }
    }
    assert.equal(state.level.flags.has_beehive, true, 'has_beehive flag set');
});

test('Beehive fill places royal jelly controlled by rn2(3)', () => {
    // rn2(3) returning 0 means !rn2(3) is true, so jelly appears.
    // rn2(3) returning nonzero means no jelly.
    const state = initializedCourtState();
    const room = shopCandidate(state, {
        lx: 10, ly: 5, hx: 12, hy: 7,
    });
    room.rtype = BEEHIVE;
    room.doorct = 0;
    const jellyPlaced = [];
    let jellyCheckCount = 0;
    const random = {
        d: (count) => count,
        rn1: (_bound, base) => base,
        rn2(bound) {
            // Track jelly rn2(3) calls: alternate between placing jelly (0)
            // and skipping it (1).
            if (bound === 3) {
                jellyCheckCount++;
                return (jellyCheckCount % 2 === 1) ? 0 : 1;
            }
            return bound > 1 ? 1 : 0;
        },
        rnd: () => 1,
        rne: () => 1,
        rnz: (value) => value,
    };
    fill_zoo(room, objectGenerationEnv({
        state,
        random,
        hooks: { populateContainer: () => {} },
    }));

    // Nine cells, nine rn2(3) checks. Odd-numbered checks place jelly,
    // even ones skip it. Count LUMP_OF_ROYAL_JELLY objects on the map.
    let jellyCount = 0;
    let someJelly = null;
    for (let obj = state.level.objlist; obj; obj = obj.nobj) {
        if (obj.otyp === LUMP_OF_ROYAL_JELLY) {
            jellyCount++;
            someJelly = obj;
        }
    }
    assert.equal(jellyCheckCount, 9, 'one rn2(3) call per cell');
    // Checks 1,3,5,7,9 return 0 => 5 cells get jelly.
    assert.equal(jellyCount, 5, 'jelly placed on 5 of 9 cells');
    // mksobj_at init=true sets weight through mksobj_init; init=false leaves
    // it at the default. C passes TRUE here.
    assert.ok(someJelly.owt > 0, 'jelly is fully initialized (init=true)');
});

test('Beehive center relocates when irregular room center is outside', () => {
    // An irregular room whose geometric center falls outside the room
    // boundary (wrong roomno or edge flag set) triggers somexyspace() to
    // find a valid position for the queen.
    const state = initializedCourtState();
    const room = shopCandidate(state, {
        lx: 10, ly: 5, hx: 14, hy: 9,
    });
    room.rtype = BEEHIVE;
    room.doorct = 0;
    room.irregular = true;

    // Geometric center: lx + trunc(5/2) = 12, ly + trunc(5/2) = 7.
    // Mark that cell as belonging to a different room so the irregular-room
    // check relocates the queen.
    const rmno = room.roomnoidx + ROOMOFFSET;
    for (let x = 10; x <= 14; ++x) {
        for (let y = 5; y <= 9; ++y) {
            state.level.at(x, y).roomno = rmno;
            state.level.at(x, y).edge = false;
        }
    }
    // Center cell is outside the room (wrong roomno).
    state.level.at(12, 7).roomno = rmno + 1;

    let somexyspaceCalled = false;
    const random = {
        d: (count) => count,
        rn1(bound, base) {
            // somexyspace -> somexy -> somex/somey call rn1. Return the
            // first valid non-center cell.
            somexyspaceCalled = true;
            return base;
        },
        rn2: () => 0,
        rnd: () => 1,
        rne: () => 1,
        rnz: (value) => value,
    };
    fill_zoo(room, objectGenerationEnv({
        state,
        random,
        hooks: { populateContainer: () => {} },
    }));

    assert.ok(somexyspaceCalled, 'somexyspace called to relocate queen');
    // The queen is no longer at the geometric center.
    const queenAtCenter = m_at(12, 7, state);
    const queenPresent = queenAtCenter?.mnum === PM_QUEEN_BEE;
    // Center cell had wrong roomno, so queen should not be there.
    assert.equal(queenPresent, false, 'queen not at invalid center');

    // Verify a queen bee exists somewhere in the room.
    let foundQueen = false;
    for (let monster = state.level.monlist; monster; monster = monster.nmon) {
        if (monster.mnum === PM_QUEEN_BEE) foundQueen = true;
    }
    assert.ok(foundQueen, 'queen bee placed somewhere in the room');
});

// Walk one Valkyrie from her up staircase to D:1's down staircase, descend,
// and read back the shop that makelevel() stocked on D:2. Every seed and walk
// passed here is a segment of scripts/run-shop-descent.mjs, which records the
// same inputs with the C reference program and compares every random number,
// screen cell and cursor; the state read back below is what those matching
// runs produced.
async function descendToShop(seed, walk) {
    await runSegment({
        seed,
        datetime: '20330607081011',
        nethackrc: [
            'OPTIONS=name:Shopper,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: `${walk}> `,
    }, {});
    const rooms = game.level.rooms.slice(0, game.level.nroom);
    const room = rooms.find((candidate) => candidate.rtype >= SHOPBASE);
    assert.ok(room, `seed ${seed} generated a shop`);

    const pack = [];
    for (let obj = room.resident.minvent; obj; obj = obj.nobj)
        pack.push(obj.otyp);

    const stock = [];
    const mimics = [];
    let stockedSquares = 0;
    for (let x = room.lx; x <= room.hx; ++x)
        for (let y = room.ly; y <= room.hy; ++y) {
            if (game.level.objects[x][y]) stockedSquares += 1;
            for (let obj = game.level.objects[x][y]; obj; obj = obj.nexthere)
                stock.push(obj);
            const monster = m_at(x, y);
            if (monster?.data?.mlet === S_MIMIC) mimics.push(monster);
        }

    return {
        index: room.rtype - SHOPBASE,
        shk: room.resident,
        keeper: room.resident.mextra.eshk.shknam,
        mimics,
        pack,
        stock,
        stockedSquares,
    };
}

// shknam.c nameshk():507-510 and 515, transcribed rather than read back
// from a run:
// every name list but shktools is indexed by this value, which the game
// derives from the keeper's m_id and the birthday without drawing.
function name_wanted(shk) {
    const nseed = Math.trunc(Math.trunc(game.ubirthday) / 257);
    const wanted = shk.m_id + ledger_no(game.u.uz, game)
        + (nseed % 13) - (nseed % 5);
    // C's `if (name_wanted < 0) name_wanted += (13 + 5)`.
    return wanted < 0 ? wanted + 18 : wanted;
}

test("a general store's keeper spends shkinit()'s rn2(5) on a charging scroll",
    async () => {
        // shknam.c shkinit():685-688. The `||` chain short-circuits, so a
        // general store reaches its own clause and no earlier one: shknms is
        // neither shktools nor shkwands, the shkrings test fails before its
        // rn2(2), and the shkgeneral test then spends one rn2(5) on whether
        // the keeper carries a scroll of charging.
        //
        // A change to the chain's short-circuit order moves the whole stream
        // after mkmonmoney() and shows up in the stock as well as in the
        // keeper's pack.
        const cases = [
            // rn2(5) came up non-zero: the keeper carries SCR_CHARGING (342).
            {
                seed: 7331075, walk: 'hhjjjnjjjj',
                inventory: [342, 438, 417, 307, 221, 417], stocked: 24,
            },
            // rn2(5) came up 0: no scroll of charging, and every later draw
            // in the shop moves with it.
            {
                seed: 7330791, walk: 'llllullllllllllllllljjll',
                inventory: [438, 417, 307, 308, 221], stocked: 16,
            },
        ];
        for (const { seed, walk, inventory, stocked } of cases) {
            const shop = await descendToShop(seed, walk);
            assert.equal(shop.index, GENERAL_STORE, `seed ${seed}`);
            assert.deepEqual(shop.pack, inventory, `seed ${seed} keeper pack`);
            // nameshk() indexes shkgeneral by name_wanted without drawing, so
            // the name follows from C's formula. It cannot be read off the
            // differential: eshk.shknam reaches neither the screen nor the
            // random-number stream, so a literal here would only repeat what
            // this port produced.
            assert.equal(
                shop.keeper,
                shkgeneral[name_wanted(shop.shk) % shkgeneral.length],
                `seed ${seed} name`,
            );
            assert.equal(shop.stockedSquares, stocked, `seed ${seed} stock`);
        }
    });

test("a hardware store's keeper is named by a draw, not by name_wanted",
    async () => {
        // shknam.c nameshk():518-520. shktools is the one list C indexes with
        // rn2(names_avail) instead of name_wanted, and the one whose keeper
        // therefore costs a random number. It also forces female to 0 whatever
        // name_wanted's low bit says.
        //
        // Both seeds are chosen so the drawn name differs from the name
        // name_wanted would have selected, which is what separates the arm
        // from the branch below it; the second seed's name_wanted is odd as
        // well, so its keeper would be female without the arm.
        for (const { seed, walk, oddNameWanted } of [
            { seed: 7372938, walk: 'ljjjjjjjjjjhb', oddNameWanted: false },
            { seed: 7380123, walk: 'kkllululuullll', oddNameWanted: true },
        ]) {
            const shop = await descendToShop(seed, walk);
            assert.equal(shop.index, TOOL_SHOP, `seed ${seed}`);
            assert.ok(
                shktools.includes(shop.keeper),
                `seed ${seed} keeper ${shop.keeper} is a shktools name`,
            );
            const wanted = name_wanted(shop.shk);
            assert.equal(
                Boolean(wanted & 1), oddNameWanted, `seed ${seed} name_wanted`,
            );
            assert.notEqual(
                shop.keeper, shktools[wanted % shktools.length],
                `seed ${seed} took the drawn name`,
            );
            assert.equal(shop.shk.female, false, `seed ${seed} female`);

            // shkinit()'s chain is true on its first clause here, so the
            // keeper gets the charging scroll with no rn2 at all, and never
            // the jewelers' touchstone.
            assert.ok(shop.pack.includes(SCR_CHARGING), `seed ${seed} scroll`);
            assert.ok(!shop.pack.includes(TOUCHSTONE), `seed ${seed} stone`);
        }
    });

test('the hardware store hands its draw straight to shktools', () => {
    // shknam.c nameshk():518-520 is `shname = shktools[rn2(names_avail)]`,
    // and it is the one selection in this function a recording cannot check:
    // the draw is in the random-number stream, the name it indexes never
    // leaves eshk.shknam, and the test above can only say that the drawn name
    // differs from the one name_wanted would have chosen. Calling nameshk()
    // with the draw fixed is what says which entry each value takes.
    //
    // m_id 8 on D:1 of dungeon 0, with ubirthday 0, puts name_wanted at
    // 8 + 1 + (0 % 13) - (0 % 5) = 9. It is odd, so shk->female starts true
    // and :519's `shk->female = 0` has something to clear; and shktools[9] is
    // "Hyeghu", which no case below expects, so a port that fell through to
    // the `name_wanted < names_avail` branch would answer it three times.
    const cases = [
        // The first entry. An index shifted up by one cannot produce it.
        [0, 'Ymla', false],
        // The one entry carrying a '-' prefix, which the test at the foot of
        // C's loop reads to put female back after :519 cleared it.
        [22, '-Zlaw', true],
        // The last entry. A bound of names_avail - 1 can never reach it.
        [39, 'Telloc Cyaj', false],
    ];
    for (const [drawn, expected, female] of cases) {
        const bounds = [];
        const shk = { m_id: 8, mextra: { eshk: { shknam: '' } } };
        const state = {
            ubirthday: 0,
            u: { uz: { dnum: 0, dlevel: 1 } },
            dungeons: [{ ledger_start: 0 }],
            level: { monlist: null },
        };
        nameshk(shk, shktools, {
            state,
            random: {
                rn2: (bound) => {
                    bounds.push(bound);
                    return drawn;
                },
            },
        });
        assert.equal(shk.mextra.eshk.shknam, expected, `draw ${drawn}`);
        assert.equal(shk.female, female, `draw ${drawn} female`);
        // One draw, over the whole list. No other list reaches this arm, and
        // the loop runs once because nothing on the level shares the name.
        assert.deepEqual(bounds, [shktools.length], `draw ${drawn} bound`);
    }
});

test("a jewelers' keeper gets a touchstone and spends rn2(2) on the scroll",
    async () => {
        // shknam.c shkinit():683-688. shkrings is the only list that reaches
        // the TOUCHSTONE arm, and the only one whose charging scroll is
        // conditional on a draw of its own.
        for (const { seed, walk, scroll } of [
            // rn2(2) came up non-zero.
            { seed: 7385612, walk: 'jhhhhhhhhhhhhh', scroll: true },
            // rn2(2) came up 0, and every later draw in the shop moves with it.
            { seed: 7360485, walk: 'bbhhhhbbbhhhhy', scroll: false },
        ]) {
            const shop = await descendToShop(seed, walk);
            assert.equal(shop.index, JEWELERS, `seed ${seed}`);
            assert.ok(shop.pack.includes(TOUCHSTONE), `seed ${seed} stone`);
            assert.equal(
                shop.pack.includes(SCR_CHARGING), scroll, `seed ${seed} scroll`,
            );
            // nameshk() indexes shkrings by name_wanted without drawing, so
            // the name follows from C's formula rather than from the stream.
            assert.equal(
                shop.keeper,
                shkrings[name_wanted(shop.shk) % shkrings.length],
                `seed ${seed} name`,
            );
        }
    });

test('each newly stocked shop type stocks only the classes its iprobs[] names',
    async () => {
        // shknam.c get_shop_item() walks the shop's iprobs[] and mkshobj_at()
        // passes the class it lands on to mkobj_at(). A row's stock therefore
        // cannot hold a class that row does not list, whatever the seed.
        const cases = [
            {
                seed: 7330325, walk: 'njjlnljjll', index: LIQUOR_EMPORIUM,
                classes: [POTION_CLASS], list: shkliquors, stocked: 6,
            },
            {
                seed: 7364483, walk: 'hhhhhhhhhhhhhhj', index: LIQUOR_EMPORIUM,
                classes: [POTION_CLASS], list: shkliquors, stocked: 12,
            },
            // 85% rings, 10% gems, 5% amulets: this room stocks all three.
            {
                seed: 7385612, walk: 'jhhhhhhhhhhhhh', index: JEWELERS,
                classes: [RING_CLASS, GEM_CLASS, AMULET_CLASS],
                list: shkrings, stocked: 24,
            },
            {
                seed: 7372938, walk: 'ljjjjjjjjjjhb', index: TOOL_SHOP,
                classes: [TOOL_CLASS], list: shktools, stocked: 32,
            },
            // 90% scrolls, 10% spellbooks. The tribute novel below is a
            // spellbook too, so this row's stock cannot separate the two
            // classes on its own; the seed after it stocks eleven scrolls and
            // no spellbook but the novel.
            {
                seed: 7500472, walk: 'llllnnlllln', index: SCROLL_SHOP,
                classes: [SCROLL_CLASS, SPBOOK_CLASS], list: shkbooks,
                stocked: 30,
            },
            {
                seed: 7500432, walk: 'lnjjjjjjjjn', index: SCROLL_SHOP,
                classes: [SCROLL_CLASS, SPBOOK_CLASS], list: shkbooks,
                stocked: 12,
            },
            // Rare books mirrors the row above: 90% spellbooks, 10% scrolls.
            // Both rows name shkbooks, so the keeper's name cannot tell them
            // apart and the stock is the only thing that does.
            {
                seed: 7510158, walk: 'hyhhjjbjjjbjbjhhhhhhhh', index: BOOKSTORE,
                classes: [SCROLL_CLASS, SPBOOK_CLASS], list: shkbooks,
                stocked: 15,
            },
            {
                seed: 7521343, walk: 'llkkkkkkuuukkkllkuu', index: BOOKSTORE,
                classes: [SPBOOK_CLASS], list: shkbooks, stocked: 8,
            },
        ];
        for (const { seed, walk, index, classes, list, stocked } of cases) {
            const shop = await descendToShop(seed, walk);
            assert.equal(shop.index, index, `seed ${seed}`);
            assert.equal(shop.stockedSquares, stocked, `seed ${seed} stock`);
            for (const obj of shop.stock) {
                assert.ok(
                    classes.includes(obj.oclass),
                    `seed ${seed}: otyp ${obj.otyp} has class ${obj.oclass}`,
                );
            }
            // The keeper's name comes from the row's own list, which is what
            // ties the stocked row to the name list shkinit() branched on.
            assert.ok(list.includes(shop.keeper), `seed ${seed} name list`);
        }
        // The jewelers above is the one case that has to reach all three of
        // its classes for the assertion loop to mean anything.
        const jewelers = await descendToShop(7385612, 'jhhhhhhhhhhhhh');
        assert.deepEqual(
            [...new Set(jewelers.stock.map((obj) => obj.oclass))].sort(),
            [RING_CLASS, AMULET_CLASS, GEM_CLASS].sort(),
        );
    });

// The two rows that share shkbooks, and the tribute novel only they stock.
// Each seed and walk below is a segment of scripts/run-shop-books.mjs, which
// records the same inputs with the C reference program and matches every
// random number the stocking draws.
//
// The map does not corroborate the counts. The hero arrives on D:2's upstairs
// and stops there, and none of these four shops holds a square the recorded
// screen draws, so the differential pins the stream that chose each object and
// not the glyph it became. The counts below are this port's reading of that
// shared stream. The novel's title stands on the same footing: it never
// reaches the screen either, and what the recording holds is the rn2(41) that
// do_name.c noveltitle() draws for it.
const BOOKSHOP_CASES = [
    // shtypes[2], the second-hand bookstore: 90% SCROLL_CLASS, 10%
    // SPBOOK_CLASS. Twenty-six scrolls and three spellbooks.
    { seed: 7500472, walk: 'llllnnlllln', index: SCROLL_SHOP, scrolls: 26, books: 3 },
    // The same row where the 10% pair never came up.
    { seed: 7500432, walk: 'lnjjjjjjjjn', index: SCROLL_SHOP, scrolls: 11, books: 0 },
    // shtypes[9], rare books: the same two classes with the shares reversed,
    // so a port that read either row's iprobs[] for both fails on one pair.
    { seed: 7510158, walk: 'hyhhjjbjjjbjbjhhhhhhhh', index: BOOKSTORE, scrolls: 2, books: 12 },
    { seed: 7521343, walk: 'llkkkkkkuuukkkllkuu', index: BOOKSTORE, scrolls: 0, books: 7 },
];

test('each bookstore row stocks its own iprobs[] shares', async () => {
    for (const { seed, walk, index, scrolls, books } of BOOKSHOP_CASES) {
        const shop = await descendToShop(seed, walk);
        assert.equal(shop.index, index, `seed ${seed} row`);
        const stocked = shop.stock.filter((obj) => obj.otyp !== SPE_NOVEL);
        assert.equal(
            stocked.filter((obj) => obj.oclass === SCROLL_CLASS).length,
            scrolls,
            `seed ${seed} scrolls`,
        );
        assert.equal(
            stocked.filter((obj) => obj.oclass === SPBOOK_CLASS).length,
            books,
            `seed ${seed} spellbooks`,
        );
        assert.equal(stocked.length, scrolls + books, `seed ${seed} stock`);
    }
});

test('the 3.6 tribute puts one novel in a bookstore and nothing elsewhere',
    async () => {
        // shknam.c mkshobj_at():461-468. stock_room() singles out one stocked
        // square with rnd(stockcount) whenever svc.context.tribute.enabled is
        // set and bookstock is clear, which is every fresh game; mkshobj_at()
        // then stocks that square with a novel only when the shop's name is
        // one of the two bookstores.
        for (const { seed, walk } of BOOKSHOP_CASES) {
            const shop = await descendToShop(seed, walk);
            const novels = shop.stock.filter((obj) => obj.otyp === SPE_NOVEL);
            assert.equal(novels.length, 1, `seed ${seed} novel count`);
            assert.ok(
                SIR_TERRY_NOVELS.includes(novels[0].oextra?.oname),
                `seed ${seed} title ${novels[0].oextra?.oname}`,
            );
            assert.equal(game.context.tribute.bookstock, true, `seed ${seed}`);
        }

        // A general store's stocking reaches the same singled-out square and
        // stocks it normally, so the name test is what keeps the novel out.
        // Seed 7331075 is the first segment of scripts/run-shop-descent.mjs.
        const general = await descendToShop(7331075, 'hhjjjnjjjj');
        assert.equal(general.index, GENERAL_STORE);
        assert.equal(
            general.stock.filter((obj) => obj.otyp === SPE_NOVEL).length,
            0,
        );
        assert.ok(!game.context.tribute.bookstock);
    });

test('the room search ends on the rooms[] terminator and on nothing else',
    () => {
        // mkroom.c:159-160. C walks svr.rooms[] without an index bound and
        // stops on the entry whose hx is -1, so the sentinel is a negative hx
        // rather than any falsy or zero one. A room at hx 0 is off the
        // playable map but is not the terminator, and the search has to walk
        // past it to the next room.
        const terminated = initializedState();
        const afterTerminator = shopCandidate(terminated, { hx: 13, hy: 8 });
        terminated.level.rooms.unshift({
            lx: 1, ly: 1, hx: -1, hy: 1, rtype: OROOM, rlit: 1,
            doorct: 1, fdoor: 0, roomnoidx: 1, needfill: FILL_NONE,
            irregular: false, nsubrooms: 0, sbrooms: [],
        });
        terminated.level.nroom = terminated.level.rooms.length;
        const afterRoll = oneRoll(1);
        do_mkroom(SHOPBASE, terminated, afterRoll.random);
        assert.equal(afterRoll.drawn(), 0);
        assert.equal(afterTerminator.rtype, OROOM);

        const zeroWidth = initializedState();
        const reached = shopCandidate(zeroWidth, { hx: 13, hy: 8 });
        zeroWidth.level.rooms.unshift({
            lx: 0, ly: 1, hx: 0, hy: 1, rtype: OROOM, rlit: 1,
            // No door, so this room is rejected for its door count rather than
            // becoming the shop itself.
            doorct: 0, fdoor: 0, roomnoidx: 1, needfill: FILL_NONE,
            irregular: false, nsubrooms: 0, sbrooms: [],
        });
        zeroWidth.level.nroom = zeroWidth.level.rooms.length;
        do_mkroom(SHOPBASE, zeroWidth, oneRoll(1).random);
        assert.equal(reached.rtype, SHOPBASE + GENERAL_STORE);
    });

test('topologize leaves a room the level does not own alone', () => {
    // mklev.c topologize() derives its room number from the room's index in
    // svr.rooms[]. The port carries that index on the room as roomnoidx, and a
    // room that has none would write ROOMOFFSET - 1 over the map, so the guard
    // returns before the first loop. A level with no map returns there too.
    const state = initializedState();
    const room = shopCandidate(state, { hx: 13, hy: 8 });
    room.roomnoidx = -1;
    do_mkroom(SHOPBASE, state, oneRoll(1).random);
    assert.equal(state.level.at(room.lx, room.ly).roomno, 0);
    assert.equal(state.level.at(room.lx - 1, room.ly - 1).edge, false);
    // The roll and the marks either side of topologize() still happen, which
    // is what shows the guard returned rather than the caller skipping it.
    assert.equal(room.rtype, SHOPBASE + GENERAL_STORE);
    assert.equal(room.needfill, FILL_NORMAL);
});

test('a shop mimic is disguised by the arm its own depth selects', async () => {
    // makemon.c set_mimic_sym():2467-2486, reached through shknam.c
    // mkshobj_at(), which turns a stocked square into a mimic on
    // rn2(100) < depth(). Both seeds are segments of
    // scripts/run-shop-mimic.mjs, which records the whole descent against C.
    //
    // `rn2(10) >= depth(&u.uz)` takes S_MIMIC_DEF, and assign_sym answers that
    // with STRANGE_OBJECT.
    const strange = await descendToShop(7412011, 'jnnnjjjhjjhb');
    assert.equal(strange.index, GENERAL_STORE);
    assert.equal(strange.mimics.length, 1);
    assert.equal(strange.mimics[0].m_ap_type, M_AP_OBJECT);
    assert.equal(strange.mimics[0].mappearance, STRANGE_OBJECT);

    // Below the depth the mimic takes get_shop_item() instead, so its disguise
    // comes from the room's own iprobs[]. shtypes[1] lists ARMOR_CLASS and
    // WEAPON_CLASS and nothing else, and neither is the strange object's
    // ILLOBJ_CLASS, so a port that ignored the first draw would fail here.
    const stocked = await descendToShop(7412050, 'yhhkkkkkkkkkkhhhhhhhhhhhhb');
    assert.equal(stocked.index, ARMOR_SHOP);
    assert.equal(stocked.mimics.length, 1);
    assert.equal(stocked.mimics[0].m_ap_type, M_AP_OBJECT);
    assert.ok(
        [ARMOR_CLASS, WEAPON_CLASS].includes(
            game.objects[stocked.mimics[0].mappearance].oc_class,
        ),
        `mimic otyp ${stocked.mimics[0].mappearance}`,
    );
});

// The three rows whose stock is not one object class per iprobs[] entry. Each
// seed and walk below is a segment of scripts/run-shop-deli-wand-health.mjs,
// which records the same inputs with the C reference program and matches every
// random number the stocking draws. As in the bookstore block above, the map
// does not corroborate the object types: the hero stops on D:2's upstairs and
// the recorded screen draws none of the shop's stocked squares.
const DELICATESSEN = 5;
const HEALTH_FOOD_STORE = 10;

test('a negated iprobs[] itype stocks that object type and no other', async () => {
    // shknam.c mkshobj_at():481-482. `atype < 0` reaches mksobj_at(-atype),
    // which makes exactly the object the row names, where a non-negative
    // atype reaches mkobj_at() and draws within a class.
    //
    // The delicatessen names four: -POT_FRUIT_JUICE, -POT_BOOZE, -POT_WATER
    // and -ICE_BOX. This shop reaches all four in fifteen squares, so every
    // non-FOOD_CLASS object it holds has to be one of them.
    const deli = await descendToShop(7600129, 'kkkklkkkkkkkhhj');
    assert.equal(deli.index, DELICATESSEN);
    const negated = [POT_FRUIT_JUICE, POT_BOOZE, POT_WATER, ICE_BOX];
    for (const obj of deli.stock) {
        assert.ok(
            obj.oclass === FOOD_CLASS || negated.includes(obj.otyp),
            `otyp ${obj.otyp} class ${obj.oclass}`,
        );
    }
    assert.deepEqual(
        negated.map(
            (otyp) => deli.stock.filter((obj) => obj.otyp === otyp).length,
        ),
        // One fruit juice, one booze, two waters and one ice box.
        [1, 1, 2, 1],
    );

    // The wand shop names two, -LEATHER_GLOVES and -ELVEN_CLOAK, and both are
    // ARMOR_CLASS. A port that passed the negated value to mkobj_at() would
    // draw some other armor from the same stream.
    const wands = await descendToShop(7604357, 'llnnjjhjjjjnlnn');
    assert.equal(wands.index, WAND_SHOP);
    for (const obj of wands.stock) {
        assert.ok(
            obj.oclass === WAND_CLASS
            || [LEATHER_GLOVES, ELVEN_CLOAK].includes(obj.otyp),
            `otyp ${obj.otyp} class ${obj.oclass}`,
        );
    }
    assert.equal(
        wands.stock.filter((obj) => obj.otyp === LEATHER_GLOVES).length, 1,
    );
    assert.equal(
        wands.stock.filter((obj) => obj.otyp === ELVEN_CLOAK).length, 1,
    );
});

test('a health food store stocks only vegetarian food and its own potions',
    async () => {
        // shknam.c mkshobj_at():480 sends VEGETARIAN_CLASS to mkveggy_at(),
        // whose shkveg() admits a food type only when veggy_item() does. Every
        // FOOD_CLASS object in the shop below therefore has to pass that test,
        // and no tripe ration, meatball or other FLESH food may appear.
        const shop = await descendToShop(7605798, 'llllllllllllllln');
        assert.equal(shop.index, HEALTH_FOOD_STORE);
        const negated = [
            POT_FRUIT_JUICE, POT_HEALING, POT_FULL_HEALING,
            SCR_FOOD_DETECTION, LUMP_OF_ROYAL_JELLY,
        ];
        for (const obj of shop.stock) {
            if (negated.includes(obj.otyp)) continue;
            assert.equal(obj.oclass, FOOD_CLASS, `otyp ${obj.otyp}`);
            assert.ok(
                veggy_item(null, obj.otyp, game),
                `otyp ${obj.otyp} is not vegetarian`,
            );
        }

        // shknam.c mkveggy_at():452-453. Every tin the shop stocks is forced
        // through set_tin_variety(obj, HEALTHY_TIN), which either empties the
        // tin and marks it spinach (spe 1, corpsenm NON_PM) or keeps a
        // vegetarian corpsenm and encodes a variety as a negative spe. This
        // shop holds both, which is what separates the two exits.
        // Only a tin is forced. C guards the call with `obj->otyp == TIN`,
        // and every other food the shop stocks keeps the spe mksobj() gave it,
        // which is 0 for all of them but the slime mold. set_tin_variety()
        // would write the spinach marker over each one.
        const unforced = shop.stock.filter(
            (obj) => obj.oclass === FOOD_CLASS
                && obj.otyp !== TIN && obj.otyp !== SLIME_MOLD,
        );
        assert.ok(unforced.length > 20, `only ${unforced.length} plain foods`);
        for (const obj of unforced)
            assert.equal(obj.spe, 0, `otyp ${obj.otyp} spe`);
        // The slime mold keeps svc.context.current_fruit instead.
        const molds = shop.stock.filter((obj) => obj.otyp === SLIME_MOLD);
        assert.ok(molds.length > 0, 'the shop stocks a slime mold');
        for (const mold of molds)
            assert.equal(mold.spe, game.context.current_fruit);

        const tins = shop.stock.filter((obj) => obj.otyp === TIN);
        assert.equal(tins.length, 4);
        const spinach = tins.filter((obj) => obj.spe === 1);
        assert.equal(spinach.length, 2);
        for (const tin of spinach) assert.equal(tin.corpsenm, NON_PM);
        for (const tin of tins.filter((obj) => obj.spe !== 1)) {
            assert.ok(tin.spe < 0, `tin spe ${tin.spe}`);
            assert.equal(tin.corpsenm, PM_LICHEN);
        }
    });

// veggy_item() and shkveg() read objects[] and svb.bases[], so these two
// tests build their own initialized catalog rather than inheriting whichever
// game the descent tests above left behind.
function catalogState() {
    const state = initializedState();
    init_objects(state, () => 0);
    monst_globals_init(state);
    return state;
}

test('veggy_item admits a food type on material, egg, tin or corpse', () => {
    const state = catalogState();
    // shknam.c veggy_item():358-374 with a null obj. The type form stands
    // PM_LICHEN in for the corpse species, so a tin and a corpse of unknown
    // contents both come back vegetarian, and the VEGGY material or EGG does
    // the rest. Every otyp below is read from objects.c's FOOD entries.
    for (const otyp of [
        APPLE, // VEGGY
        LUMP_OF_ROYAL_JELLY, // VEGGY
        EGG, // FLESH, admitted by name
        TIN, // METAL, admitted through the lichen standin
        CORPSE, // FLESH, admitted through the lichen standin
    ]) {
        assert.ok(veggy_item(null, otyp, state), `otyp ${otyp}`);
    }
    for (const otyp of [
        TRIPE_RATION, // FLESH
        MEATBALL, // FLESH
        POT_FRUIT_JUICE, // not FOOD_CLASS at all
    ]) {
        assert.ok(!veggy_item(null, otyp, state), `otyp ${otyp}`);
    }

    // The object form reads the tin's own contents instead. spe 1 is spinach
    // and spe 0 an empty tin, and only the first is food.
    assert.ok(veggy_item(
        { otyp: TIN, oclass: FOOD_CLASS, corpsenm: NON_PM, spe: 1 },
        0, state,
    ));
    assert.ok(!veggy_item(
        { otyp: TIN, oclass: FOOD_CLASS, corpsenm: NON_PM, spe: 0 },
        0, state,
    ));
    // A tin of a named species follows that species' own diet: a lichen is
    // vegetarian and a jackal is not.
    assert.ok(veggy_item(
        { otyp: TIN, oclass: FOOD_CLASS, corpsenm: PM_LICHEN, spe: 0 },
        0, state,
    ));
    assert.ok(!veggy_item(
        { otyp: CORPSE, oclass: FOOD_CLASS, corpsenm: PM_JACKAL, spe: 0 },
        0, state,
    ));
});

test('ismnum bounds a species index at both ends', () => {
    // monst.h:285 is `#define ismnum(x) ((x) >= LOW_PM && (x) < NUMMONS)`.
    // permonst.h:15 makes LOW_PM `NON_PM + 1`, which is 0, and NUMMONS is the
    // count monsters.c generates, so the admitted range is 0 to NUMMONS - 1.
    assert.equal(ismnum(LOW_PM), true);
    assert.equal(ismnum(LOW_PM - 1), false);
    assert.equal(ismnum(NUMMONS - 1), true);
    assert.equal(ismnum(NUMMONS), false);

    // The upper bound through a live caller. shknam.c:402 is
    // `ismnum(corpsenm) && vegetarian(&mons[corpsenm])`, so a corpse whose
    // species index is out of range must answer FALSE without reading mons[].
    // The index is NUMMONS + 1 rather than NUMMONS because monsters.c ends
    // mons[] with C's zeroed terminator row, which the port carries too, so a
    // read at exactly NUMMONS lands on it and answers FALSE either way. One
    // past that is where the array truly ends.
    const state = catalogState();
    assert.equal(
        veggy_item(
            { otyp: CORPSE, oclass: FOOD_CLASS, corpsenm: NUMMONS + 1, spe: 0 },
            0, state,
        ),
        false,
    );
});

test('shkveg walks the vegetarian foods weighted by oc_prob', () => {
    const state = catalogState();
    // shknam.c shkveg():377-405. The admitted types run in objects.c order
    // from CORPSE to TIN, and their oc_prob column totals 860, which is the
    // bound of the single rnd() the function spends. Each boundary below is
    // the last roll that stops on one type and the first that carries into the
    // next, computed from that column: EGG 85, KELP_FROND 0, EUCALYPTUS_LEAF
    // 3, ... CRAM_RATION 20 (cumulative 405), FOOD_RATION 380 (785), then
    // K_RATION and C_RATION at 0 each, and TIN 75 (860).
    //
    // CORPSE leads the list with oc_prob 0, so the loop's first subtraction
    // never stops there; a port that stopped on a zero-probability entry would
    // stock corpses.
    const boundaries = [
        [1, EGG], [85, EGG],
        [86, EUCALYPTUS_LEAF], [88, EUCALYPTUS_LEAF],
        [89, APPLE],
        [405, CRAM_RATION], [406, FOOD_RATION], [785, FOOD_RATION],
        [786, TIN], [860, TIN],
    ];
    for (const [roll, expected] of boundaries) {
        let bound = null;
        const otyp = shkveg({
            state,
            random: { rnd: (limit) => { bound = limit; return roll; } },
        });
        assert.equal(bound, 860, `roll ${roll} bound`);
        assert.equal(otyp, expected, `roll ${roll}`);
    }

    // shknam.c:392-393 panics when the admitted shares total less than one,
    // because rnd(0) has no answer. A catalog whose whole vegetarian weight is
    // one food of oc_prob 1 is the largest that still passes the guard, which
    // is what fixes the threshold at 1 rather than at 2.
    const bare = catalogState();
    for (let otyp = bare.svb.bases[FOOD_CLASS]; otyp < NUM_OBJECTS; ++otyp) {
        if (bare.objects[otyp].oc_class !== FOOD_CLASS) break;
        bare.objects[otyp].oc_prob = otyp === APPLE ? 1 : 0;
    }
    assert.equal(
        shkveg({ state: bare, random: { rnd: () => 1 } }),
        APPLE,
    );
    bare.objects[APPLE].oc_prob = 0;
    assert.throws(
        () => shkveg({ state: bare, random: { rnd: () => 1 } }),
        /shkveg no veggy objects/u,
    );
});
