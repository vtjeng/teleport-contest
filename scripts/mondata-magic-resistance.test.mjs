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

function monster(overrides = {}) {
    return {
        data: {
            mattk: [],
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
        objects: [],
    };
}

test('species attacks and gray-dragon ancestry grant magic resistance', () => {
    const current = monster();
    const currentState = state();

    current.data.mattk = [{ aatyp: AT_NONE, adtyp: AD_MAGM }];
    assert.equal(resists_magm(current, currentState), true);

    current.data = {
        mattk: [{ aatyp: AT_BREA, adtyp: AD_RBRE }],
        pmidx: PM_NEWT,
    };
    assert.equal(resists_magm(current, currentState), true);

    current.data = {
        mattk: [{ aatyp: AT_NONE, adtyp: AD_PHYS }],
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
