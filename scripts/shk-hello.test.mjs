// role.c Hello(mtmp) greets a Samurai with "Irasshaimase" only when the
// speaker's current form is a shopkeeper. shk.c shk_chat() 5546-5562 and
// shk_move() 4903-4931 pass the following shopkeeper, who may have been
// polymorphed (sounds.c domonnoise() keeps MS_SELL for an isshk monster,
// "even polymorphed"), so a polymorphed keeper says "Konnichi wa".
// recordings/shk.c/post53-following-nymph-harp reaches the shk_move lines
// with a Wizard; no recording reaches them with a Samurai.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ROOMOFFSET } from '../js/const.js';
import { resetGame } from '../js/gstate.js';
import {
    monst_globals_init,
    PM_SHOPKEEPER,
    PM_WOOD_NYMPH,
} from '../js/monsters.js';
import { Hello } from '../js/role_init.js';
import { roles } from '../js/roles.js';
import { shk_chat } from '../js/shk.js';

const MONS = monst_globals_init({});
const SAMURAI = roles.find((role) => role.name.m === 'Samurai');

// A peaceful shopkeeper following its debtor (eshk.following, with the
// hero's own name as customer) is shk_chat()'s "Didn't you forget to pay?"
// arm. `form` is the monster's current permonst.
function followingKeeper(form) {
    return {
        data: MONS[form],
        isshk: true,
        mpeaceful: true,
        mcanmove: true,
        msleeping: false,
        mextra: {
            eshk: {
                shoproom: ROOMOFFSET,
                following: 1,
                customer: 'Taro',
                billct: 0,
                debit: 0,
                credit: 0,
                robbed: 0,
            },
        },
    };
}

async function chatLines(form) {
    const state = resetGame();
    state.urole = SAMURAI;
    state.plname = 'Taro';
    const lines = [];
    await shk_chat(followingKeeper(form), state, {
        message: async (line) => { lines.push(line); },
    });
    return lines;
}

test('a Samurai hears Irasshaimase from a shopkeeper-form keeper', async () => {
    assert.deepEqual(await chatLines(PM_SHOPKEEPER),
        ['"Irasshaimase Taro!  Didn\'t you forget to pay?"']);
});

test('a Samurai hears Konnichi wa from a keeper polymorphed into a nymph', async () => {
    // A wood nymph (MS_SEDUCE) is above MS_ANIMAL, so muteshk() lets it speak.
    assert.deepEqual(await chatLines(PM_WOOD_NYMPH),
        ['"Konnichi wa Taro!  Didn\'t you forget to pay?"']);
});

test('Hello() reads the speaker form, as role.c does', () => {
    // No speaker (the game's own welcome) takes the non-shopkeeper word.
    assert.equal(Hello(SAMURAI), 'Konnichi wa');
    assert.equal(Hello(SAMURAI, { data: MONS[PM_SHOPKEEPER] }), 'Irasshaimase');
});
