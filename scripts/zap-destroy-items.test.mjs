import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_MINVENT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_NEWT } from '../js/monsters.js';
import {
    mksobj,
    weight,
} from '../js/obj.js';
import { SCR_TELEPORTATION } from '../js/objects.js';
import {
    destroy_monster_fire_items,
} from '../js/zap_destroy_items.js';

async function initializedMonster(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.data = game.mons[PM_NEWT];
    monster.minvent = null;
    // Keep inventory-destruction messages out of these RNG-order tests.
    monster.minvis = true;
    return monster;
}

function carriedScroll(monster, quantity) {
    const obj = mksobj(SCR_TELEPORTATION, false, false, { state: game });
    obj.quan = quantity;
    obj.owt = weight(obj, { state: game });
    obj.where = OBJ_MINVENT;
    obj.ocarry = monster;
    obj.nobj = null;
    return obj;
}

test('sub-five fire damage spends only its scaling draw', async () => {
    const monster = await initializedMonster(982431, 'LowFireDamage');
    const scroll = carriedScroll(monster, 2);
    monster.minvent = scroll;
    const draws = [];

    const damage = await destroy_monster_fire_items(monster, 4, {
        random: {
            rn1: () => assert.fail('quantity updates do not call rn1'),
            rn2: (bound) => {
                draws.push(bound);
                return 4;
            },
            rne: () => assert.fail('quantity updates do not call rne'),
            rnd: () => assert.fail('no stack is selected'),
        },
        state: game,
    });

    assert.equal(damage, 0);
    assert.equal(scroll.quan, 2);
    assert.deepEqual(draws, [5]);
});

test('reservoir selection precedes per-item destruction draws', async () => {
    const monster = await initializedMonster(982432, 'FireReservoir');
    const first = carriedScroll(monster, 2);
    const second = carriedScroll(monster, 2);
    const third = carriedScroll(monster, 2);
    first.nobj = second;
    second.nobj = third;
    monster.minvent = first;
    const script = [
        [5, 0], // exact multiple still spends the scaling draw
        [1, 0], // second eligible stack replaces the first
        [2, 1], // third eligible stack leaves the second selected
        [3, 0], // destroy the first scroll in the selected stack
        [3, 1], // preserve the second scroll
    ];
    const draws = [];

    const damage = await destroy_monster_fire_items(monster, 5, {
        random: {
            rn1: () => assert.fail('quantity updates do not call rn1'),
            rn2: (bound) => {
                const [expectedBound, result] = script.shift();
                assert.equal(bound, expectedBound);
                draws.push([bound, result]);
                return result;
            },
            rne: () => assert.fail('quantity updates do not call rne'),
            rnd: () => assert.fail('scroll destruction has fixed damage'),
        },
        state: game,
    });

    assert.equal(damage, 1);
    assert.equal(first.quan, 2);
    assert.equal(second.quan, 1);
    assert.equal(third.quan, 2);
    assert.deepEqual(draws, [
        [5, 0],
        [1, 0],
        [2, 1],
        [3, 0],
        [3, 1],
    ]);
    assert.equal(script.length, 0);
});
