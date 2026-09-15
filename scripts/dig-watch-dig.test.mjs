import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE,
    DEAF,
    D_CLOSED,
    DOOR,
    ROOM,
    VWALL,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { watch_dig, watchman_canseeu } from '../js/dig.js';
import { newMonster } from '../js/monst.js';
import { PM_WATCHMAN } from '../js/monsters.js';

function visibleState(typ = VWALL) {
    const level = new GameMap();
    level.flags.has_town = true;
    level.at(10, 10).typ = typ;
    if (typ === DOOR) level.at(10, 10).doormask = D_CLOSED;
    const viz = Array.from({ length: 21 }, () => []);
    viz[10][9] = COULD_SEE;
    return {
        level,
        u: {
            ux: 10,
            uy: 10,
            uinwater: false,
            uprops: [],
        },
        viz_array: viz,
        context: { digging: { warned: false } },
    };
}

function watchman(overrides = {}) {
    return newMonster({
        data: { pmidx: PM_WATCHMAN },
        mcansee: true,
        mpeaceful: true,
        mx: 9,
        my: 10,
        ...overrides,
    });
}

test('watchman_canseeu follows the four source conjuncts', () => {
    const state = visibleState();
    const guard = watchman();
    assert.equal(watchman_canseeu(guard, state), true);
    assert.equal(
        watchman_canseeu(watchman({ mpeaceful: false }), state), false,
    );
    assert.equal(
        watchman_canseeu(watchman({ mcansee: false }), state), false,
    );
    assert.equal(
        watchman_canseeu({ data: { pmidx: 0 }, mcansee: true,
            mpeaceful: true, mx: 9, my: 10 }, state),
        false,
    );
    state.viz_array[10][9] = 0;
    assert.equal(watchman_canseeu(guard, state), false);
});

test('watch_dig warns once, then arrests on the next dig', async () => {
    const state = visibleState(DOOR);
    const guard = watchman();
    const lines = [];
    const angerCalls = [];
    const env = {
        state,
        message: async (line) => lines.push(line),
        getIterMons: (predicate, owner) => predicate(guard) ? guard : null,
        angryGuards: async (silent, owner) => angerCalls.push({ silent, owner }),
    };

    await watch_dig(null, 10, 10, false, env);
    assert.deepEqual(lines, ['"Hey, stop damaging that door!"']);
    assert.equal(state.context.digging.warned, true);
    assert.equal(state.gv.voice.tone, 0);
    assert.equal(state.gv.voice.volume, 80);
    assert.deepEqual(angerCalls, []);

    await watch_dig(null, 10, 10, false, env);
    assert.deepEqual(lines, [
        '"Hey, stop damaging that door!"',
        '"Halt, vandal!  You\'re under arrest!"',
    ]);
    assert.equal(angerCalls.length, 1);
    assert.equal(angerCalls[0].silent, false);
    assert.equal(angerCalls[0].owner.state, state);
});

test('watch_dig uses the explicit guard and deaf arrest argument', async () => {
    const state = visibleState();
    state.u.uprops[DEAF] = { intrinsic: 1, extrinsic: 0 };
    const guard = watchman();
    const lines = [];
    let selected = false;
    let silent;
    await watch_dig(guard, 10, 10, true, {
        state,
        message: async (line) => lines.push(line),
        getIterMons: () => {
            selected = true;
            return null;
        },
        angryGuards: async (value) => { silent = value; },
    });
    assert.equal(selected, false);
    assert.deepEqual(lines, ['"Halt, vandal!  You\'re under arrest!"']);
    assert.equal(silent, true);
});

test('watch_dig leaves non-town terrain untouched', async () => {
    const state = visibleState(ROOM);
    const lines = [];
    await watch_dig(null, 10, 10, true, {
        state,
        message: async (line) => lines.push(line),
        getIterMons: () => { throw new Error('non-town square selected guard'); },
    });
    assert.deepEqual(lines, []);
});
