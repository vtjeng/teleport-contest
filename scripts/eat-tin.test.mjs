import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    HOMEMADE_TIN,
    NON_PM,
    ROTTEN_TIN,
    RANDOM_TIN,
} from '../js/const.js';
import {
    set_tin_variety,
    tin_details,
    tinopen_ok,
} from '../js/eat.js';
import {
    PM_KOBOLD,
    PM_LIZARD,
    monst_globals_init,
} from '../js/monsters.js';
import { TIN } from '../js/objects.js';

const EAT_C = readFileSync(
    new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8',
);

function initializedState() {
    const state = {};
    monst_globals_init(state);
    return state;
}

test('tinopen_ok is the source getobj filter for tins', () => {
    assert.match(EAT_C, /tinopen_ok\(struct obj \*obj\)[\s\S]*?obj->otyp == TIN/u);
    assert.equal(tinopen_ok(null), GETOBJ_EXCLUDE);
    assert.equal(tinopen_ok({ otyp: TIN }), GETOBJ_SUGGEST);
    assert.equal(tinopen_ok({ otyp: TIN + 1 }), GETOBJ_EXCLUDE);
});

test('tin_details keeps source placement for known and hidden tin varieties', () => {
    assert.match(EAT_C, /void\s+tin_details\(struct obj \*obj, int mnum, char \*buf\)/u);
    const state = initializedState();
    const rotten = { corpsenm: PM_KOBOLD, spe: -(ROTTEN_TIN + 1), cknown: true };
    const homemade = { corpsenm: PM_KOBOLD, spe: -(HOMEMADE_TIN + 1), cknown: true };
    const spinach = { corpsenm: NON_PM, spe: 1, cknown: true };
    const hidden = { corpsenm: PM_KOBOLD, spe: -(ROTTEN_TIN + 1), cknown: false };

    assert.equal(tin_details(rotten, PM_KOBOLD, 'tin', { state }),
        'rotten tin of kobold meat');
    assert.equal(tin_details(homemade, PM_KOBOLD, 'tin', { state }),
        'homemade tin of kobold meat');
    assert.equal(tin_details(spinach, NON_PM, 'tin', { state }),
        'tin of spinach');
    assert.equal(tin_details(hidden, PM_KOBOLD, 'tin', { state }),
        'tin of kobold meat');
    assert.equal(tin_details({ corpsenm: PM_KOBOLD, spe: 0 }, NON_PM,
        'tin', { state, random: { rn2: () => 0 } }), 'empty tin');
});


test('set_tin_variety uses C’s final random arm for an unrecognized force', () => {
    assert.match(EAT_C, /else\s*\{[^}]*rn2\(TTSZ - 1\)/u);
    const tin = { corpsenm: PM_LIZARD, spe: 0 };
    const calls = [];
    set_tin_variety(tin, RANDOM_TIN + 100, {
        state: initializedState(),
        random: { rn2(bound) { calls.push(bound); return 0; } },
    });
    assert.deepEqual(calls, [15]);
    // C remaps rotten to homemade for species whose corpses do not rot.
    assert.equal(tin.spe, -(HOMEMADE_TIN + 1));
});
