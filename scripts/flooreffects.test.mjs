import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    CORR,
    IN_SIGHT,
    LAVAPOOL,
    OBJ_FLOOR,
    OBJ_FREE,
    PIT,
    POOL,
    ROOM,
} from '../js/const.js';
import { flooreffects } from '../js/do.js';
import { GameMap } from '../js/game.js';
import { init_objects } from '../js/o_init.js';
import {
    BOULDER,
    POTION_CLASS,
    POT_WATER,
    ROCK,
    ROCK_CLASS,
} from '../js/objects.js';

const DROP_X = 12;
const DROP_Y = 8;
const AWAY_X = 30;
const AWAY_Y = 3;

function fixture({
    typ = ROOM, temperature = 0, monMoving = false, seen = true,
} = {}) {
    const level = new GameMap();
    level.at(DROP_X, DROP_Y).typ = typ;
    level.flags.temperature = temperature;
    const state = {
        level,
        context: { mon_moving: monMoving },
        flags: { verbose: true },
        u: {
            ux: AWAY_X,
            uy: AWAY_Y,
            utrap: 0,
            utraptype: 0,
            uinwater: false,
            luck: 0,
        },
        viz_array: Array.from({ length: 21 }, () => new Array(80).fill(0)),
    };
    state.level.traps = [];
    if (seen) state.viz_array[DROP_Y][DROP_X] = IN_SIGHT;
    init_objects(state, () => 0);
    return state;
}

function object(overrides = {}) {
    return {
        otyp: ROCK,
        oclass: ROCK_CLASS,
        where: OBJ_FREE,
        globby: false,
        nobj: {},
        nexthere: {},
        ...overrides,
    };
}

async function land(state, obj, x = DROP_X, y = DROP_Y, env = {}) {
    return flooreffects(obj, x, y, 'fall', { state, ...env });
}

test('flooreffects answers FALSE on an ordinary floor and clears links', async () => {
    const state = fixture();
    const obj = object();
    assert.equal(await land(state, obj), false);
    assert.equal(obj.nobj, null);
    assert.equal(obj.nexthere, null);
    assert.deepEqual(state.gb.bhitpos, undefined);
});

test('flooreffects keeps ordinary corridor and altar arms source gated', async () => {
    assert.equal(await land(fixture({ typ: CORR }), object({
        otyp: POT_WATER, oclass: POTION_CLASS,
    })), false);
    assert.equal(await land(fixture({ typ: ALTAR }), object()), false);
    assert.equal(await land(fixture({
        typ: ALTAR, monMoving: true, seen: false,
    }), object()), false);
});

test('boulder_hits_pool fills a visible pool using its single rn2(10)', async () => {
    const state = fixture({ typ: POOL });
    const boulder = object({ otyp: BOULDER });
    const calls = [];
    const result = await land(state, boulder, DROP_X, DROP_Y, {
        random: { rn2: (n) => { calls.push(n); return 1; } },
        message: async () => {},
        newsym: () => {},
        wakeNear: async () => {},
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [10]);
    assert.equal(state.level.at(DROP_X, DROP_Y).typ, ROOM);
    assert.notEqual(boulder.where, OBJ_FREE);
});

test('boulder_hits_pool sinks in lava on rn2(10) zero and consumes the boulder', async () => {
    const state = fixture({ typ: LAVAPOOL });
    const boulder = object({ otyp: BOULDER });
    const calls = [];
    assert.equal(await land(state, boulder, DROP_X, DROP_Y, {
        random: {
            rn2: (n) => { calls.push(n); return 0; },
            rnd: () => 1,
            d: () => 1,
        },
        message: async () => {},
        newsym: () => {},
        wakeNear: async () => {},
    }), true);
    assert.deepEqual(calls, [10]);
    assert.notEqual(boulder.where, OBJ_FREE);
});

test('hot ground breaks an unresisting potion after the source survival draw', async () => {
    const state = fixture({ temperature: 1 });
    const potion = object({ otyp: POT_WATER, oclass: POTION_CLASS });
    const calls = [];
    const result = await land(state, potion, DROP_X, DROP_Y, {
        random: {
            rn2: (n) => { calls.push(n); return n === 100 ? 99 : 99; },
            rnd: () => 1,
        },
        message: async () => {},
    });
    assert.equal(result, true);
    assert.deepEqual(calls, [100, 100]);
    assert.notEqual(potion.where, OBJ_FREE);
});

test('the hero pit arm remains conditional on a seen trap beneath the hero', async () => {
    const underHero = fixture();
    underHero.u.ux = DROP_X;
    underHero.u.uy = DROP_Y;
    underHero.u.utrap = 1;
    underHero.u.utraptype = PIT;
    underHero.level.traps = [{
        ttyp: PIT, tx: DROP_X, ty: DROP_Y, tseen: true,
    }];
    assert.equal(await land(underHero, object()), false);
    const elsewhere = fixture();
    elsewhere.level.traps = [{
        ttyp: PIT, tx: DROP_X, ty: DROP_Y, tseen: true,
    }];
    assert.equal(await land(elsewhere, object()), false);
});

test('flooreffects rejects an object that is not free', async () => {
    await assert.rejects(
        () => land(fixture(), object({ where: OBJ_FLOOR })),
        /flooreffects: obj not free/u,
    );
});
