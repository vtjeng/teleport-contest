import assert from 'node:assert/strict';
import test from 'node:test';

import { MALE } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { lspo_monster } from '../js/mklev.js';
import { PM_DOG, monst_globals_init } from '../js/monsters.js';
import { d, rn1, rn2, rnd, rne, rnz } from '../js/rng.js';

test('lspo_monster waits for async creation before custom inventory', async () => {
    resetGame();
    monst_globals_init(game);
    game.level = new GameMap();
    game.u = {
        ux: 10,
        uy: 10,
        uz: { dnum: 0, dlevel: 1 },
        ualign: { type: 0 },
        ualignbase: { 0: 0 },
    };

    const created = { marker: true, minvent: null };
    let inventoryMonster = null;
    const callbackError = new Error('inventory callback reached');
    const result = lspo_monster([{
        id: PM_DOG,
        parsedGender: MALE,
        coord: [10, 10],
        inventory(monster) {
            inventoryMonster = monster;
            throw callbackError;
        },
    }], null, {
        state: game,
        random: { d, rn1, rn2, rnd, rne, rnz },
        hooks: {
            createMonster() {
                return Promise.resolve(created);
            },
        },
    });

    assert.equal(typeof result?.then, 'function');
    await assert.rejects(result, (error) => error === callbackError);
    assert.equal(inventoryMonster, created);
});
