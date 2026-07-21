import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HEALTHY_TIN,
    RANDOM_TIN,
    SPINACH_TIN,
} from '../js/const.js';
import { set_tin_variety } from '../js/eat.js';
import {
    NON_PM,
    PM_GHOST,
    PM_KOBOLD,
    PM_LICHEN,
    PM_LIZARD,
    PM_WRAITH,
    monst_globals_init,
} from '../js/monsters.js';

function state() {
    const result = {};
    monst_globals_init(result);
    return result;
}

test('spinach tins clear species and do not draw', () => {
    const obj = { corpsenm: PM_KOBOLD, spe: 0 };
    set_tin_variety(obj, SPINACH_TIN, {
        state: state(),
        random: { rn2: () => assert.fail('spinach does not draw') },
    });
    assert.deepEqual(obj, { corpsenm: NON_PM, spe: 1 });
});

test('random rotten tins become homemade for nonrotting corpses', () => {
    for (const corpsenm of [PM_LIZARD, PM_LICHEN]) {
        const obj = { corpsenm, spe: 0 };
        set_tin_variety(obj, RANDOM_TIN, {
            state: state(),
            random: { rn2: (bound) => {
                assert.equal(bound, 15);
                return 0;
            } },
        });
        assert.equal(obj.spe, -2);
    }
});

test('random ordinary meat preserves rotten variety', () => {
    const obj = { corpsenm: PM_KOBOLD, spe: 0 };
    set_tin_variety(obj, RANDOM_TIN, {
        state: state(),
        random: { rn2: () => 0 },
    });
    assert.equal(obj.spe, -1);
});

test('healthy tins replace meat and empty tins with spinach', () => {
    for (const corpsenm of [PM_KOBOLD, NON_PM]) {
        const obj = { corpsenm, spe: 0 };
        set_tin_variety(obj, HEALTHY_TIN, {
            state: state(),
            random: { rn2: () => assert.fail('replacement does not draw') },
        });
        assert.deepEqual(obj, { corpsenm: NON_PM, spe: 1 });
    }
});

test('healthy tins distinguish ghost-class corpses from unsolid wraiths', () => {
    const wraith = { corpsenm: PM_WRAITH, spe: 0 };
    set_tin_variety(wraith, HEALTHY_TIN, {
        state: state(),
        random: { rn2: () => assert.fail('wraith replacement does not draw') },
    });
    assert.deepEqual(wraith, { corpsenm: NON_PM, spe: 1 });

    const ghost = { corpsenm: PM_GHOST, spe: 0 };
    set_tin_variety(ghost, HEALTHY_TIN, {
        state: state(),
        random: { rn2: (bound) => {
            // Pickled is a health-food variety, so no retry is needed.
            assert.equal(bound, 15);
            return 4;
        } },
    });
    assert.deepEqual(ghost, { corpsenm: PM_GHOST, spe: -5 });
});
