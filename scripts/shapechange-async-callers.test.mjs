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

    const created = {
        marker: true,
        data: game.mons[PM_DOG],
        minvent: null,
        mw: null,
        mh: null,
        mx: 10,
        my: 10,
    };
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

test('lspo_monster waits for an asynchronous inventory callback', async () => {
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

    const events = [];
    const created = {
        marker: true,
        data: game.mons[PM_DOG],
        minvent: null,
        mw: null,
        mh: null,
        mx: 10,
        my: 10,
    };
    const result = lspo_monster([{
        id: PM_DOG,
        parsedGender: MALE,
        coord: [10, 10],
        inventory() {
            events.push('inventory:start');
            return Promise.resolve().then(() => events.push('inventory:done'));
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
    await result;
    assert.deepEqual(events, ['inventory:start', 'inventory:done']);
});
