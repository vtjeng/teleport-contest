import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO, DOOR, D_BROKEN, D_CLOSED, D_LOCKED, IN_SIGHT, IRONBARS, LANDMINE,
    MIGR_RANDOM, OBJ_MIGRATING, ROOM, ROLL, ROWNO, TELEP_TRAP, LEVEL_TELEP,
    VWALL,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { sobj_at } from '../js/invent.js';
import { newMonster } from '../js/monst.js';
import { newObject, place_object } from '../js/obj.js';
import {
    BOULDER, ROCK, ROCK_CLASS, STATUE, objects_globals_init,
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

test('a firing land mine fractures and scatters the rolling boulder', async () => {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 20, uy: 10 };
    state.context = { ident: 1, mon_moving: true };
    objects_globals_init(state);
    for (let x = 8; x <= 14; x++)
        for (let y = 8; y <= 12; y++) state.level.at(x, y).typ = ROOM;
    const mine = { ttyp: LANDMINE, tx: 11, ty: 10 };
    state.level.traps.push(mine);
    const boulder = newObject({
        otyp: BOULDER, oclass: ROCK_CLASS, quan: 1,
    });
    const hooks = { blockPoint: () => {}, recalcBlockPoint: () => {} };
    place_object(boulder, 10, 10, { state, hooks });
    const draws = [];
    const messages = [];

    const result = await launch_obj(BOULDER, 10, 10, 12, 10,
        ROLL, state, {
            hooks,
            planning: true,
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return bound - 1;
                },
                rn1: (_range, base) => base,
                rnd: () => 1,
                d: () => 1,
                rne: () => 1,
            },
            message: (line) => messages.push(line),
            redraw: () => {},
            newsym: () => {},
            canSeeMonster: () => false,
            disturbBuriedZombies: () => {},
        });

    assert.equal(result, 2);
    assert.equal(draws[0], 10);
    assert.ok(messages.includes('KAABLAMM!!!'));
    assert.equal(state.level.traps.includes(mine), false);
    assert.equal(boulder.otyp, ROCK);
    assert.equal(sobj_at(BOULDER, 11, 10, state), null);
    let rockPiles = 0;
    for (let obj = state.level.objlist; obj; obj = obj.nobj)
        if (obj.otyp === ROCK) rockPiles++;
    assert.ok(rockPiles >= 1);
    assert.notDeepEqual([boulder.ox, boulder.oy], [11, 10],
        'the fractured rocks leave the mine square');
});

test('a rolling boulder teleports away and reveals its trap', async () => {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 20, uy: 10, uz: { dnum: 0, dlevel: 1 } };
    state.dungeons = [{ flags: { hellish: false } }];
    state.context = {};
    state.flags = { acoustics: true };
    for (let x = 10; x <= 14; x++) state.level.at(x, 10).typ = ROOM;
    const trap = { ttyp: TELEP_TRAP, tx: 11, ty: 10, tseen: false };
    state.level.traps.push(trap);
    const boulder = newObject({
        otyp: BOULDER, oclass: ROCK_CLASS, quan: 1,
    });
    const hooks = { blockPoint: () => {}, recalcBlockPoint: () => {} };
    place_object(boulder, 10, 10, { state, hooks });
    const messages = [];
    const draws = [];

    const result = await launch_obj(BOULDER, 10, 10, 12, 10,
        ROLL, state, {
            hooks,
            planning: true,
            random: {
                rn1(bound, offset) {
                    draws.push(['rn1', bound, offset]);
                    return 14;
                },
                rn2(bound) {
                    draws.push(['rn2', bound]);
                    return 10;
                },
            },
            message: (line) => messages.push(line),
            redraw: () => {},
        });

    assert.equal(result, 2);
    assert.deepEqual(draws, [['rn1', COLNO - 3, 2], ['rn2', ROWNO]]);
    assert.deepEqual(messages, ['You hear a rumbling stop abruptly.']);
    assert.equal(trap.tseen, true);
    assert.equal(sobj_at(BOULDER, 11, 10, state), null);
    assert.equal(sobj_at(BOULDER, 14, 10, state), boulder);
    assert.ok(!boulder.otrapped);
});

for (const changesLevel of [false, true]) {
    test(`rolling boulder level teleport ${changesLevel
        ? 'migrates to a new depth' : 'keeps rolling on the same depth'}`,
    async () => {
        const state = resetGame();
        state.level = new GameMap();
        state.u = { ux: 20, uy: 10, uz: { dnum: 0, dlevel: 2 } };
        state.dungeons = [{
            depth_start: 1, num_dunlevs: 10,
            flags: { hellish: false },
        }];
        state.context = {};
        state.flags = { acoustics: true };
        for (let x = 10; x <= 12; x++) state.level.at(x, 10).typ = ROOM;
        const trap = { ttyp: LEVEL_TELEP, tx: 11, ty: 10, tseen: false };
        state.level.traps.push(trap);
        const boulder = newObject({
            otyp: BOULDER, oclass: ROCK_CLASS, quan: 1,
        });
        const hooks = { blockPoint: () => {}, recalcBlockPoint: () => {} };
        place_object(boulder, 10, 10, { state, hooks });
        const draws = [];
        const messages = [];

        const result = await launch_obj(BOULDER, 10, 10, 12, 10,
            ROLL, state, {
                hooks,
                planning: true,
                random: {
                    rn2(bound) {
                        draws.push(bound);
                        return changesLevel && bound === 5 ? 1 : 0;
                    },
                },
                message: (line) => messages.push(line),
                redraw: () => {},
            });

        if (changesLevel) {
            assert.equal(result, 2);
            assert.deepEqual(draws, [5, 4]);
            assert.deepEqual(messages,
                ['You hear a rumbling stop abruptly.']);
            assert.equal(trap.tseen, true);
            assert.equal(boulder.where, OBJ_MIGRATING);
            assert.equal(state.gm.migrating_objs, boulder);
            assert.deepEqual([boulder.ox, boulder.oy, boulder.owornmask],
                [0, 1, MIGR_RANDOM]);
        } else {
            assert.equal(result, 1);
            assert.deepEqual(draws, [5]);
            assert.deepEqual(messages, []);
            assert.equal(trap.tseen, false);
            assert.equal(sobj_at(BOULDER, 12, 10, state), boulder);
        }
    });
}
