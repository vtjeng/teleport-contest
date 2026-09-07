// Tests for charge_ok from read.c (ported in read.js).
// C ref: read.c charge_ok() (689-725). Filter for getobj() when choosing
// an object to charge. Classifies objects by their class and type.

import assert from 'node:assert/strict';
import test from 'node:test';

import { charge_ok } from '../js/read.js';
import {
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    GETOBJ_EXCLUDE_SELECTABLE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    objects_globals_init,
    BRASS_LANTERN,
    OIL_LAMP,
    WAND_CLASS,
    TOOL_CLASS,
    FOOD_CLASS,
} from '../js/objects.js';

// charge_ok reads the global object catalog via objectType() without a state
// parameter, so the global game must be initialized.
test.before(() => {
    objects_globals_init(game);
});

// C: !obj -> GETOBJ_EXCLUDE
test('charge_ok excludes null', () => {
    assert.equal(charge_ok(null), GETOBJ_EXCLUDE);
    assert.equal(charge_ok(undefined), GETOBJ_EXCLUDE);
});

// C: obj->oclass == WAND_CLASS -> GETOBJ_SUGGEST
test('charge_ok suggests wands', () => {
    // Any wand object (oclass = WAND_CLASS) is suggested for charging
    assert.equal(
        charge_ok({ oclass: WAND_CLASS, otyp: 0 }),
        GETOBJ_SUGGEST,
    );
});

// C: BRASS_LANTERN and OIL_LAMP are suggested without checking oc_charged
test('charge_ok suggests lamps', () => {
    // BRASS_LANTERN: always suggested (read.c:707)
    assert.equal(
        charge_ok({ oclass: TOOL_CLASS, otyp: BRASS_LANTERN }),
        GETOBJ_SUGGEST,
    );
    // OIL_LAMP: always suggested (read.c:708)
    assert.equal(
        charge_ok({ oclass: TOOL_CLASS, otyp: OIL_LAMP }),
        GETOBJ_SUGGEST,
    );
});

// C: other object classes -> GETOBJ_EXCLUDE_SELECTABLE
test('charge_ok returns EXCLUDE_SELECTABLE for food, armor, etc.', () => {
    // A food item falls through to the default return
    assert.equal(
        charge_ok({ oclass: FOOD_CLASS, otyp: 0 }),
        GETOBJ_EXCLUDE_SELECTABLE,
    );
});
