import assert from 'node:assert/strict';
import test from 'node:test';

import { FIRE_RES, ROWNO, COLNO, ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    meatcorpse,
    meatmetal,
    mon_give_prop,
    mpickgold,
} from '../js/mon.js';
import {
    PM_HUMAN,
    PM_PURPLE_WORM,
    PM_ROCK_MOLE,
    monst_globals_init,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject, place_object } from '../js/obj.js';
import {
    CORPSE,
    GOLD_PIECE,
    IRON_CHAIN,
    objects_globals_init,
} from '../js/objects.js';

function makeState() {
    const state = {
        context: {
            achieveo: { mines_prize_oid: 0, soko_prize_oid: 0 },
        },
        flags: { verbose: false },
        level: new GameMap(),
        u: {
            uprops: [],
            ux: 5,
            uy: 5,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
    objects_globals_init(state);
    monst_globals_init(state);
    for (const column of state.level.locations)
        for (const location of column) location.typ = ROOM;
    state.viz_array = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
    return state;
}

function random() {
    return {
        rn2: () => 5,
        rnd: (bound) => bound,
        rn1: (count, base) => base,
        rne: () => 1,
    };
}

function monster(state, pmidx) {
    return newMonster({
        data: state.mons[pmidx],
        mhp: 20,
        mhpmax: 20,
        mcanmove: true,
        mcansee: true,
        mx: 5,
        my: 5,
        mnum: pmidx,
    });
}

function floorObject(state, otyp, overrides = {}) {
    const type = state.objects[otyp];
    const obj = newObject({
        oclass: type.oc_class,
        otyp,
        owt: type.oc_weight,
        quan: 1,
        ...overrides,
    });
    place_object(obj, 5, 5, { state, random: random() });
    return obj;
}

test('meatmetal consumes the first acceptable metallic object', async () => {
    const state = makeState();
    const mole = monster(state, PM_ROCK_MOLE);
    const chain = floorObject(state, IRON_CHAIN);

    assert.equal(
        await meatmetal(mole, { state, random: random() }),
        1,
    );
    assert.notEqual(chain.where, 1); // OBJ_FLOOR; delobj() marks it deleted.
    assert.equal(state.level.objects[5][5], null);
});

test('meatcorpse consumes one ordinary corpse and leaves the monster alive', async () => {
    const state = makeState();
    const worm = monster(state, PM_PURPLE_WORM);
    const corpse = floorObject(state, CORPSE, { corpsenm: PM_HUMAN });

    assert.equal(
        await meatcorpse(worm, { state, random: random() }),
        1,
    );
    assert.notEqual(corpse.where, 1); // OBJ_FLOOR; delobj() marks it deleted.
    assert.equal(worm.mhp, 20);
});

test('mon_give_prop records resistance and mpickgold transfers coins', async () => {
    const state = makeState();
    const mole = monster(state, PM_ROCK_MOLE);
    await mon_give_prop(mole, FIRE_RES, { state });
    assert.equal(mole.mintrinsics & 1, 1);

    const gold = floorObject(state, GOLD_PIECE);
    mpickgold(mole, { state });
    assert.equal(gold.where, 4); // OBJ_MINVENT in monst.h's object-location enum.
    assert.equal(mole.minvent, gold);
});
