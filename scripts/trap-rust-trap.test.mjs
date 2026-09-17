import assert from 'node:assert/strict';
import test from 'node:test';

import {
    RUST_TRAP,
    Trap_Effect_Finished,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GREMLIN, PM_HUMAN } from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import {
    preflight_dotrap,
    trapeffect_selector,
} from '../js/trap_effects.js';

// C ref: trap.c trapeffect_rust_trap() (1594-1727), reached through
// trapeffect_selector() (2936-2992). Character creation is completed so the
// hero's youmonst.data and body_part() inputs are the real runtime values.
const CREATION_PREFIX = 'Dodeco\rn[l"m/hmy';
const SETUP = {
    seed: 12,
    datetime: '20260503045501',
    nethackrc: 'OPTIONS=symset:DECgraphics\n',
};

async function stateReady() {
    await runSegment({ ...SETUP, moves: CREATION_PREFIX });
    return game;
}

function trap(state, tseen = false) {
    return {
        ttyp: RUST_TRAP,
        tseen,
        once: false,
        tx: state.u.ux,
        ty: state.u.uy,
        tnote: 0,
        madeby_u: false,
    };
}

function effectEnv(state, roll) {
    const messages = [];
    const randomCalls = [];
    return {
        state,
        random: {
            rn2(bound) {
                randomCalls.push(bound);
                return bound === 5 ? roll : 1;
            },
        },
        message: async (text) => messages.push(text),
        redraw: () => {},
        unsupported: (reason) => { throw new Error(reason); },
        messages,
        randomCalls,
    };
}

test('preflight_dotrap admits an unseen RUST_TRAP', async () => {
    const state = await stateReady();
    assert.doesNotThrow(() => preflight_dotrap(trap(state), state));
});

test('preflight_dotrap still refuses a seen RUST_TRAP', async () => {
    const state = await stateReady();
    assert.throws(
        () => preflight_dotrap(trap(state, true), state),
        (error) => error.reason === 'a trap the hero has already seen',
    );
});

test('preflight_dotrap still refuses a RUST_TRAP with a steed', async () => {
    const state = await stateReady();
    state.u.usteed = { mx: state.u.ux, my: state.u.uy };
    assert.throws(
        () => preflight_dotrap(trap(state), state),
        (error) => error.reason === 'a steed in a trap',
    );
    state.u.usteed = null;
});

for (const [roll, expected] of [
    [0, 'A gush of water hits you on the head!'],
    [1, 'A gush of water hits your left arm!'],
    [2, 'A gush of water hits your right arm!'],
    [3, 'A gush of water hits you!'],
    [4, 'A gush of water hits you!'],
]) {
    test(`trapeffect_rust_trap hero arm preserves rn2(5) case ${roll}`,
        async () => {
            const state = await stateReady();
            const env = effectEnv(state, roll);
            const result = await trapeffect_selector(
                state.youmonst,
                trap(state),
                0,
                env,
            );
            assert.equal(result, Trap_Effect_Finished);
            assert.deepEqual(env.randomCalls, [5]);
            assert.equal(env.messages[0], expected);
        });
}

test('trapeffect_rust_trap monster arm returns the C finished sentinel',
    async () => {
        const state = await stateReady();
        const monster = newMonster({
            data: state.mons[PM_HUMAN],
            mnum: PM_HUMAN,
            mx: 0,
            my: 0,
            mhp: 10,
            mhpmax: 10,
            minvent: null,
            mw: null,
            mtrapped: false,
        });
        const monsterTrap = {
            ttyp: RUST_TRAP,
            tseen: false,
            once: false,
            tx: monster.mx,
            ty: monster.my,
            madeby_u: false,
        };
        const env = effectEnv(state, 3);
        const result = await trapeffect_selector(
            monster,
            monsterTrap,
            0,
            env,
        );
        assert.equal(result, Trap_Effect_Finished);
        assert.deepEqual(env.randomCalls, [5]);
    });

test('trapeffect_rust_trap wires the monster gremlin split caller',
    async () => {
        const state = await stateReady();
        const monster = newMonster({
            data: state.mons[PM_GREMLIN],
            mnum: PM_GREMLIN,
            mx: 10,
            my: 10,
            mhp: 10,
            mhpmax: 10,
            minvent: null,
            mw: null,
            mtrapped: false,
            mpeaceful: false,
        });
        const monsterTrap = {
            ttyp: RUST_TRAP,
            tseen: false,
            once: false,
            tx: monster.mx,
            ty: monster.my,
            madeby_u: false,
        };
        const env = effectEnv(state, 3);
        const result = await trapeffect_selector(
            monster,
            monsterTrap,
            0,
            env,
        );
        assert.equal(result, Trap_Effect_Finished);
        assert.deepEqual(env.randomCalls, [5, 3]);
        assert.equal(monster.mhp, 5);
        assert.equal(monster.mhpmax, 5);
        assert.ok(
            state.level.monlist !== monster
                && state.level.monlist?.data === state.mons[PM_GREMLIN],
        );
    });
