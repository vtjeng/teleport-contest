// Pin mondata.c's resists_magm(). Every gate it applies is an equality or a
// mask against a named constant, so a monster or object fabricated from the
// port's own constant would satisfy the gate even if the constant were missing
// or wrong. The damage types, the property number, and the worn-slot bit below
// are therefore the numbers written in the C headers.
//
// `pmidx` keeps its PM_ constant: C generates those from the row order of
// monsters.h and writes no numeral, so there is nothing to transcribe.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARTILIST_TEMPLATE,
    ART_MAGICBANE,
    ART_ORB_OF_DETECTION,
    NROFARTIFACTS,
} from '../js/artifacts.js';
import { resists_magm } from '../js/mondata.js';
import { PM_BABY_GRAY_DRAGON, PM_NEWT } from '../js/monsters.js';

const AD_PHYS = 0;    // monattk.h:42
const AD_MAGM = 1;    // monattk.h:43
const AD_RBRE = 242;  // monattk.h:89, random breath weapon
const AT_NONE = 0;    // monattk.h:12
const AT_BREA = 12;   // monattk.h:22
const ANTIMAGIC = 12; // prop.h:30, enum prop_types
const W_ARM = 0x00000001;  // prop.h:101, body-armor slot
const SOURCE_NATTK = 6;    // permonst.h:48, fixed-size permonst.mattk

function sourceAttacks(first = { aatyp: AT_NONE, adtyp: AD_PHYS }) {
    return Array.from({ length: SOURCE_NATTK }, (_, index) => (
        index === 0 ? first : { aatyp: AT_NONE, adtyp: AD_PHYS }
    ));
}

function monster(overrides = {}) {
    return {
        data: {
            mattk: sourceAttacks(),
            pmidx: PM_NEWT,
        },
        minvent: null,
        mw: null,
        ...overrides,
    };
}

function state() {
    return {
        artilist: ARTILIST_TEMPLATE,
        artiexist: Array.from({ length: NROFARTIFACTS + 1 }, () => ({})),
        objects: [],
    };
}

test('species attacks and gray-dragon ancestry grant magic resistance', () => {
    const current = monster();
    const currentState = state();

    current.data.mattk = sourceAttacks({ aatyp: AT_NONE, adtyp: AD_MAGM });
    assert.equal(resists_magm(current, currentState), true);

    current.data = {
        mattk: sourceAttacks({ aatyp: AT_BREA, adtyp: AD_RBRE }),
        pmidx: PM_NEWT,
    };
    assert.equal(resists_magm(current, currentState), true);

    current.data = {
        mattk: sourceAttacks(),
        pmidx: PM_BABY_GRAY_DRAGON,
    };
    assert.equal(resists_magm(current, currentState), true);
});

test('wielded, worn, and carried equipment use distinct source gates', () => {
    const currentState = state();
    const current = monster({
        mw: { oartifact: ART_MAGICBANE },
    });
    assert.equal(resists_magm(current, currentState), true);

    current.mw = null;
    // Any valid object-table slot works; only its ANTIMAGIC property matters.
    const propertyType = 1;
    currentState.objects[propertyType] = { oc_oprop: ANTIMAGIC };
    current.minvent = {
        nobj: null,
        oartifact: 0,
        otyp: propertyType,
        owornmask: W_ARM,
    };
    assert.equal(resists_magm(current, currentState), true);

    current.minvent = {
        nobj: null,
        oartifact: ART_ORB_OF_DETECTION,
        otyp: 0,
        owornmask: 0,
    };
    assert.equal(resists_magm(current, currentState), true);

    current.minvent.oartifact = 0;
    assert.equal(resists_magm(current, currentState), false);
});

test('hero resists_magm applies C armor, weapon-tool, and offhand slot masks', () => {
    // prop.h:101-107 defines W_ARM=0x1, W_WEP=0x100 and W_SWAPWEP=0x400.
    // objects.h uses WEAPON_CLASS=2 and TOOL_CLASS=6; the weapon tool macro
    // requires oc_subtyp != P_NONE, where skills.h:15 defines P_NONE=0.
    const currentState = state();
    const hero = monster();
    currentState.youmonst = hero;
    currentState.invent = null;
    currentState.uwep = null;
    currentState.u = { twoweap: false };

    // The fixture row models an object table entry with ANTIMAGIC in oc_oprop.
    currentState.objects[1] = { oc_oprop: ANTIMAGIC, oc_subtyp: 0 };
    currentState.invent = {
        otyp: 1, oartifact: 0, owornmask: 0x00000001, nobj: null,
    };
    assert.equal(resists_magm(hero, currentState), true);

    // A W_WEP-tagged inventory object is ignored until C's uwep is a weapon.
    currentState.objects[2] = { oc_oprop: ANTIMAGIC, oc_subtyp: 0 };
    currentState.invent = {
        otyp: 2, oartifact: 0, owornmask: 0x00000100, nobj: null,
    };
    assert.equal(resists_magm(hero, currentState), false);
    currentState.uwep = { oclass: 2, otyp: 2 };
    assert.equal(resists_magm(hero, currentState), true);

    // Tools wielded as weapons join W_WEP only when their object-table skill
    // is nonzero. The towel-style P_NONE row is deliberately the negative case.
    currentState.objects[3] = { oc_oprop: ANTIMAGIC, oc_subtyp: 0 };
    currentState.invent = {
        otyp: 3, oartifact: 0, owornmask: 0x00000100, nobj: null,
    };
    currentState.uwep = { oclass: 6, otyp: 3 };
    assert.equal(resists_magm(hero, currentState), false);
    currentState.objects[3].oc_subtyp = 1;
    assert.equal(resists_magm(hero, currentState), true);

    // C includes W_SWAPWEP only while u.twoweap is active.
    currentState.uwep = null;
    currentState.objects[4] = { oc_oprop: ANTIMAGIC, oc_subtyp: 0 };
    currentState.invent = {
        otyp: 4, oartifact: 0, owornmask: 0x00000400, nobj: null,
    };
    currentState.u.twoweap = false;
    assert.equal(resists_magm(hero, currentState), false);
    currentState.u.twoweap = true;
    assert.equal(resists_magm(hero, currentState), true);
});
