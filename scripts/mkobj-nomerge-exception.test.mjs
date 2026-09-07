// Pin nomerge_exception(), a pure function from mkobj.c (lines 3280-3288)
// that returns true for objects using the nomerge flag persistently.
// C: special prize objects for achievement tracking (Mines and Sokoban
// prizes) are set nomerge until picked up by the hero, so they should
// not trigger insane_obj_bits() warnings.
//
// Expected values come from the is_mines_prize() and is_soko_prize()
// macros in obj.h (lines 435-436), which compare obj->o_id against
// svc.context.achieveo.mines_prize_oid and soko_prize_oid.

import assert from 'node:assert/strict';
import test from 'node:test';

import { nomerge_exception } from '../js/obj.js';

// -- Prize objects return true ------------------------------------------------

test('nomerge_exception returns true for the Mines prize', () => {
    // C: is_mines_prize(o) checks o->o_id == svc.context.achieveo.mines_prize_oid
    const state = { context: { achieveo: { mines_prize_oid: 42, soko_prize_oid: 0 } } };
    const obj = { o_id: 42 };
    assert.equal(nomerge_exception(obj, state), true);
});

test('nomerge_exception returns true for the Sokoban prize', () => {
    // C: is_soko_prize(o) checks o->o_id == svc.context.achieveo.soko_prize_oid
    const state = { context: { achieveo: { mines_prize_oid: 0, soko_prize_oid: 99 } } };
    const obj = { o_id: 99 };
    assert.equal(nomerge_exception(obj, state), true);
});

// -- Non-prize objects return false -------------------------------------------

test('nomerge_exception returns false for a non-prize object', () => {
    // An object whose o_id matches neither prize oid is not an exception.
    const state = { context: { achieveo: { mines_prize_oid: 42, soko_prize_oid: 99 } } };
    const obj = { o_id: 7 };
    assert.equal(nomerge_exception(obj, state), false);
});

test('nomerge_exception returns false when no prizes are set', () => {
    // Both prize oids are 0 (unset), so no object can match.
    const state = { context: { achieveo: { mines_prize_oid: 0, soko_prize_oid: 0 } } };
    const obj = { o_id: 1 };
    assert.equal(nomerge_exception(obj, state), false);
});

// -- Edge cases ---------------------------------------------------------------

test('nomerge_exception returns false when achieveo is missing', () => {
    // If context.achieveo is not initialized, no object can be a prize.
    const state = { context: {} };
    const obj = { o_id: 1 };
    assert.equal(nomerge_exception(obj, state), false);
});

test('nomerge_exception returns false when context is missing', () => {
    // Defensive: state has no context at all.
    const state = {};
    const obj = { o_id: 1 };
    assert.equal(nomerge_exception(obj, state), false);
});

test('nomerge_exception returns true when obj matches both prizes', () => {
    // Contrived: both prize oids are the same as the object's o_id.
    // The C macros check them with ||, so one match suffices.
    const state = { context: { achieveo: { mines_prize_oid: 5, soko_prize_oid: 5 } } };
    const obj = { o_id: 5 };
    assert.equal(nomerge_exception(obj, state), true);
});
