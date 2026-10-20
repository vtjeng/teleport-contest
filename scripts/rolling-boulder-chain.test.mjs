import assert from 'node:assert/strict';
import test from 'node:test';

import { ROOM, ROLL } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { sobj_at } from '../js/invent.js';
import { newObject, place_object } from '../js/obj.js';
import { BOULDER } from '../js/objects.js';
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
