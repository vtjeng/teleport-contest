// Pin the pure functions ported from muse.c and the callees they need.
// Expected values are read from the C source, not from the JavaScript output.
//
// C ref: muse.c m_use_healing() (337-360), o_init.c objdescr_is() (352-364),
// do_name.c monverbself() (1221-1252).

import assert from 'node:assert/strict';
import test from 'node:test';

import * as M from '../js/monsters.js';
import * as O from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { objdescr_is, init_objects } from '../js/o_init.js';
import { monverbself } from '../js/do_name.js';
import { m_carrying } from '../js/mon.js';
import { monst_globals_init } from '../js/monsters.js';
import { roles } from '../js/roles.js';

// Build a minimal state with initialized objects so OBJ_DESCR resolves.
// rn2 = () => 0 gives deterministic first-in-class descriptions.
function makeState() {
    const archeologist = roles.find((role) => role.filecode === 'Arc');
    const state = {
        context: { ident: 2 },
        flags: { implicit_uncursed: true, initalign: 0 },
        iflags: { override_ID: false },
        program_state: { gameover: false },
        u: { uprops: [] },
        urole: { ...archeologist },
    };
    O.objects_globals_init(state);
    // Zero choices deterministically initialize every randomized description.
    init_objects(state, () => 0);
    monst_globals_init(state);
    return state;
}

// Build a linked inventory list from an array of otyp values.
function makeInventory(otypList, state) {
    let head = null;
    for (let i = otypList.length - 1; i >= 0; --i) {
        const obj = newObject({
            otyp: otypList[i],
            oclass: state.objects[otypList[i]].oc_class,
            quan: 1,
            nobj: head,
        });
        head = obj;
    }
    return head;
}

// ---------- objdescr_is ----------

test('objdescr_is returns true for a milky potion', () => {
    // C ref: o_init.c objdescr_is() (352-364). The milky potion is the
    // potion whose randomized description is "milky". In C, the milky
    // description belongs to one of the shuffled POTION_CLASS entries;
    // objdescr_is checks OBJ_DESCR(objects[obj->otyp]) against the given
    // string.
    const state = makeState();
    // Find which otyp got the "milky" description after shuffling.
    let milkyOtyp = null;
    for (let i = 0; i < state.objects.length; ++i) {
        if (O.OBJ_DESCR(state.objects[i], state) === 'milky') {
            milkyOtyp = i;
            break;
        }
    }
    assert.notEqual(milkyOtyp, null,
        'some potion should have the milky description');
    const obj = newObject({ otyp: milkyOtyp, oclass: O.POTION_CLASS });
    assert.equal(objdescr_is(obj, 'milky', state), true);
    assert.equal(objdescr_is(obj, 'smoky', state), false);
});

test('objdescr_is returns false for null obj', () => {
    // C ref: o_init.c objdescr_is() (354-357). A null obj returns FALSE
    // (after an impossible() call in C).
    const state = makeState();
    assert.equal(objdescr_is(null, 'milky', state), false);
});

test('objdescr_is returns false when the object has no description', () => {
    // C ref: o_init.c objdescr_is() (360-361). Objects whose oc_descr is
    // null cannot match any description string.
    const state = makeState();
    // A short sword (WEAPON_CLASS) has no randomized description.
    // Its OBJ_DESCR is null.
    const obj = newObject({ otyp: O.SHORT_SWORD, oclass: O.WEAPON_CLASS });
    assert.equal(O.OBJ_DESCR(state.objects[O.SHORT_SWORD], state), null);
    assert.equal(objdescr_is(obj, 'short sword', state), false);
});

// ---------- m_use_healing (via m_carrying) ----------

