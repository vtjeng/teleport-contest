import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FILL_NONE,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OROOM,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import {
    fill_ordinary_room,
    populateSupplyChest,
} from '../js/mklev.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { weight } from '../js/obj.js';
import {
    CHEST,
    POT_EXTRA_HEALING,
    POT_HEALING,
    objects_globals_init,
} from '../js/objects.js';

function initializedState() {
    const state = resetGame();
    state.context = {
        ident: 2, // Object and monster id 1 is reserved by the source.
        mon_moving: false,
    };
    state.flags = {};
    state.moves = 0;
    state.program_state = { gameover: false };
    state.u = { ulevel: 1, uz: { dnum: 0, dlevel: 1 } };
    state.level = new GameMap();
    objects_globals_init(state);
    return state;
}

function scriptedRandom(expectedCalls) {
    const remaining = [...expectedCalls];
    const draw = (name, bound) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${name}(${bound})`);
        assert.deepEqual(
            [name, bound],
            expected.slice(0, 2),
            `wrong RNG call before scripted result ${expected[2]}`,
        );
        return expected[2];
    };
    return {
        random: {
            rn2: (bound) => draw('rn2', bound),
            rnd: (bound) => draw('rnd', bound),
            rn1: (range, base) => draw('rn1', `${range},${base}`),
            rne: (bound) => draw('rne', bound),
        },
        done() {
            assert.deepEqual(remaining, [], 'scripted RNG calls remain');
        },
    };
}

test('populateSupplyChest keeps cursed rerolls and guarantees a noncursed item', () => {
    const state = initializedState();
    const stream = scriptedRandom([
        ['rn2', 3, 1], // Select the source's twice-as-likely CHEST branch.
        ['rnd', 2, 1], // Allocate the floor chest's object id.
        ['rn2', 6, 0], // Leave the supply chest unlocked.

        ['rn2', 2, 0], // Select the nine-item supply table.
        ['rn2', 9, 0], // Select its first entry, POT_EXTRA_HEALING.
        ['rnd', 2, 1], // Allocate the first content object's id.
        ['rn2', 4, 0], // Enter the potion's bless-or-curse branch.
        ['rn2', 2, 0], // Curse it, forcing another supply-item iteration.

        ['rn2', 2, 1], // Select the 50% POT_HEALING branch next.
        ['rnd', 2, 1], // Allocate the second content object's id.
        ['rn2', 4, 1], // Keep the healing potion noncursed.
        ['rn2', 2, 1], // Double its quantity to exercise weight recalculation.
        ['rn2', 5, 1], // Stop after the guaranteed noncursed item.
        ['rn2', 3, 0], // Disable the optional random extra item.
    ]);
    const env = objectGenerationEnv({ state, random: stream.random });
    const position = { x: 10, y: 5 }; // An interior tile isolates floor ownership.

    const chest = populateSupplyChest(position, env);
    stream.done();

    const healing = chest.cobj;
    const extraHealing = healing.nobj;
    assert.equal(state.level.objects[position.x][position.y], chest);
    assert.equal(state.level.objlist, chest);
    assert.equal(chest.where, OBJ_FLOOR);
    assert.deepEqual([chest.ox, chest.oy], [position.x, position.y]);

    assert.equal(healing.otyp, POT_HEALING);
    assert.equal(healing.cursed, false);
    assert.equal(healing.quan, 2);
    assert.equal(extraHealing.otyp, POT_EXTRA_HEALING);
    assert.equal(extraHealing.cursed, true);
    assert.equal(extraHealing.quan, 1);
    assert.equal(extraHealing.nobj, null);
    for (const obj of [healing, extraHealing]) {
        assert.equal(obj.where, OBJ_CONTAINED);
        assert.equal(obj.ocontainer, chest);
    }
    assert.equal(chest.owt, weight(chest, env));
    assert.equal(
        chest.owt,
        state.objects[CHEST].oc_weight + healing.owt + extraHealing.owt,
    );
});

test('fill_ordinary_room observes a child before an unfilled parent returns', () => {
    const observed = [];
    const child = {
        rtype: OROOM,
        nsubrooms: 0,
        sbrooms: [],
        get needfill() {
            observed.push('child');
            return FILL_NONE;
        },
    };
    const parent = {
        rtype: OROOM,
        nsubrooms: 1, // One child is enough to expose the recursion boundary.
        sbrooms: [child],
        get needfill() {
            observed.push('parent');
            return FILL_NONE;
        },
    };

    fill_ordinary_room(parent, false);

    assert.deepEqual(observed, ['child', 'parent']);
});
