// Tests for the shknam.c shtypes[] table this port rolls shops against, and
// for the boundary a special room it cannot build raises. Every expected value
// below was read from nethack-c/upstream/src/shknam.c:206-350, not from a
// recorded session.

import assert from 'node:assert/strict';
import test from 'node:test';

import { FILL_NONE, OROOM, ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { resetGame } from '../js/gstate.js';
import { UnsupportedSpecialRoomError } from '../js/mkroom.js';
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
const SCROLL_SHOP = 2;
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
// door that invalid_shop_shape() accepts it.
function shopCandidate(state, { lx = 10, ly = 5, hx = 14, hy = 8 } = {}) {
    for (let x = lx; x <= hx; ++x)
        for (let y = ly; y <= hy; ++y) state.level.at(x, y).typ = ROOM;
    state.level.doors = [{ x: lx - 1, y: ly }];
    const room = {
        lx, ly, hx, hy, rtype: OROOM, rlit: 1, doorct: 1, fdoor: 0,
        roomnoidx: state.level.nroom, needfill: FILL_NONE, irregular: false,
        nsubrooms: 0, sbrooms: [],
    };
    state.level.rooms.push(room);
    state.level.nroom = state.level.rooms.length;
    return room;
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

test('a refused shop type ends the segment and keeps every screen before it',
    async () => {
        // The instrument this matters for is scripts/scan-debt.mjs, which
        // reads a session's whole recorded input and needs every fail-closed
        // stop to end its segment rather than escape runSegment() as a crash.
        // Today every shop type stops js/mkroom.js mkshop().
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
        // Eleven screens: one per walked step plus the `--More--` the descent
        // stops on. The stop happens while D:2 is being generated, so the map
        // after it is never drawn.
        assert.equal(segment.getScreens().length, 11);
    });
