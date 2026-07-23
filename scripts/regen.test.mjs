import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CON,
    A_INT,
    A_WIS,
    ENERGY_REGENERATION,
    MAGICAL_BREATHING,
    REGENERATION,
    SLEEPY,
} from '../js/const.js';
import { PM_HEALER, PM_WIZARD } from '../js/monsters.js';
import { regen_hp, regen_pw } from '../js/regen.js';

function regenState(role = PM_HEALER) {
    const uprops = [];
    for (const index of [
        ENERGY_REGENERATION,
        MAGICAL_BREATHING,
        REGENERATION,
        SLEEPY,
    ]) {
        uprops[index] = { intrinsic: 0, extrinsic: 0 };
    }
    return {
        moves: 2,
        multi: 0,
        urole: { mnum: role },
        disp: {},
        u: {
            ulevel: 1,
            umoved: true,
            mtimedone: 0,
            uhp: 7,
            uhpmax: 10,
            uen: 2,
            uenmax: 5,
            usleep: 0,
            acurr: { a: [10, 10, 10, 10, 10, 10] },
            abon: [0, 0, 0, 0, 0, 0],
            atemp: [0, 0, 0, 0, 0, 0],
            uprops,
        },
    };
}

test('regen_hp preserves the ordinary source draw and bonuses', () => {
    const state = regenState();
    state.u.acurr.a[A_CON] = 15;
    const bounds = [];
    assert.equal(regen_hp(0, state, {
        random: {
            rn2(bound) {
                bounds.push(bound);
                return 10;
            },
        },
    }), true);
    assert.deepEqual(bounds, [100]);
    assert.equal(state.u.uhp, 8);
    assert.equal(state.disp.botl, true);

    state.u.uprops[REGENERATION].intrinsic = 1;
    state.u.uprops[SLEEPY].intrinsic = 1;
    state.u.usleep = 1;
    assert.equal(regen_hp(0, state, {
        random: { rn2: () => 99 },
    }), true);
    assert.equal(state.u.uhp, 10);
});

test('regen_hp and regen_pw are drawless while already full', () => {
    const state = regenState();
    state.u.uhp = state.u.uhpmax;
    state.u.uen = state.u.uenmax;
    assert.equal(regen_hp(0, state, {
        random: { rn2: () => assert.fail('full HP must not draw') },
    }), false);
    assert.equal(regen_pw(0, state, {
        random: { rn1: () => assert.fail('full PW must not draw') },
    }), false);
});

test('regen_pw uses role cadence and magical-breathing upper bound', () => {
    const ordinary = regenState(PM_HEALER);
    ordinary.moves = 24;
    ordinary.u.acurr.a[A_WIS] = 15;
    ordinary.u.acurr.a[A_INT] = 15;
    const calls = [];
    assert.equal(regen_pw(0, ordinary, {
        random: {
            rn1(range, base) {
                calls.push([range, base]);
                return 2;
            },
        },
    }), true);
    assert.deepEqual(calls, [[3, 1]]);
    assert.equal(ordinary.u.uen, 4);

    const wizard = regenState(PM_WIZARD);
    wizard.moves = 18;
    wizard.u.uprops[MAGICAL_BREATHING].extrinsic = 1;
    const wizardCalls = [];
    assert.equal(regen_pw(0, wizard, {
        random: {
            rn1(range, base) {
                wizardCalls.push([range, base]);
                return 3;
            },
        },
    }), true);
    assert.deepEqual(wizardCalls, [[4, 1]]);
    assert.equal(wizard.u.uen, 5);
});
