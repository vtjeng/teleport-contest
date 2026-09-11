import assert from 'node:assert/strict';
import test from 'node:test';

import {
    M_SEEN_SLEEP,
    SLEEP_RES,
    SLP_GAS_TRAP,
    Trap_Effect_Finished,
    W_ARM,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { canSeeMonster } from '../js/startup_a11y.js';
import { defended } from '../js/mondata.js';
import { newMonster, place_monster } from '../js/monst.js';
import {
    AD_FIRE,
    AD_SLEE,
    PM_JACKAL,
    PM_ORANGE_DRAGON,
} from '../js/monsters.js';
import { ORANGE_DRAGON_SCALE_MAIL } from '../js/objects.js';
import { trapeffect_selector } from '../js/trap_effects.js';

// Fixed wall-clock input keeps startup independent of the host date.
const DATETIME = '20310203040506';
const RC = [
    'OPTIONS=name:GasProbe,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

async function hero() {
    await runSegment({
        // Independent startup seed; it gives the tests a stable initialized map.
        seed: 7710044,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    game.level.traps = [];
    game.unported?.clear();
    return game;
}

function trapAt(x, y) {
    return { tx: x, ty: y, ttyp: SLP_GAS_TRAP, tseen: false };
}

function effectEnv(state, rndValue = 7) {
    const bounds = [];
    const messages = [];
    return {
        state,
        bounds,
        messages,
        random: {
            rnd(bound) {
                bounds.push(bound);
                return rndValue;
            },
        },
        message: async (line) => messages.push(line),
        redraw: () => {},
        unsupported: (reason) => { throw new Error(reason); },
    };
}

test('defended covers adult dragons and worn dragon scale mail', async () => {
    const state = await hero();
    // Adult dragons use their species-indexed scale type in C defended().
    const dragon = newMonster({
        data: state.mons[PM_ORANGE_DRAGON],
        mnum: PM_ORANGE_DRAGON,
        mw: null,
        minvent: null,
    });
    assert.equal(defended(dragon, AD_SLEE, state), true);
    assert.equal(defended(dragon, AD_FIRE, state), false);

    // Ordinary monsters use the worn W_ARM object for the same check.
    const mail = {
        otyp: ORANGE_DRAGON_SCALE_MAIL,
        oartifact: 0,
        owornmask: W_ARM,
        nobj: null,
    };
    const wearer = newMonster({
        data: state.mons[PM_JACKAL],
        mnum: PM_JACKAL,
        mw: null,
        minvent: mail,
    });
    assert.equal(defended(wearer, AD_SLEE, state), true);
});

test('sleep gas trap envelops a sleep-resistant hero without rolling', async () => {
    const state = await hero();
    state.u.uprops[SLEEP_RES] = { intrinsic: 1, extrinsic: 0 };
    const trap = trapAt(state.u.ux, state.u.uy);
    const env = effectEnv(state);

    assert.equal(
        await trapeffect_selector(state.youmonst, trap, 0, env),
        Trap_Effect_Finished,
    );
    assert.deepEqual(env.bounds, []);
    assert.deepEqual(env.messages, ['You are enveloped in a cloud of gas!']);
    assert.equal(trap.tseen, true);
    assert.equal(game.unported.has('trap.c steedintrap'), true);
});

test('sleep gas trap puts a susceptible hero to sleep for rnd(25) turns', async () => {
    const state = await hero();
    const trap = trapAt(state.u.ux, state.u.uy);
    const env = effectEnv(state, 7);

    assert.equal(
        await trapeffect_selector(state.youmonst, trap, 0, env),
        Trap_Effect_Finished,
    );
    assert.deepEqual(env.bounds, [25]);
    assert.deepEqual(env.messages, ['A cloud of gas puts you to sleep!']);
    assert.equal(state.multi, -7);
    assert.equal(state.u.usleep, state.moves);
    assert.equal(state.multi_reason, 'sleeping');
    assert.equal(trap.tseen, true);
    assert.equal(game.unported.has('trap.c steedintrap'), true);
});

test('sleep gas trap freezes a visible monster after ending its meal', async () => {
    const state = await hero();
    // The square immediately west of the fresh hero is an empty visible floor
    // square for this independent startup seed.
    const x = state.u.ux - 1;
    const y = state.u.uy;
    const monster = newMonster({
        data: state.mons[PM_JACKAL],
        mnum: PM_JACKAL,
        m_id: 901, // Arbitrary positive monster identity for this test.
        mhp: 20, // Positive hit points are required by place_monster().
        mhpmax: 20,
        mcanmove: true,
        mcansee: true,
        meating: 6, // C finish_meating() clears an active six-turn meal.
        mx: x,
        my: y,
    });
    place_monster(monster, x, y, state);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    const trap = trapAt(x, y);
    const env = effectEnv(state, 12);

    assert.equal(canSeeMonster(monster, state), true);
    assert.equal(
        await trapeffect_selector(monster, trap, 0, env),
        Trap_Effect_Finished,
    );
    assert.deepEqual(env.bounds, [25]);
    assert.deepEqual(env.messages, ['The jackal suddenly falls asleep!']);
    assert.equal(monster.meating, 0);
    assert.equal(monster.mcanmove, false);
    assert.equal(monster.mfrozen, 12);
    assert.equal(monster.msleeping, false);
    assert.equal(trap.tseen, true);
});

test('sleep gas trap ignores an already helpless monster without rolling', async () => {
    const state = await hero();
    // Use the same empty adjacent square as the visible-monster case.
    const x = state.u.ux - 1;
    const y = state.u.uy;
    const monster = newMonster({
        data: state.mons[PM_JACKAL],
        mnum: PM_JACKAL,
        m_id: 902, // Distinct arbitrary positive monster identity.
        mhp: 20, // Positive hit points are required by place_monster().
        mhpmax: 20,
        mcanmove: false,
        mcansee: true,
        mx: x,
        my: y,
    });
    place_monster(monster, x, y, state);
    const trap = trapAt(x, y);
    const env = effectEnv(state);

    assert.equal(
        await trapeffect_selector(monster, trap, 0, env),
        Trap_Effect_Finished,
    );
    assert.deepEqual(env.bounds, []);
    assert.deepEqual(env.messages, []);
    assert.equal(trap.tseen, false);
    assert.equal(monster.mcanmove, false);
    assert.equal(monster.seen_resistance & M_SEEN_SLEEP, 0);
});
