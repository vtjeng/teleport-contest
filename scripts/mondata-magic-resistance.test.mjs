import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARTILIST_TEMPLATE,
    ART_MAGICBANE,
    ART_ORB_OF_DETECTION,
} from '../js/artifacts.js';
import { ANTIMAGIC, W_ARM } from '../js/const.js';
import { resists_magm } from '../js/mondata.js';
import {
    AD_MAGM,
    AD_PHYS,
    AD_RBRE,
    AT_BREA,
    AT_NONE,
    PM_BABY_GRAY_DRAGON,
    PM_NEWT,
} from '../js/monsters.js';

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
