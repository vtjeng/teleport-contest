import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DOOR, D_BROKEN, D_CLOSED, D_LOCKED, IN_SIGHT, IRONBARS, LANDMINE,
    ROOM, ROLL, ROWNO,
    VWALL,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { sobj_at } from '../js/invent.js';
import { newMonster } from '../js/monst.js';
import { newObject, place_object } from '../js/obj.js';
import {
    BOULDER, ROCK_CLASS, STATUE, objects_globals_init,
} from '../js/objects.js';
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

test('rolling boulder thump against a wall wakes only nearby sleepers',
    async () => {
        // Planning uses an isolated state, distinct from the global game.
        const state = { ...resetGame() };
        state.level = new GameMap();
        state.u = { ux: 20, uy: 10 };
        state.context = {};
        for (let x = 10; x <= 17; x++) state.level.at(x, 10).typ = ROOM;
        state.level.at(13, 10).typ = VWALL;
        const sleeper = newMonster({
            data: { geno: 0 }, mx: 12, my: 11,
            mhp: 5, msleeping: true,
        });
        const farSleeper = newMonster({
            data: { geno: 0 }, mx: 17, my: 10,
            mhp: 5, msleeping: true,
        });
        sleeper.nmon = farSleeper;
        state.level.monlist = sleeper;
        state.level.monsters[12][11] = sleeper;
        state.level.monsters[17][10] = farSleeper;
        const boulder = newObject({ otyp: BOULDER, quan: 1 });
        const hooks = { blockPoint: () => {}, recalcBlockPoint: () => {} };
        place_object(boulder, 10, 10, { state, hooks });
        const messages = [];

        const result = await launch_obj(BOULDER, 10, 10, 14, 10,
            ROLL, state, {
                hooks,
                planning: true,
                message: (line) => messages.push(line),
                redraw: () => {},
                canSeeMonster: () => false,
                disturbBuriedZombies: () => {},
            });

        assert.equal(result, 1);
        assert.deepEqual(messages, ['Thump!']);
        assert.equal(sobj_at(BOULDER, 12, 10, state), boulder);
        assert.equal(sleeper.msleeping, false);
        assert.equal(farSleeper.msleeping, true);
    });

for (const [objType, diggingX] of [[BOULDER, 10], [BOULDER, 9], [STATUE, 10]]) {
    test(`launching a ${objType === STATUE ? 'statue' : 'boulder'} ${diggingX === 10 ? 'clears matching'
        : 'preserves unrelated'} digging context`, async () => {
        const state = resetGame();
        state.level = new GameMap();
        state.u = { ux: 20, uy: 10 };
        for (let x = 9; x <= 11; x++) state.level.at(x, 10).typ = ROOM;
        const digging = {
            effort: 80,
            level: { dnum: 0, dlevel: 3 },
            pos: { x: diggingX, y: 10 },
            lastdigtime: 24,
            down: false,
            chew: false,
            warned: true,
            quiet: true,
        };
        state.context = { digging };
        const object = newObject({ otyp: objType, quan: 1 });
        const hooks = { blockPoint: () => {}, recalcBlockPoint: () => {} };
        place_object(object, 10, 10, { state, hooks });

        assert.equal(await launch_obj(objType, 10, 10, 11, 10,
            ROLL, state, {
                hooks,
                planning: true,
                message: () => {},
                redraw: () => {},
            }), 1);

        if (diggingX === 10) {
            assert.deepEqual(state.context.digging, {
                effort: 0,
                level: { dnum: 0, dlevel: 0 },
                pos: { x: 0, y: 0 },
                lastdigtime: 0,
                down: false,
                chew: false,
                warned: false,
                quiet: false,
            });
        } else {
            assert.equal(state.context.digging, digging);
        }
    });
}

test('a rolling boulder continues when a land mine does not fire', async () => {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 20, uy: 10 };
    state.context = {};
    for (let x = 10; x <= 12; x++) state.level.at(x, 10).typ = ROOM;
    const mine = { ttyp: LANDMINE, tx: 11, ty: 10 };
    state.level.traps.push(mine);
    const boulder = newObject({ otyp: BOULDER, quan: 1 });
    const hooks = { blockPoint: () => {}, recalcBlockPoint: () => {} };
    place_object(boulder, 10, 10, { state, hooks });
    const draws = [];

    const result = await launch_obj(BOULDER, 10, 10, 12, 10,
        ROLL, state, {
            hooks,
            planning: true,
            random: {
                rn2(bound) {
                    draws.push(bound);
                    assert.equal(bound, 10);
                    return 0;
                },
            },
            message: () => {},
            redraw: () => {},
        });

    assert.equal(result, 1);
    assert.deepEqual(draws, [10]);
    assert.equal(sobj_at(BOULDER, 12, 10, state), boulder);
    assert.equal(state.level.traps.includes(mine), true);
});
