import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DOOR, D_BROKEN, D_CLOSED, D_LOCKED, IN_SIGHT, IRONBARS, ROOM, ROLL, ROWNO,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { sobj_at } from '../js/invent.js';
import { newObject, place_object } from '../js/obj.js';
import { BOULDER, ROCK_CLASS, objects_globals_init } from '../js/objects.js';
import { launch_obj } from '../js/trap_effects.js';

test('rolling boulder moves the next boulder after a collision', async () => {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 20, uy: 10 };
    state.flags = { acoustics: true };
    state.context = {};
    for (let x = 10; x <= 12; x++) state.level.at(x, 10).typ = ROOM;

    const first = newObject({ otyp: BOULDER, quan: 1, o_id: 1 });
    const second = newObject({ otyp: BOULDER, quan: 1, o_id: 2 });
    const hooks = {
        blockPoint: () => {},
        recalcBlockPoint: () => {},
    };
    place_object(first, 10, 10, { state, hooks });
    place_object(second, 11, 10, { state, hooks });
    const messages = [];

    const result = await launch_obj(BOULDER, 10, 10, 12, 10, ROLL, state, {
        hooks,
        planning: true,
        message: (line) => messages.push(line),
        redraw: () => {},
        disturbBuriedZombies: () => {},
    });

    assert.equal(result, 1);
    assert.equal(sobj_at(BOULDER, 10, 10, state), null);
    assert.equal(sobj_at(BOULDER, 11, 10, state), first);
    assert.equal(sobj_at(BOULDER, 12, 10, state), second);
    assert.ok(!first.otrapped);
    assert.ok(!second.otrapped);
    assert.ok(messages.some((line) => line.includes('a loud crash')));
});

for (const originalMask of [D_CLOSED, D_LOCKED]) {
    test(`rolling boulder breaks a ${originalMask === D_LOCKED
        ? 'locked' : 'closed'} door and continues`, async () => {
        const state = resetGame();
        state.level = new GameMap();
        state.u = { ux: 20, uy: 10 };
        state.context = {};
        for (let x = 10; x <= 12; x++) state.level.at(x, 10).typ = ROOM;
        const door = state.level.at(11, 10);
        door.typ = DOOR;
        door.doormask = originalMask;
        door.flags = originalMask;
        if (originalMask === D_CLOSED) {
            state.viz_array = Array.from({ length: ROWNO }, () => []);
            state.viz_array[10][11] = IN_SIGHT;
        }
        const boulder = newObject({ otyp: BOULDER, quan: 1 });
        const messages = [];
        const recalcMasks = [];
        const hooks = {
            blockPoint: () => {},
            recalcBlockPoint: () => { recalcMasks.push(door.doormask); },
        };
        place_object(boulder, 10, 10, { state, hooks });

        const result = await launch_obj(BOULDER, 10, 10, 12, 10,
            ROLL, state, {
                hooks,
                planning: true,
                message: (line) => messages.push(line),
                redraw: () => {},
            });

        assert.equal(result, 1);
        assert.equal(door.doormask, D_BROKEN);
        assert.equal(door.flags, D_BROKEN);
        assert.deepEqual(recalcMasks, [originalMask, D_BROKEN]);
        assert.equal(sobj_at(BOULDER, 12, 10, state), boulder);
        assert.deepEqual(messages, originalMask === D_CLOSED
            ? ['The boulder crashes through a door.'] : []);
    });
}

test('rolling boulder strikes iron bars and stops before them', async () => {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 20, uy: 10 };
    state.context = {};
    objects_globals_init(state);
    for (let x = 10; x <= 13; x++) state.level.at(x, 10).typ = ROOM;
    state.level.at(12, 10).typ = IRONBARS;
    const boulder = newObject({ otyp: BOULDER, oclass: ROCK_CLASS, quan: 1 });
    const hooks = { blockPoint: () => {}, recalcBlockPoint: () => {} };
    place_object(boulder, 10, 10, { state, hooks });
    const draws = [];
    const messages = [];

    const result = await launch_obj(BOULDER, 10, 10, 13, 10,
        ROLL, state, {
            hooks,
            planning: true,
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return bound - 1;
                },
            },
            message: (line) => messages.push(line),
            redraw: () => {},
            disturbBuriedZombies: () => {},
        });

    assert.equal(result, 1);
    assert.deepEqual(draws, [20, 100]);
    assert.deepEqual(messages, ['Whang!']);
    assert.equal(sobj_at(BOULDER, 11, 10, state), boulder);
    assert.equal(sobj_at(BOULDER, 12, 10, state), null);
    assert.equal(state.level.at(12, 10).typ, IRONBARS);
});
