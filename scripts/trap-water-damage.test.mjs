import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EF_NONE,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    OBJ_MINVENT,
    W_ARMH,
} from '../js/const.js';
import {
    water_damage_monster_equipment,
} from '../js/trap_water_damage.js';

function wornObject(overrides = {}) {
    return {
        greased: false,
        lamplit: false,
        ocarry: {},
        owornmask: W_ARMH,
        where: OBJ_MINVENT,
        ...overrides,
    };
}

test('a missing rust-trap target needs no water-damage operations',
    async () => {
        const result = await water_damage_monster_equipment(null, null);
        assert.equal(result, ER_NOTHING);
    });

test('non-equipment is rejected before an illuminated item can mutate',
    async () => {
        const obj = wornObject({ lamplit: true, owornmask: 0 });
        await assert.rejects(
            water_damage_monster_equipment(obj, null, {
                splashLight: () => assert.fail('preflight must run first'),
            }),
            /requires worn armor or a wielded weapon/u,
        );
    });

test('an extinguished light reports damage and skips later branches',
    async () => {
        const obj = wornObject({ lamplit: true });
        const events = [];
        const env = {
            erodeObject: () => assert.fail('splashing short-circuits erosion'),
            random: {
                rn2: () => assert.fail('splashing precedes grease'),
            },
            splashLight: (target, nestedEnv) => {
                assert.equal(target, obj);
                assert.equal(nestedEnv, env);
                events.push('splash');
                return true;
            },
        };

        const result = await water_damage_monster_equipment(
            obj,
            'helmet',
            env,
        );

        assert.equal(result, ER_DAMAGED);
        assert.deepEqual(events, ['splash']);
    });

test('water can wash off grease without reaching erosion', async () => {
    const obj = wornObject({ greased: true });
    const draws = [];
    const env = {
        erodeObject: () => assert.fail('grease blocks erosion'),
        random: {
            rn2: (bound) => {
                draws.push(bound);
                return 0;
            },
        },
        splashLight: () => false,
    };

    const result = await water_damage_monster_equipment(
        obj,
        'helmet',
        env,
    );

    assert.equal(result, ER_GREASED);
    assert.equal(obj.greased, false);
    assert.deepEqual(draws, [2]);
});

test('ordinary equipment delegates forced rust with no erosion flags',
    async () => {
        const obj = wornObject();
        const calls = [];
        const env = {
            erodeObject: (...args) => {
                calls.push(args);
                return ER_NOTHING;
            },
            random: {
                rn2: () => assert.fail('ungreased equipment needs no draw'),
            },
            splashLight: () => false,
        };

        const result = await water_damage_monster_equipment(
            obj,
            'helmet',
            env,
        );

        assert.equal(result, ER_NOTHING);
        assert.deepEqual(calls, [
            [obj, 'helmet', ERODE_RUST, EF_NONE, env],
        ]);
    });
