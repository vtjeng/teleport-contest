// Pin where_name(), a pure diagnostic function from mkobj.c (lines 3296-3311)
// that returns a human-readable name for an object's location state.
// Expected values come from the C source's obj_state_names[] array
// (mkobj.c lines 3289-3293).

import assert from 'node:assert/strict';
import test from 'node:test';

import { where_name } from '../js/obj.js';
import {
    OBJ_FREE,
    OBJ_FLOOR,
    OBJ_CONTAINED,
    OBJ_INVENT,
    OBJ_MINVENT,
    OBJ_MIGRATING,
    OBJ_BURIED,
    OBJ_ONBILL,
    OBJ_LUAFREE,
    OBJ_DELETED,
} from '../js/const.js';

// -- Each valid obj_state_names[] entry returns its C string ------------------
// C: obj_state_names[] = { "free", "floor", "contained", "invent",
//     "minvent", "migrating", "buried", "onbill", "luafree", "deleted" };

test('where_name returns "free" for OBJ_FREE (index 0)', () => {
    // OBJ_FREE is 0 in C's obj.h enum.
    assert.equal(where_name({ where: OBJ_FREE }), 'free');
});

test('where_name returns "floor" for OBJ_FLOOR (index 1)', () => {
    // OBJ_FLOOR is 1, the state for objects on the dungeon floor.
    assert.equal(where_name({ where: OBJ_FLOOR }), 'floor');
});

test('where_name returns "contained" for OBJ_CONTAINED (index 2)', () => {
    assert.equal(where_name({ where: OBJ_CONTAINED }), 'contained');
});

test('where_name returns "invent" for OBJ_INVENT (index 3)', () => {
    assert.equal(where_name({ where: OBJ_INVENT }), 'invent');
});

test('where_name returns "minvent" for OBJ_MINVENT (index 4)', () => {
    // OBJ_MINVENT is 4, the state for objects in a monster's inventory.
    assert.equal(where_name({ where: OBJ_MINVENT }), 'minvent');
});

test('where_name returns "migrating" for OBJ_MIGRATING (index 5)', () => {
    assert.equal(where_name({ where: OBJ_MIGRATING }), 'migrating');
});

test('where_name returns "buried" for OBJ_BURIED (index 6)', () => {
    assert.equal(where_name({ where: OBJ_BURIED }), 'buried');
});

test('where_name returns "onbill" for OBJ_ONBILL (index 7)', () => {
    assert.equal(where_name({ where: OBJ_ONBILL }), 'onbill');
});

test('where_name returns "luafree" for OBJ_LUAFREE (index 8)', () => {
    assert.equal(where_name({ where: OBJ_LUAFREE }), 'luafree');
});

test('where_name returns "deleted" for OBJ_DELETED (index 9)', () => {
    assert.equal(where_name({ where: OBJ_DELETED }), 'deleted');
});

// -- Boundary cases -----------------------------------------------------------

test('where_name returns "nowhere" for null input', () => {
    // C: if (!obj) return "nowhere";
    assert.equal(where_name(null), 'nowhere');
});

test('where_name returns "nowhere" for undefined input', () => {
    assert.equal(where_name(undefined), 'nowhere');
});

test('where_name returns "unknown[N]" for negative where', () => {
    // C: if (where < 0 || where >= NOBJ_STATES ...) Sprintf(unknown, "unknown[%d]", where);
    assert.equal(where_name({ where: -1 }), 'unknown[-1]');
});

test('where_name returns "unknown[N]" for where beyond NOBJ_STATES', () => {
    // NOBJ_STATES is 10; where=10 is out of range.
    assert.equal(where_name({ where: 10 }), 'unknown[10]');
});

test('where_name returns "unknown[N]" for large out-of-range where', () => {
    assert.equal(where_name({ where: 99 }), 'unknown[99]');
});
