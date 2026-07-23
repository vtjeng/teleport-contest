import assert from 'node:assert/strict';
import test from 'node:test';

import { maybeWipeHeroEngraving, u_calc_moveamt } from '../js/allmain.js';
import {
    DUST,
    EXT_ENCUMBER,
    FAST,
    FROMOUTSIDE,
    HVY_ENCUMBER,
    INTRINSIC,
    LEVITATION,
    MOD_ENCUMBER,
    OVERLOADED,
    SLT_ENCUMBER,
    W_ARMF,
} from '../js/const.js';
import { make_engr_at } from '../js/engrave.js';

function movementState(speed = 12, umovement = 0) {
    const uprops = [];
    uprops[FAST] = { intrinsic: 0, extrinsic: 0 };
    return {
        u: { umovement, umoved: false, usteed: null, uprops },
        youmonst: { data: { mmove: speed } },
        context: {},
    };
}

function draws(results) {
    const bounds = [];
    return {
        random(bound) {
            bounds.push(bound);
            assert.ok(results.length, `unexpected rn2(${bound})`);
            return results.shift();
        },
        assertBounds(expected) {
            assert.deepEqual(bounds, expected);
            assert.deepEqual(results, []);
        },
    };
}

function engravingTurnState(dexterity = 13) {
    const uprops = [];
    uprops[LEVITATION] = { intrinsic: 0, extrinsic: 0, blocked: 0 };
    return {
        u: {
            ux: 23,
            uy: 9,
            // Index 3 is Dexterity; the other attributes are inert fixtures.
            acurr: { a: [10, 10, 10, dexterity, 10, 10] },
            abon: [0, 0, 0, 0, 0, 0],
            atemp: [0, 0, 0, 0, 0, 0],
            uprops,
            uswallow: false,
            ustuck: null,
            usteed: null,
            uundetected: false,
        },
        level: { at: () => null },
        head_engr: null,
    };
}

function turnDraws(events) {
    const remaining = [...events];
    const take = (kind, bound) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${kind}(${bound})`);
        assert.deepEqual(expected.slice(0, 2), [kind, bound]);
        if (kind === 'rn2')
            assert.ok(expected[2] >= 0 && expected[2] < bound);
        else
            assert.ok(expected[2] >= 1 && expected[2] <= bound);
        return expected[2];
    };
    return {
        random: {
            rn2: (bound) => take('rn2', bound),
            rnd: (bound) => take('rnd', bound),
        },
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

test('u_calc_moveamt distinguishes intrinsic and very fast movement', () => {
    const intrinsic = movementState();
    intrinsic.u.uprops[FAST].intrinsic = INTRINSIC;
    let script = draws([0]);
    u_calc_moveamt(0, intrinsic, script.random);
    assert.equal(intrinsic.u.umovement, 24);
    script.assertBounds([3]);

    const ordinaryIntrinsicTurn = movementState();
    ordinaryIntrinsicTurn.u.uprops[FAST].intrinsic = FROMOUTSIDE;
    script = draws([1]);
    u_calc_moveamt(0, ordinaryIntrinsicTurn, script.random);
    assert.equal(ordinaryIntrinsicTurn.u.umovement, 12);
    script.assertBounds([3]);

    for (const speedProperty of [
        { intrinsic: 1, extrinsic: 0 },
        { intrinsic: 0, extrinsic: W_ARMF },
    ]) {
        const veryFast = movementState();
        veryFast.u.uprops[FAST] = speedProperty;
        script = draws([1]);
        u_calc_moveamt(0, veryFast, script.random);
        assert.equal(veryFast.u.umovement, 24);
        script.assertBounds([3]);
    }

    const veryFastMiss = movementState();
    veryFastMiss.u.uprops[FAST].extrinsic = W_ARMF;
    script = draws([0]);
    u_calc_moveamt(0, veryFastMiss, script.random);
    assert.equal(veryFastMiss.u.umovement, 12);
    script.assertBounds([3]);
});

test('u_calc_moveamt uses a moved steed instead of hero speed', () => {
    const state = movementState(30, 4);
    const steed = { data: { mmove: 13 }, mspeed: 0 };
    state.u.usteed = steed;
    state.u.umoved = true;
    state.u.uprops[FAST].extrinsic = W_ARMF;
    const script = draws([1]);

    u_calc_moveamt(0, state, script.random);
    assert.equal(state.u.umovement, 16);
    script.assertBounds([12]);

    const stationary = movementState(30, 4);
    stationary.u.usteed = steed;
    u_calc_moveamt(0, stationary, () => {
        assert.fail('a stationary steed must not replace hero speed');
    });
    assert.equal(stationary.u.umovement, 34);
});

test('u_calc_moveamt applies every source encumbrance fraction', () => {
    for (const [capacity, expected] of [
        [0, 16],
        [SLT_ENCUMBER, 12],
        [MOD_ENCUMBER, 8],
        [HVY_ENCUMBER, 4],
        [EXT_ENCUMBER, 2],
        [OVERLOADED, 16],
    ]) {
        const state = movementState(16, 3);
        u_calc_moveamt(capacity, state, () => {
            assert.fail('ordinary speed must not draw');
        });
        assert.equal(state.u.umovement, 3 + expected);
    }

    const clamped = movementState(0, -3);
    u_calc_moveamt(0, clamped);
    assert.equal(clamped.u.umovement, 0);
});

test('maybeWipeHeroEngraving derives its gate from effective Dexterity', () => {
    const state = engravingTurnState(11);
    // +2 permanent and -1 temporary adjustment make effective Dexterity 12,
    // so allmain.c uses 40 + 12 * 3 = 76 for the wear gate.
    state.u.abon[3] = 2;
    state.u.atemp[3] = -1;
    const script = turnDraws([
        ['rn2', 76, 1], // Nonzero skips the rare engraving-wear branch.
    ]);

    assert.equal(maybeWipeHeroEngraving(state, script.random), false);
    script.done();
});

test('maybeWipeHeroEngraving consumes rnd(3) before touching the engraving', () => {
    const state = engravingTurnState();
    make_engr_at(23, 9, '_', null, 0, DUST, {
        state,
        random: {
            rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
            rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
        },
    });
    const script = turnDraws([
        ['rn2', 79, 0], // Dexterity 13 makes the source gate 40 + 13 * 3.
        ['rnd', 3, 1], // Source evaluates the u_wipe_engr() argument first.
        ['rn2', 1, 0], // Select the engraving's only character.
        ['rn2', 4, 3], // Erase its small punctuation mark.
    ]);

    assert.equal(maybeWipeHeroEngraving(state, script.random), true);
    script.done();
    assert.equal(state.head_engr, null);
});

test('maybeWipeHeroEngraving rejects unsupported floor reachability after rnd', () => {
    const state = engravingTurnState();
    state.u.uprops[LEVITATION].intrinsic = 1;
    const script = turnDraws([
        ['rn2', 79, 0], // Enter the rare branch at Dexterity 13.
        ['rnd', 3, 2], // C evaluates rnd(3) before can_reach_floor(TRUE).
    ]);

    assert.throws(
        () => maybeWipeHeroEngraving(state, script.random),
        /unported can_reach_floor state/u,
    );
    script.done();

    // A blocked property does not satisfy NetHack's Levitation macro.
    state.u.uprops[LEVITATION].blocked = 1;
    const blocked = turnDraws([
        ['rn2', 79, 0], // Re-enter the Dexterity-13 rare branch.
        ['rnd', 3, 3], // rnd(3) returns the source range 1 through 3.
    ]);
    assert.equal(maybeWipeHeroEngraving(state, blocked.random), true);
    blocked.done();
});
