import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CON,
    A_INT,
    A_WIS,
    ENERGY_REGENERATION,
    MAGICAL_BREATHING,
    MOD_ENCUMBER,
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

// allmain.c regen_hp() heals when `u.ulevel + ACURR(A_CON) > rn2(100)`, so the
// threshold is the sum and the draw is the only randomness. Level 1 with
// Constitution 15 gives 16: a draw of 15 heals and a draw of 16 does not.
test('regen_hp heals on the level and Constitution sum alone', async () => {
    const heals = async (configure) => {
        const state = regenState();
        state.u.acurr.a[A_CON] = 15;
        configure?.(state);
        const bounds = [];
        const healed = await regen_hp(0, state, {
            random: {
                rn2(bound) {
                    bounds.push(bound);
                    return state.draw;
                },
            },
        });
        assert.deepEqual(bounds, [100], 'the draw is always rn2(100)');
        return healed && state.u.uhp === 8;
    };

    assert.equal(await heals((state) => { state.draw = 15; }), true);
    assert.equal(await heals((state) => { state.draw = 16; }), false);
    // A higher experience level raises the same threshold, so a heal that
    // ignored ulevel would pass the pair above and fail here.
    assert.equal(
        await heals((state) => { state.u.ulevel = 3; state.draw = 17; }), true);
    assert.equal(
        await heals((state) => { state.u.ulevel = 3; state.draw = 18; }), false);
    // ACURR sums acurr, abon and atemp, so a bonus point moves the threshold
    // by one. Reading raw acurr would leave both of these unchanged.
    assert.equal(
        await heals((state) => { state.u.abon[A_CON] = 1; state.draw = 16; }),
        true);
    assert.equal(
        await heals((state) => { state.u.atemp[A_CON] = 1; state.draw = 16; }),
        true);
});

test('regen_hp adds each bonus and clamps at the maximum', async () => {
    const state = regenState();
    state.u.uhpmax = 20;
    state.u.uprops[REGENERATION].intrinsic = 1;
    state.u.uprops[SLEEPY].intrinsic = 1;
    state.u.usleep = 1;

    // One point from the draw, one from Regeneration, one from sleep. A
    // maximum above the sum is what makes the total observable.
    assert.equal(await regen_hp(0, state, { random: { rn2: () => 0 } }), true);
    assert.equal(state.u.uhp, 10);
    assert.equal(state.disp.botl, true);

    // uhp + heal overshoots uhpmax, so the clamp is the only thing that can
    // produce the maximum.
    state.u.uhp = 19;
    assert.equal(await regen_hp(0, state, {
        random: { rn2: () => 0 },
        interruptMulti: () => {},
    }), true);
    assert.equal(state.u.uhp, 20);
});

test('regen_hp respects the encumbrance gate at its boundary', async () => {
    // encumbrance_ok is `wtcap < MOD_ENCUMBER || !u.umoved`, so the boundary
    // value with a hero who moved suppresses the draw entirely.
    const moved = regenState();
    assert.equal(await regen_hp(MOD_ENCUMBER, moved, {
        random: { rn2: () => assert.fail('an encumbered mover must not draw') },
    }), false);
    assert.equal(moved.u.uhp, 7);

    const still = regenState();
    still.u.umoved = false;
    const bounds = [];
    assert.equal(await regen_hp(MOD_ENCUMBER, still, {
        random: { rn2(bound) { bounds.push(bound); return 0; } },
    }), true);
    assert.deepEqual(bounds, [100]);

    // Regeneration passes the gate on its own, which is the other half of
    // `if (!encumbrance_ok && !regeneration) return false`.
    const regenerating = regenState();
    regenerating.u.uprops[REGENERATION].intrinsic = 1;
    assert.equal(await regen_hp(MOD_ENCUMBER, regenerating, {
        random: { rn2: () => 99 },
    }), true);
    assert.equal(regenerating.u.uhp, 8);
});

test('regen_hp and regen_pw are drawless while already full', async () => {
    const state = regenState();
    state.u.uhp = state.u.uhpmax;
    state.u.uen = state.u.uenmax;
    // 24 is the level-1 Healer cadence, so the turn would otherwise draw and
    // fullness is the only condition left to suppress it.
    state.moves = 24;
    assert.equal(await regen_hp(0, state, {
        random: { rn2: () => assert.fail('full HP must not draw') },
    }), false);
    assert.equal(await regen_pw(0, state, {
        random: { rn1: () => assert.fail('full PW must not draw') },
    }), false);
});

test('regen_pw draws only on the role cadence', async () => {
    // trunc((MAXULEV + 8 - ulevel) * 4 / 6) is 24 for a level-1 Healer, so 23
    // and 25 are the turns either side of a cadence hit.
    for (const moves of [23, 25]) {
        const offCadence = regenState();
        offCadence.moves = moves;
        assert.equal(await regen_pw(0, offCadence, {
            random: { rn1: () => assert.fail(`turn ${moves} must not draw`) },
        }), false);
        assert.equal(offCadence.u.uen, 2);
        assert.equal(offCadence.disp.botl, undefined);
    }
});