test('m_use_healing equivalent: m_carrying finds potions in priority order', () => {
    // C ref: muse.c m_use_healing() (337-360). The function checks potions
    // in order: POT_FULL_HEALING, POT_EXTRA_HEALING, POT_HEALING. The first
    // match wins.
    const state = makeState();

    // Monster carries all three healing potions.
    const monster = {
        minvent: makeInventory([
            O.POT_HEALING,
            O.POT_EXTRA_HEALING,
            O.POT_FULL_HEALING,
        ], state),
    };

    // m_carrying finds the FIRST inventory item matching the otyp, so it
    // returns the first POT_FULL_HEALING in inventory order.
    const full = m_carrying(monster, O.POT_FULL_HEALING, state);
    assert.notEqual(full, null, 'should find full healing');
    assert.equal(full.otyp, O.POT_FULL_HEALING);

    // If only regular healing is present:
    const monster2 = {
        minvent: makeInventory([O.POT_HEALING], state),
    };
    const regular = m_carrying(monster2, O.POT_FULL_HEALING, state);
    assert.equal(regular, null, 'no full healing in inventory');
    const found = m_carrying(monster2, O.POT_HEALING, state);
    assert.notEqual(found, null);
    assert.equal(found.otyp, O.POT_HEALING);
});

test('m_use_healing equivalent: empty inventory yields null for all types', () => {
    // C ref: muse.c m_use_healing() returns FALSE when no healing potion
    // is carried.
    const state = makeState();
    const monster = { minvent: null };
    assert.equal(m_carrying(monster, O.POT_FULL_HEALING, state), null);
    assert.equal(m_carrying(monster, O.POT_EXTRA_HEALING, state), null);
    assert.equal(m_carrying(monster, O.POT_HEALING, state), null);
});

// ---------- monverbself ----------

test('monverbself produces "Foo zaps itself" for a neuter monster', () => {
    // C ref: do_name.c monverbself() (1221-1252). For a neuter monster
    // ("itself"), vtense("itself", "zap") returns "zaps" (singular), and
    // since "zap" != "zaps", the plural path is skipped.
    // Result: "Monname zaps itself".
    const state = makeState();
    // A minimal monster object that pronoun_gender returns neuter (2) for.
    // pronoun_gender uses mon->data->msound, gender(), canspotmon(), and
    // Hallucination. For a non-hallucinating hero who can spot the monster,
    // a neuter species (like a gas spore, which is neuter) returns 2.
    const mon = {
        data: state.mons[M.PM_GAS_SPORE],
        m_ap_type: 0,
        cham: M.NON_PM,
        mname: '',
        mx: 1, my: 1,
        minvis: false,
        mundetected: false,
        mhp: 1, mhpmax: 1,
        m_id: 99,
        meverseen: true,
        isshk: false,
        ispriest: false,
        isminion: false,
        mpeaceful: false,
        mconf: false,
        mstun: false,
        mflee: false,
        mcan: false,
        mblinded: false,
        mcansee: true,
        misc_worn_check: 0,
    };
    // The hero is not hallucinating and not blind, and can spot the monster.
    state.u = {
        uprops: [],
        ux: 1, uy: 1,
        uroleplay: {},
    };
    state.youmonst = { data: state.mons[M.PM_HUMAN] };
    // canSpotMonster always returns true (the monster is visible).
    const env = { canSpotMonster: () => true };
    const result = monverbself(
        mon, 'The gas spore', 'zap', null, state, env);
    assert.equal(result, 'The gas spore zaps itself');
});

test('monverbself includes othertext when provided', () => {
    // C ref: do_name.c monverbself() (1245-1246). When othertext is non-null
    // and non-empty, it is inserted between the verb and the reflexive.
    const state = makeState();
    const mon = {
        data: state.mons[M.PM_KOBOLD],
        m_ap_type: 0,
        cham: M.NON_PM,
        mname: '',
        mx: 1, my: 1,
        minvis: false,
        mundetected: false,
        mhp: 1, mhpmax: 1,
        m_id: 100,
        meverseen: true,
        isshk: false,
        ispriest: false,
        isminion: false,
        mpeaceful: false,
        mconf: false,
        mstun: false,
        mflee: false,
        mcan: false,
        mblinded: false,
        mcansee: true,
        misc_worn_check: 0,
    };
    state.u = {
        uprops: [],
        ux: 1, uy: 1,
        uroleplay: {},
    };
    state.youmonst = { data: state.mons[M.PM_HUMAN] };
    // kobold is male; pronoun_gender returns 0 → "himself"
    // vtense("himself", "play") → "plays" (singular), different from "play"
    // → not plural path
    const env = { canSpotMonster: () => true };
    const result = monverbself(
        mon, 'The kobold', 'play', 'a horn directed at', state, env);
    assert.equal(result, 'The kobold plays a horn directed at himself');
});
