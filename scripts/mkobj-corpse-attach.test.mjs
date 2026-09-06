// Pin corpse_revive_type and obj_attach_mid, two pure functions from mkobj.c.
//
// corpse_revive_type (mkobj.c:2129-2141) returns the monster index a corpse
// would revive as. When the corpse carries stored monster traits (omonst),
// the traits' mnum is returned; otherwise the corpse's corpsenm field is.
//
// obj_attach_mid (mkobj.c:2147-2155) attaches a monster id to an object by
// storing it in oextra.omid, creating oextra if needed.
//
// Expected values come from reading the C source, not from running the port.

import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { game } from '../js/gstate.js';
import { monst_globals_init } from '../js/monsters.js';
import { corpse_revive_type, obj_attach_mid } from '../js/obj.js';

// get_mtraits (called by corpse_revive_type) reads state.mons[mnum].
// Initialize the mons catalog so the lookup succeeds.
before(() => { monst_globals_init(game); });

// -- corpse_revive_type ------------------------------------------------------

test('corpse_revive_type: no stored traits returns corpsenm', () => {
    // C: revivetype = obj->corpsenm, then has_omonst is false, so corpsenm
    // is returned unchanged.
    const obj = { corpsenm: 42 };
    assert.equal(corpse_revive_type(obj), 42);
});

test('corpse_revive_type: oextra without omonst returns corpsenm', () => {
    // C: has_omonst checks obj->oextra && OMONST(obj); here oextra exists
    // but omonst is absent.
    const obj = { corpsenm: 7, oextra: {} };
    assert.equal(corpse_revive_type(obj), 7);
});

test('corpse_revive_type: stored traits override corpsenm with mnum', () => {
    // C: has_omonst is true, get_mtraits returns a monster with mnum
    // different from corpsenm. PM_HUMAN_ZOMBIE (244) is the corpse species;
    // the saved traits carry PM_HUMAN (260), which is the original monster.
    // corpse_revive_type returns the traits' mnum.
    const obj = {
        corpsenm: 244, // PM_HUMAN_ZOMBIE
        oextra: {
            omonst: { mnum: 260 }, // PM_HUMAN
        },
    };
    assert.equal(corpse_revive_type(obj), 260);
});

// -- obj_attach_mid ----------------------------------------------------------

test('obj_attach_mid: attaches mid to object, creating oextra', () => {
    // C: newomid ensures oextra exists, then OMID(obj) = mid.
    const obj = { otyp: 0 };
    const result = obj_attach_mid(obj, 12345);
    assert.equal(result, obj); // returns the same object
    assert.equal(obj.oextra.omid, 12345);
});

test('obj_attach_mid: preserves existing oextra fields', () => {
    // When oextra already has other fields, obj_attach_mid must not destroy
    // them. C's newomid allocates oextra only if absent.
    const obj = { otyp: 0, oextra: { oname: 'Excalibur' } };
    obj_attach_mid(obj, 777);
    assert.equal(obj.oextra.omid, 777);
    assert.equal(obj.oextra.oname, 'Excalibur');
});

test('obj_attach_mid: null obj returns null', () => {
    // C: if (!mid || !obj) return (struct obj *) 0
    assert.equal(obj_attach_mid(null, 42), null);
});

test('obj_attach_mid: zero mid returns null', () => {
    // C: if (!mid || !obj) return (struct obj *) 0
    const obj = { otyp: 0 };
    assert.equal(obj_attach_mid(obj, 0), null);
});

test('obj_attach_mid: undefined obj returns null', () => {
    // C: !obj is true for null/undefined
    assert.equal(obj_attach_mid(undefined, 42), null);
});