test('regen_pw draws off the cadence with Energy_regeneration', async () => {
    // C's macro is HEnergy_regeneration || EEnergy_regeneration, so either
    // source alone bypasses both the cadence and the encumbrance test.
    for (const source of ['intrinsic', 'extrinsic']) {
        const state = regenState();
        state.moves = 23;
        state.u.uprops[ENERGY_REGENERATION][source] = 1;
        const calls = [];
        assert.equal(await regen_pw(0, state, {
            random: { rn1(range, base) { calls.push([range, base]); return 2; } },
        }), true);
        assert.equal(calls.length, 1, `${source} Energy_regeneration draws once`);
        assert.equal(state.u.uen, 4);
    }

    const without = regenState();
    without.moves = 23;
    assert.equal(await regen_pw(0, without, {
        random: { rn1: () => assert.fail('no property means no off-cadence draw') },
    }), false);
});

test('regen_pw uses role cadence and magical-breathing upper bound',
    async () => {
    const ordinary = regenState(PM_HEALER);
    ordinary.moves = 24;
    ordinary.u.acurr.a[A_WIS] = 15;
    ordinary.u.acurr.a[A_INT] = 15;
    const calls = [];
    assert.equal(await regen_pw(0, ordinary, {
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
    assert.equal(await regen_pw(0, wizard, {
        random: {
            rn1(range, base) {
                wizardCalls.push([range, base]);
                return 3;
            },
        },
        // This draw fills the hero's power, which reaches interrupt_multi().
        interruptMulti: () => {},
    }), true);
    assert.deepEqual(wizardCalls, [[4, 1]]);
    assert.equal(wizard.u.uen, 5);

    // uen + the draw overshoots uenmax, so the clamp is what produces the
    // maximum rather than the arithmetic landing on it.
    const clamped = regenState(PM_HEALER);
    clamped.moves = 24;
    clamped.u.uen = 4;
    assert.equal(await regen_pw(0, clamped, {
        random: { rn1: () => 3 },
        interruptMulti: () => {},
    }), true);
    assert.equal(clamped.u.uen, 5);
});

// The seam each regenerator hands interrupt_multi(). regen_hp() reaches it in
// the running game; regen_pw() cannot, because nothing ported lowers u.uen, so
// this pair is the only proof its half is wired the same way.
test('reaching full forwards the message owner to interrupt_multi',
    async () => {
        for (const [kind, configure, expected] of [
            ['hp', (state) => { state.u.uhp = state.u.uhpmax - 1; },
                'You are in full health.'],
            ['pw', (state) => {
                state.moves = 24;
                state.u.uen = state.u.uenmax - 1;
            }, 'You feel full of energy.'],
        ]) {
            const state = regenState(PM_HEALER);
            configure(state);
            const seen = [];
            const norepMessage = async () => {};
            const env = {
                // A draw of 0 heals one hit point; rn1(upper, 1) returns at
                // least 1 power point either way.
                random: { rn2: () => 0, rn1: () => 1 },
                interruptMulti: (message, target, interruptEnv) => {
                    seen.push([message, target, interruptEnv.norepMessage]);
                },
                norepMessage,
            };
            assert.equal(
                await (kind === 'hp' ? regen_hp : regen_pw)(0, state, env),
                true,
                kind,
            );
            assert.deepEqual(seen, [[expected, state, norepMessage]], kind);
        }
    });

// C reaches interrupt_multi() from inside regen_hp() and regen_pw(), and does
// not leave either of them until Norep() has written its line. The port's
// Norep() owner is awaitable and can stop for a --More--, so each regenerator
// has to hold its own completion until the interruption it started finishes.
// One that resolved first would let allmain.c's next statement -- the
// overexertion block after regen_hp(), the automatic search after regen_pw() --
// run while the line it owes is still in flight.
test('a regenerator resolves only after its interruption does', async () => {
    for (const [kind, configure] of [
        ['hp', (state) => { state.u.uhp = state.u.uhpmax - 1; }],
        // 24 is the level-1 Healer cadence, so this is a turn regen_pw()
        // draws on.
        ['pw', (state) => {
            state.moves = 24;
            state.u.uen = state.u.uenmax - 1;
        }],
    ]) {
        const state = regenState(PM_HEALER);
        configure(state);
        let release;
        const interruption = new Promise((resolve) => { release = resolve; });
        let settled = false;
        const regenerating = (kind === 'hp' ? regen_hp : regen_pw)(0, state, {
            // A draw of 0 heals one hit point; rn1(upper, 1) returns at least
            // one power point. Either takes the hero to the maximum from one
            // below it, which is what reaches the interruption.
            random: { rn2: () => 0, rn1: () => 1 },
            interruptMulti: () => interruption,
            norepMessage: async () => {},
        }).then(() => { settled = true; });
        // setImmediate runs after every microtask already queued, so a
        // regenerator that dropped its await has settled by the time this
        // resolves however many turns its own promise chain needed.
        await new Promise((resolve) => { setImmediate(resolve); });
        assert.equal(settled, false, kind);
        release();
        await regenerating;
        assert.equal(settled, true, kind);
    }
});
