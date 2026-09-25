import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
} from '../js/const.js';
import {
    BAG_OF_TRICKS,
    COIN_CLASS,
    HORN_OF_PLENTY,
    LARGE_BOX,
    POTION_CLASS,
} from '../js/objects.js';
import { tip_ok } from '../js/pickup.js';

// C ref: pickup.c tip_ok() (3395-3410). Its source has no RNG, output, or
// state writes; it returns only GETOBJ_EXCLUDE/SUGGEST/DOWNPLAY by class,
// container type, and the horn's discovery flags.
test('tip_ok follows the source eligibility and suggestion rules', () => {
    const knownHornState = {
        objects: { [HORN_OF_PLENTY]: { oc_name_known: true } },
    };
    const unknownHornState = {
        objects: { [HORN_OF_PLENTY]: { oc_name_known: false } },
    };

    assert.equal(tip_ok(null), GETOBJ_EXCLUDE);
    assert.equal(tip_ok({ oclass: COIN_CLASS }), GETOBJ_EXCLUDE);
    assert.equal(tip_ok({ otyp: LARGE_BOX }), GETOBJ_SUGGEST);
    assert.equal(tip_ok({ otyp: BAG_OF_TRICKS }), GETOBJ_SUGGEST);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: false,
    }, knownHornState), GETOBJ_DOWNPLAY);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: true,
    }, unknownHornState), GETOBJ_DOWNPLAY);
    assert.equal(tip_ok({
        otyp: HORN_OF_PLENTY,
        dknown: true,
    }, knownHornState), GETOBJ_SUGGEST);
    assert.equal(tip_ok({ oclass: POTION_CLASS }), GETOBJ_DOWNPLAY);
});
