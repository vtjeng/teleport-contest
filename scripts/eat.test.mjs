import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CONFLICT,
    FROMFORM,
    FROMOUTSIDE,
    HEALTHY_TIN,
    HUNGER,
    MOD_ENCUMBER,
    NOT_HUNGRY,
    PROTECTION,
    RANDOM_TIN,
    REGENERATION,
    SLOW_DIGESTION,
    SPINACH_TIN,
    UNENCUMBERED,
    W_ARTI,
    W_RINGL,
    W_RINGR,
    W_WEP,
} from '../js/const.js';
import { gethungry, set_tin_variety } from '../js/eat.js';
import {
    AMULET_OF_LIFE_SAVING,
    FAKE_AMULET_OF_YENDOR,
    MEAT_RING,
    RIN_ADORNMENT,
    RIN_PROTECTION,
    RIN_SEARCHING,
    RIN_SLOW_DIGESTION,
    objects_globals_init,
} from '../js/objects.js';
import {
    M1_CARNIVORE,
    NON_PM,
    PM_GHOST,
    PM_HUMAN,
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

function hungerState() {
    const result = state();
    objects_globals_init(result);
    result.iflags = { debug_hunger: false };
    result.multi = 0;
    result.u = {
        uhunger: 900,
        uhs: NOT_HUNGRY,
        uhave: { amulet: false },
        uinvulnerable: false,
        uprops: [],
    };
    result.youmonst = { data: result.mons[PM_HUMAN] };
    return result;
}

function property(stateValue, index) {
    return stateValue.u.uprops[index] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };
}

function hungerTick(stateValue, accessoryTime, capacity = UNENCUMBERED) {
    const bounds = [];
    const loss = gethungry(stateValue, {
        random: {
            rn2: (bound) => {
                bounds.push(bound);
                return accessoryTime;
            },
        },
        nearCapacity: () => capacity,
    });
    assert.deepEqual(bounds, [20]);
    return loss;
}

test('gethungry applies ordinary alert-hero nutrition loss', () => {
    const current = hungerState();
    assert.ok(current.youmonst.data.mflags1 & M1_CARNIVORE);

    assert.equal(hungerTick(current, 2), 1);
    assert.equal(current.u.uhunger, 899);
    assert.equal(current.u.uhs, NOT_HUNGRY);
});

test('gethungry skips invulnerable and debug-hunger turns without drawing', () => {
    for (const setup of [
        (current) => { current.u.uinvulnerable = true; },
        (current) => { current.iflags.debug_hunger = true; },
    ]) {
        const current = hungerState();
        setup(current);
        assert.equal(gethungry(current, {
            random: { rn2: () => assert.fail('skipped turn drew') },
        }), 0);
        assert.equal(current.u.uhunger, 900);
    }
});

test('gethungry preserves odd-turn regeneration and encumbrance masks', () => {
    const excluded = hungerState();
    property(excluded, REGENERATION).intrinsic = FROMFORM;
    property(excluded, REGENERATION).extrinsic = W_ARTI | W_WEP;
    assert.equal(hungerTick(excluded, 1), 1);

    const active = hungerState();
    property(active, REGENERATION).intrinsic = FROMFORM | FROMOUTSIDE;
    assert.equal(hungerTick(active, 1), 2);

    const worn = hungerState();
    property(worn, REGENERATION).intrinsic = FROMFORM;
    property(worn, REGENERATION).extrinsic = W_ARTI | W_RINGL;
    assert.equal(hungerTick(worn, 1, MOD_ENCUMBER), 3);
    assert.equal(worn.u.uhunger, 897);
});

test('gethungry applies even-turn property and accessory costs', () => {
    const properties = hungerState();
    property(properties, HUNGER).intrinsic = FROMOUTSIDE;
    property(properties, CONFLICT).extrinsic = W_ARTI | W_RINGL;
    assert.equal(hungerTick(properties, 2), 3);

    const intrinsicConflict = hungerState();
    property(intrinsicConflict, CONFLICT).intrinsic = FROMOUTSIDE;
    property(intrinsicConflict, CONFLICT).extrinsic = W_ARTI;
    assert.equal(hungerTick(intrinsicConflict, 2), 2);

    const slowArmor = hungerState();
    property(slowArmor, SLOW_DIGESTION).extrinsic = W_WEP;
    assert.equal(hungerTick(slowArmor, 0), 1);
    const slowRing = hungerState();
    property(slowRing, SLOW_DIGESTION).extrinsic = W_RINGR;
    slowRing.uright = { otyp: RIN_SLOW_DIGESTION, spe: 0 };
    assert.equal(hungerTick(slowRing, 0), 0);

    const amulet = hungerState();
    amulet.uamul = { otyp: AMULET_OF_LIFE_SAVING };
    assert.equal(hungerTick(amulet, 8), 2);
    const fakeAmulet = hungerState();
    fakeAmulet.uamul = { otyp: FAKE_AMULET_OF_YENDOR };
    assert.equal(hungerTick(fakeAmulet, 8), 1);

    const possessed = hungerState();
    possessed.u.uhave.amulet = true;
    assert.equal(hungerTick(possessed, 16), 2);
});

test('gethungry follows ring charge and duplicate-protection rules', () => {
    const chargedZero = hungerState();
    chargedZero.uleft = { otyp: RIN_ADORNMENT, spe: 0 };
    assert.equal(hungerTick(chargedZero, 4), 1);

    const charged = hungerState();
    charged.uleft = { otyp: RIN_ADORNMENT, spe: 1 };
    assert.equal(hungerTick(charged, 4), 2);

    const uncharged = hungerState();
    uncharged.uleft = { otyp: RIN_SEARCHING, spe: 0 };
    assert.equal(hungerTick(uncharged, 4), 2);

    const meat = hungerState();
    meat.uleft = { otyp: MEAT_RING, spe: 1 };
    assert.equal(hungerTick(meat, 4), 1);

    const duplicateProtection = hungerState();
    duplicateProtection.uleft = { otyp: RIN_PROTECTION, spe: 0 };
    duplicateProtection.uright = { otyp: RIN_PROTECTION, spe: 0 };
    property(duplicateProtection, PROTECTION).extrinsic = W_RINGL | W_RINGR;
    assert.equal(hungerTick(duplicateProtection, 4), 2);
    assert.equal(hungerTick(duplicateProtection, 12), 1);
});

test('gethungry fails closed at unported awareness and status boundaries', () => {
    const immobile = hungerState();
    immobile.multi = -1;
    assert.throws(
        () => hungerTick(immobile, 2),
        /unported unconscious or immobile state/u,
    );
    assert.equal(immobile.u.uhunger, 900);

    const threshold = hungerState();
    threshold.u.uhunger = 151;
    assert.throws(
        () => hungerTick(threshold, 2),
        /unported hunger-status transition/u,
    );
    assert.equal(threshold.u.uhunger, 151);
    assert.equal(threshold.u.uhs, NOT_HUNGRY);
});

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
