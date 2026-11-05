// eat.c eye_of_newt_buzz() reports its energy gain through pline.c
// You_feel(), which dreams the feeling while the hero is Unaware
// (youprop.h:399: multi < 0 and unconscious or fainted).  A recorded game
// reaches this only when hunger fainting interrupts a newt meal, which needs
// about a thousand turns of starvation and a faint on the meal's turn, so
// these tests pin both wordings directly.

import assert from 'node:assert/strict';
import test from 'node:test';

import { FAINTED, NOT_HUNGRY } from '../js/const.js';
import { eye_of_newt_buzz } from '../js/eat.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';

async function hero() {
    // Independent Wizard setup; only its energy and hunger fields matter.
    await runSegment({ seed: 3170522, datetime: '20250611090000', moves: '',
        nethackrc: 'OPTIONS=name:Newt,role:Wizard,race:elf,gender:female,align:chaotic\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n' });
    game.u.uen = 1; // Below uenmax, so any rnd(3) gain changes it.
    game.u.uenmax = 10; // 3 * 1 <= 2 * 10 also admits the gain.
    return game;
}

async function buzz(state) {
    const messages = [];
    await eye_of_newt_buzz(state, {
        random: {
            rn2: () => 1, // eat.c:1106 rn2(3) nonzero: the gain is offered.
            rnd: () => 2, // eat.c:1109 rnd(3): uen 1 -> 3, still below max.
        },
        message: async (text) => { messages.push(text); },
    });
    return messages;
}

test('eye_of_newt_buzz dreams the buzz while fainted', async () => {
    const state = await hero();
    state.multi = -3; // A hunger faint's negative multi.
    state.u.uhs = FAINTED; // eat.c is_fainted().
    assert.deepEqual(await buzz(state), ['You dream that you feel a mild buzz.']);
    assert.equal(state.u.uen, 3);
});

test('eye_of_newt_buzz feels the buzz when aware', async () => {
    const state = await hero();
    state.multi = 0; // Not helpless, so not Unaware even if fainted status lingers.
    state.u.uhs = NOT_HUNGRY;
    assert.deepEqual(await buzz(state), ['You feel a mild buzz.']);
});
