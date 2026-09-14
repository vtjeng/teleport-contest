import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AMULET_OF_YENDOR,
    FOOD_RATION,
    WEAPON_CLASS,
} from '../js/objects.js';
import { init_objects } from '../js/o_init.js';
import {
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    OBJ_INVENT,
    W_ARMOR,
    W_TOOL,
} from '../js/const.js';
import {
    _getobjInternals,
    any_obj_ok,
    ckunpaid,
    ckvalidcat,
    ggetobj,
    is_inuse,
    is_worn,
    wearing_armor,
} from '../js/invent.js';

const {
    mime_action,
    safeq_shortxprname,
    safeq_xprname,
    silly_thing,
    splittable,
    taking_off,
} = _getobjInternals;

test('small getobj predicates follow invent.c', () => {
    const state = {
        uwep: null,
        flags: { goldX: false },
        gc: { class_filter: true },
        gv: { valid_menu_classes: String.fromCharCode(7) },
    };
    const carried = {
        where: OBJ_INVENT,
        oclass: 7,
        owornmask: W_ARMOR,
        quan: 3,
    };
    assert.equal(any_obj_ok(carried), GETOBJ_SUGGEST);
    assert.equal(any_obj_ok(null), GETOBJ_EXCLUDE);
    assert.equal(taking_off('take off'), true);
    assert.equal(taking_off('remove'), true);
    assert.equal(taking_off('drop'), false);
    assert.equal(is_worn(carried), true);
    assert.equal(is_inuse(carried, state), true);
    assert.equal(wearing_armor({ uarm: carried }), true);
    assert.equal(ckunpaid({ unpaid: false, cobj: null }), false);
    assert.equal(ckunpaid({ unpaid: true, cobj: null }), true);
    assert.equal(ckvalidcat(carried, state), true);
    assert.equal(splittable({ otyp: 1, cursed: false }, state), true);
    const welded = {
        otyp: 1, oclass: WEAPON_CLASS, cursed: true, bknown: false,
    };
    assert.equal(splittable(welded, { uwep: welded }), false);
    assert.equal(welded.bknown, 1);
});

test('is_inuse recognizes an active tool and rejects an uncarried tool', () => {
    const tool = {
        where: OBJ_INVENT,
        oclass: 6,
        owornmask: W_TOOL,
        lamplit: false,
    };
    assert.equal(is_inuse(tool, { uwep: null }), true);
    assert.equal(is_inuse({ ...tool, where: 0 }, { uwep: tool }), false);
});

test('mime_action and silly_thing preserve their source messages', async () => {
    const mimeState = {};
    await mime_action('rub the royal jelly on', mimeState);
    assert.equal(mimeState._ttyToplines, 'You mime rubbing the royal jelly on something.');

    const state = {};
    await silly_thing('call', {
        otyp: AMULET_OF_YENDOR,
        known: false,
    }, state);
    assert.equal(state._ttyToplines, "The Amulet doesn't like being called names.");
});

test('ggetobj reports the empty inventory result and all-finished flag', async () => {
    const state = {};
    const resultflags = { value: 0 };
    const result = await ggetobj('drop', () => 1, 0, false, resultflags, state);
    assert.equal(result, 0);
    assert.equal(resultflags.value, 1);
    assert.equal(state._ttyToplines, 'You have nothing to drop.');
});

test('safeq names use their static inventory context', () => {
    const state = {
        flags: { invlet_constant: true },
    };
    init_objects(state, () => 0);
    const obj = { invlet: 'a', otyp: FOOD_RATION, quan: 1, known: true,
        oclass: 7, bknown: true, blessed: false, cursed: false };
    assert.equal(typeof safeq_xprname(obj, state), 'string');
    assert.equal(typeof safeq_shortxprname(obj, state), 'string');
});
