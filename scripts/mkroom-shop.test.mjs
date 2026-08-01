// Tests for mkroom.c mkshop()'s tail and the shknam.c shtypes[] table it
// rolls against. Every expected value below was read from
// nethack-c/upstream/src/mkroom.c:179-215 and
// nethack-c/upstream/src/shknam.c:206-350, not from a recorded session.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FILL_NONE,
    FILL_NORMAL,
    OROOM,
    ROOM,
    ROOMOFFSET,
    SHOPBASE,
    VAULT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { game, resetGame } from '../js/gstate.js';
import { UnsupportedSpecialRoomError, do_mkroom } from '../js/mkroom.js';
import {
    ARMOR_CLASS,
    RANDOM_CLASS,
    SPBOOK_CLASS,
    WAND_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import {
    SHTYPES,
    shkarmors,
    shkbooks,
    shkgeneral,
    shkweapons,
} from '../js/shtypes_data.js';
import { stock_room } from '../js/shknam.js';

// shknam.c shtypes[] in source order. mkroom.c stores the index as
// rtype - SHOPBASE, so these are also the rtype offsets mkroom.h's
// ARMORSHOP..CANDLESHOP enumerate.
const GENERAL_STORE = 0;
const ARMOR_SHOP = 1;
const SCROLL_SHOP = 2;
const WEAPON_SHOP = 4;
const WAND_SHOP = 7;
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
            // A four-by-five room: isbig() is false at twenty squares, so the
            // wand and spellbook override cannot rewrite the rolled type.
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

test('stock_room refuses a shop type this port cannot stock', () => {
    // The nine rows outside SUPPORTED_SHOPS end the segment rather than
    // stocking the wrong objects. UnsupportedSpecialRoomError is the class
    // js/jsmain.js treats as a clean segment boundary.
    const state = initializedState();
    const room = shopCandidate(state, { hx: 13, hy: 8 });
    for (const index of [2, 3, 5, 6, 7, 8, 9, 10, 11]) {
        assert.throws(
            () => stock_room(index, room, { state }),
            (error) => error instanceof UnsupportedSpecialRoomError
                && error.message.includes(SHTYPES[index].name),
            `shtypes[${index}]`,
        );
    }
    // A row outside the table is a programming error rather than a boundary.
    assert.throws(() => stock_room(12, room, { state }), RangeError);
});

test('do_mkroom refuses every non-shop special room', () => {
    // mkroom.c do_mkroom() dispatches ten other room types to mkzoo(),
    // mkswamp() and mktemple(), none of which is ported.
    const state = initializedState();
    for (const roomtype of [2, 3, 5, 6, 7, 8, 10, 11, 12, 13]) {
        assert.throws(
            () => do_mkroom(roomtype, state),
            UnsupportedSpecialRoomError,
            `roomtype ${roomtype}`,
        );
    }
});

test('a refused shop type ends the segment and keeps every screen before it',
    async () => {
        // The instrument this matters for is scripts/scan-debt.mjs, which
        // reads a session's whole recorded input and needs every fail-closed
        // stop to end its segment rather than escape runSegment() as a crash.
        // A liquor emporium is one of the nine rows SUPPORTED_SHOPS refuses.
        //
        // Seed 7330325 and this walk were found by breadth-first search over
        // the generated D:1 map: ten steps to the down staircase, then `>` and
        // the space that dismisses the arrival's `--More--`.
        let boundary = null;
        const segment = await runSegment({
            seed: 7330325,
            datetime: '20330607081011',
            nethackrc: [
                'OPTIONS=name:Shopper,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,!autopickup',
                '',
            ].join('\n'),
            moves: 'njjlnljjll> ',
        }, { onBoundary: (error) => { boundary = error; } });

        assert.ok(
            boundary instanceof UnsupportedSpecialRoomError,
            `boundary was ${boundary?.name ?? 'absent'}`,
        );
        assert.match(boundary.message, /liquor emporium/u);
        // Eleven screens: one per walked step plus the `--More--` the descent
        // stops on. The stop happens while D:2 is being generated, so the map
        // after it is never drawn.
        assert.equal(segment.getScreens().length, 11);
    });

test("a general store's keeper spends shkinit()'s rn2(5) on a charging scroll",
    async () => {
        // shknam.c shkinit():684-687. The `||` chain short-circuits, so a
        // general store is the only shop this port stocks that reaches a draw
        // there: shknms is neither shktools nor shkwands, the shkrings test
        // fails before its rn2(2), and the shkgeneral test then spends one
        // rn2(5) on whether the keeper carries a scroll of charging.
        //
        // Both segments below are in scripts/run-shop-descent.mjs, which
        // records them with the C reference program and compares every random
        // number, screen cell and cursor. The state pinned here is what that
        // matching run produced; a change to the chain's short-circuit order
        // moves the whole stream after mkmonmoney() and shows up in the stock
        // as well as in the keeper's pack.
        const cases = [
            // rn2(5) came up non-zero: the keeper carries SCR_CHARGING (342).
            {
                seed: 7331075, walk: 'hhjjjnjjjj', keeper: 'Akranes',
                inventory: [342, 438, 417, 307, 221, 417], stocked: 24,
            },
            // rn2(5) came up 0: no scroll of charging, and every later draw
            // in the shop moves with it.
            {
                seed: 7330791, walk: 'llllullllllllllllllljjll',
                keeper: 'Akureyri',
                inventory: [438, 417, 307, 308, 221], stocked: 16,
            },
        ];
        for (const { seed, walk, keeper, inventory, stocked } of cases) {
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
            const shop = rooms.find((room) => room.rtype >= SHOPBASE);
            assert.ok(shop, `seed ${seed} generated a shop`);
            assert.equal(shop.rtype - SHOPBASE, GENERAL_STORE, `seed ${seed}`);

            const pack = [];
            for (let obj = shop.resident.minvent; obj; obj = obj.nobj)
                pack.push(obj.otyp);
            assert.deepEqual(pack, inventory, `seed ${seed} keeper pack`);
            assert.equal(
                shop.resident.mextra.eshk.shknam, keeper, `seed ${seed} name`,
            );

            let stockedSquares = 0;
            for (let x = shop.lx; x <= shop.hx; ++x)
                for (let y = shop.ly; y <= shop.hy; ++y)
                    if (game.level.objects[x][y]) stockedSquares += 1;
            assert.equal(stockedSquares, stocked, `seed ${seed} stock`);
        }
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
