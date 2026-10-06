import assert from 'node:assert/strict';
import test from 'node:test';

import { A_CON, A_STR, FINGER, FROMOUTSIDE, HALF_PHDAM, NO_PART, STUNNED, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { b_trapped } from '../js/trap.js';

async function hero(depth = 1) {
    // Independent Wizard setup; the helper reads dungeon depth for damage.
    await runSegment({ seed: 1140617, datetime: '20741006120000', moves: '',
        nethackrc: 'OPTIONS=name:TrapTest,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics\n' });
    game.u.uz.dlevel = depth;
    game.u.uhp = game.u.uhpmax = 50; // Survive every damage roll under test.
    game.u.aexe[A_STR] = game.u.aexe[A_CON] = 0;
    game.u.uprops[STUNNED].intrinsic = 0;
    return game;
}

test('b_trapped awaits the explosion message before damage and exercise', async () => {
    const state = await hero();
    const draws = [];
    let release;
    let reached;
    const entered = new Promise(resolve => { reached = resolve; });
    const pending = b_trapped('tin', NO_PART, state, {
        random: {
            rnd(bound) { draws.push(['rnd', bound]); return 6; }, // trap.c:6697, level 1.
            rn2(bound) { draws.push(['rn2', bound]); return 1; }, // Strength exercise.
        },
        async message(text) {
            if (text.startsWith('KABOOM')) {
                assert.equal(text, 'KABOOM!!  The tin was booby-trapped!');
                reached();
                await new Promise(resolve => { release = resolve; });
            }
        },
        encumberMessage: async () => {},
    });
    await entered;
    assert.equal(state.u.uhp, 50);
    assert.equal(state.u.aexe[A_STR], 0);
    assert.equal(state.u.uprops[STUNNED].intrinsic, 0);
    assert.deepEqual(draws, [['rnd', 6]]);
    release();
    await pending;
    assert.deepEqual(draws, [['rnd', 6], ['rn2', 2]]);
    assert.equal(state.u.uhp, 44);
    assert.equal(state.u.aexe[A_STR], -1);
    assert.equal(state.u.aexe[A_CON], 0); // NO_PART skips Constitution.
    assert.equal(state.u.uprops[STUNNED].intrinsic & TIMEOUT, 6);
});

test('b_trapped halves physical damage but adds the full roll to existing stun', async () => {
    const state = await hero(7); // 5+(2+floor(7/2)) gives a damage bound of 10.
    state.u.uprops[HALF_PHDAM].intrinsic = FROMOUTSIDE;
    state.u.uprops[STUNNED].intrinsic = FROMOUTSIDE | 2; // Preserve the non-timeout source.
    const draws = [];
    const messages = [];
    await b_trapped('door', FINGER, state, {
        random: {
            rnd(bound) { draws.push(['rnd', bound]); return 5; }, // Odd damage halves to 3.
            rn2(bound) { draws.push(['rn2', bound]); return 1; },
        },
        message: async text => { messages.push(text); },
        encumberMessage: async () => {},
    });
    assert.deepEqual(draws, [['rnd', 10], ['rn2', 2], ['rn2', 2]]);
    assert.equal(state.u.uhp, 47);
    assert.equal(state.u.aexe[A_STR], -1);
    assert.equal(state.u.aexe[A_CON], -1); // FINGER exercises both attributes.
    assert.equal(state.u.uprops[STUNNED].intrinsic, FROMOUTSIDE | 7);
    assert.deepEqual(messages, ['KABOOM!!  The door was booby-trapped!']); // Already stunned.
});
