import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    EF_NONE,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    OBJ_INVENT,
    OBJ_MINVENT,
    W_ARMH,
} from '../js/const.js';
import {
    CHEST,
    OILSKIN_SACK,
    POT_FRUIT_JUICE,
    POT_WATER,
    POTION_CLASS,
    SACK,
    SCR_BLANK_PAPER,
    SCROLL_CLASS,
} from '../js/objects.js';
import {
    water_damage,
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

test('water_damage follows trap.c source branches for potion dilution',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/trap.c', import.meta.url),
            'utf8',
        );
        assert.match(
            source,
            /else if \(obj->oclass == POTION_CLASS\)[\s\S]*?obj->odiluted\)/u,
        );
        const state = { u: { uprops: [] }, gm: {} };
        const obj = {
            oclass: POTION_CLASS,
            otyp: POT_FRUIT_JUICE,
            odiluted: 0,
            blessed: true,
            cursed: false,
            dknown: 1,
            where: OBJ_INVENT,
        };
        const messages = [];
        let refreshes = 0;
        const result = await water_damage(obj, 'fruit juice', true, {
            state,
            message: (line) => messages.push(line),
            updateInventory: () => { ++refreshes; },
            random: { rn2: () => assert.fail('forced water damage skips luck') },
            erodeObject: () => assert.fail('potions do not reach erosion'),
        });
        assert.equal(result, ER_DAMAGED);
        assert.equal(obj.odiluted, 1);
        assert.deepEqual(messages, ['Your fruit juice dilutes.']);
        assert.equal(refreshes, 1);
    });

test('a previously diluted potion becomes uncursed water', async () => {
    const state = { u: { uprops: [] }, gm: {} };
    const obj = {
        oclass: POTION_CLASS,
        otyp: POT_FRUIT_JUICE,
        odiluted: 1,
        blessed: true,
        cursed: true,
        dknown: 1,
        where: OBJ_INVENT,
    };
    const messages = [];
    const result = await water_damage(obj, 'fruit juice', true, {
        state,
        message: (line) => messages.push(line),
        updateInventory: () => {},
        random: { rn2: () => assert.fail('forced water damage skips luck') },
    });
    assert.equal(result, ER_DAMAGED);
    assert.equal(obj.otyp, POT_WATER);
    assert.equal(obj.odiluted, 0);
    assert.equal(obj.blessed, false);
    assert.equal(obj.cursed, false);
    assert.equal(obj.dknown, 0);
    assert.deepEqual(messages, ['Your fruit juice dilutes further.']);
});

test('water_damage blanks a nonblank scroll and leaves blank paper alone',
    async () => {
        const state = { u: { uprops: [] }, gm: {} };
        const obj = {
            oclass: SCROLL_CLASS,
            otyp: 366,
            spe: 3,
            dknown: 1,
            where: OBJ_INVENT,
        };
        const messages = [];
        let refreshes = 0;
        const env = {
            state,
            message: (line) => messages.push(line),
            updateInventory: () => { ++refreshes; },
            random: { rn2: () => assert.fail('forced water damage skips luck') },
        };
        assert.equal(
            await water_damage(obj, 'scroll', true, env),
            ER_DAMAGED,
        );
        assert.equal(obj.otyp, SCR_BLANK_PAPER);
        assert.equal(obj.spe, 0);
        assert.equal(obj.dknown, 0);
        assert.deepEqual(messages, ['Your scroll fades.']);
        assert.equal(refreshes, 1);
        messages.length = 0;
        assert.equal(await water_damage(obj, 'scroll', true, env), ER_NOTHING);
        assert.deepEqual(messages, []);
        assert.equal(refreshes, 1);
    });

test('waterproof containers leak only on the cursed rn2(3) arm', async () => {
    const state = { u: { uprops: [] }, gm: {} };
    const obj = {
        oclass: 6,
        otyp: OILSKIN_SACK,
        cursed: true,
        cobj: { otyp: POT_FRUIT_JUICE },
        where: OBJ_INVENT,
    };
    const messages = [];
    const known = [];
    const chain = [];
    const env = {
        state,
        message: (line) => messages.push(line),
        makeKnown: (otyp) => known.push(otyp),
        waterDamageChain: (...args) => chain.push(args),
        random: { rn2: (bound) => {
            assert.equal(bound, 3);
            return 1;
        } },
    };
    assert.equal(await water_damage(obj, 'oilskin sack', true, env), ER_DAMAGED);
    assert.deepEqual(messages, ['The water cannot get into your oilskin sack.']);
    assert.deepEqual(known, [OILSKIN_SACK]);
    assert.deepEqual(chain, []);
    assert.equal(state.gm.mentioned_water, true);

    obj.otyp = CHEST;
    obj.cursed = false;
    obj.cobj = { otyp: POT_FRUIT_JUICE };
    messages.length = 0;
    assert.equal(await water_damage(obj, 'bag', true, {
        ...env,
        random: { rn2: () => assert.fail('uncursed waterproof bag does not roll') },
    }), ER_DAMAGED);
    assert.deepEqual(messages, ['The water cannot get into your bag.']);
});

test('ordinary containers send their contents through water_damage_chain',
    async () => {
        const state = { u: { uprops: [] }, gm: {} };
        const contents = { otyp: POT_FRUIT_JUICE };
        const obj = {
            oclass: 6,
            otyp: SACK,
            cursed: false,
            cobj: contents,
            where: OBJ_INVENT,
        };
        const messages = [];
        const chain = [];
        const env = {
            state,
            message: (line) => messages.push(line),
            waterDamageChain: (...args) => chain.push(args),
            random: { rn2: () => assert.fail('ordinary containers do not roll') },
        };
        const result = await water_damage(obj, 'sack', true, env);
        assert.equal(result, ER_DAMAGED);
        assert.deepEqual(messages, ['Some water gets into your sack!']);
        assert.equal(chain.length, 1);
        assert.equal(chain[0][0], contents);
        assert.equal(chain[0][1], false);
        assert.equal(chain[0][2], env);
    });
