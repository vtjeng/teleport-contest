// Pin item_on_ice, a pure function from mkobj.c (lines 1443-1472) that
// determines whether an object (or its outermost container) sits on or is
// buried under ice.
//
// Expected values come from reading mkobj.c and the obj_on_ice enum
// (lines 1434-1441), not from running the port. The function walks up the
// container chain with while (otmp->where == OBJ_CONTAINED), then calls
// get_obj_location with BURIED_TOO, and checks is_ice at the result.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    item_on_ice,
    NOT_ON_ICE,
    SET_ON_ICE,
    BURIED_UNDER_ICE,
} from '../js/obj.js';

// ICE terrain type from rm.h / const.js.
const ICE = 33;
// ROOM terrain type, used as a non-ice surface.
const ROOM = 7;

// OBJ_FLOOR = 1, OBJ_BURIED = 6, OBJ_CONTAINED = 2 (from const.js).
const OBJ_FLOOR = 1;
const OBJ_BURIED = 6;
const OBJ_CONTAINED = 2;
const OBJ_INVENT = 3;

// Build a minimal state whose level.at(x, y) returns the terrain type
// stored in a map keyed by "x,y".
function makeState(terrainMap) {
    return {
        level: {
            at(x, y) {
                const key = `${x},${y}`;
                if (key in terrainMap)
                    return { typ: terrainMap[key] };
                return { typ: ROOM };
            },
        },
        u: { ux: 1, uy: 1 },
    };
}

// -- Floor object on ice: SET_ON_ICE ----------------------------------------
// C ref: mkobj.c:1455-1459. OBJ_FLOOR object at a tile with ICE terrain
// returns SET_ON_ICE (1).
test('item_on_ice: floor object on ice returns SET_ON_ICE', () => {
    const state = makeState({ '5,3': ICE });
    const obj = { where: OBJ_FLOOR, ox: 5, oy: 3 };
    assert.equal(item_on_ice(obj, state), SET_ON_ICE);
});

// -- Floor object not on ice: NOT_ON_ICE ------------------------------------
// C ref: mkobj.c:1455-1459. OBJ_FLOOR object at a non-ice tile falls through
// to the default return of NOT_ON_ICE (0).
test('item_on_ice: floor object not on ice returns NOT_ON_ICE', () => {
    const state = makeState({ '5,3': ROOM });
    const obj = { where: OBJ_FLOOR, ox: 5, oy: 3 };
    assert.equal(item_on_ice(obj, state), NOT_ON_ICE);
});

// -- Buried object under ice: BURIED_UNDER_ICE ------------------------------
// C ref: mkobj.c:1460-1464. OBJ_BURIED object at a tile with ICE terrain
// returns BURIED_UNDER_ICE (2).
test('item_on_ice: buried object under ice returns BURIED_UNDER_ICE', () => {
    const state = makeState({ '10,10': ICE });
    const obj = { where: OBJ_BURIED, ox: 10, oy: 10 };
    assert.equal(item_on_ice(obj, state), BURIED_UNDER_ICE);
});

// -- Buried object not under ice: NOT_ON_ICE --------------------------------
// C ref: mkobj.c:1460-1464. OBJ_BURIED at a non-ice tile falls through.
test('item_on_ice: buried object not under ice returns NOT_ON_ICE', () => {
    const state = makeState({ '10,10': ROOM });
    const obj = { where: OBJ_BURIED, ox: 10, oy: 10 };
    assert.equal(item_on_ice(obj, state), NOT_ON_ICE);
});

// -- Inventory object: NOT_ON_ICE -------------------------------------------
// C ref: mkobj.c:1465-1466 default case. An OBJ_INVENT object does not match
// OBJ_FLOOR or OBJ_BURIED, so the switch falls to default and returns
// NOT_ON_ICE regardless of the tile's terrain.
test('item_on_ice: inventory object returns NOT_ON_ICE even over ice', () => {
    const state = makeState({ '1,1': ICE });
    const obj = { where: OBJ_INVENT };
    assert.equal(item_on_ice(obj, state), NOT_ON_ICE);
});

// -- Contained object checks outermost container ----------------------------
// C ref: mkobj.c:1449-1451. The while loop walks up from the contained item
// to the outermost container and checks that container's location.
test('item_on_ice: contained object on ice via outermost container', () => {
    const state = makeState({ '7,8': ICE });
    const outerBox = { where: OBJ_FLOOR, ox: 7, oy: 8 };
    const innerItem = { where: OBJ_CONTAINED, ocontainer: outerBox };
    // The inner item is contained; the outer box sits on ice.
    assert.equal(item_on_ice(innerItem, state), SET_ON_ICE);
});

// -- Nested containment walks to outermost ----------------------------------
// C ref: mkobj.c:1449-1451. Two levels of nesting: the while loop finds the
// outermost container on a non-ice floor tile, so the result is NOT_ON_ICE.
test('item_on_ice: doubly nested contained object on non-ice floor', () => {
    const state = makeState({ '2,2': ROOM });
    const outerBox = { where: OBJ_FLOOR, ox: 2, oy: 2 };
    const innerBox = { where: OBJ_CONTAINED, ocontainer: outerBox };
    const item = { where: OBJ_CONTAINED, ocontainer: innerBox };
    assert.equal(item_on_ice(item, state), NOT_ON_ICE);
});

// -- Enum constants have the expected values --------------------------------
// C ref: mkobj.c:1434-1441 obj_on_ice enum.
test('item_on_ice enum constants match C values', () => {
    assert.equal(NOT_ON_ICE, 0);
    assert.equal(SET_ON_ICE, 1);
    assert.equal(BURIED_UNDER_ICE, 2);
});
