import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    HELL_GENERATORS,
    hell_open_cavern,
    hellfill,
} from '../js/hell_levels.js';
import { ROOM } from '../js/const.js';

const C_SOURCE = readFileSync('nethack-c/upstream/dat/hellfill.lua', 'utf8');

function descriptorLog() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return (...args) => calls.push({ method, args });
        },
    });
    return { calls, des };
}

// A hellish dungeon of INVOCATION_DUNLEVS levels, with the hero on `dlevel`.
// dungeon.c Invocation_lev() is true only for dlevel == num_dunlevs - 1 in a
// dungeon whose flags.hellish is set, which nhlua.c projects as
// `u.invocation_level`.
const INVOCATION_DUNLEVS = 20;
function roomState(dlevel = 1) {
    return {
        dungeons: [{
            num_dunlevs: INVOCATION_DUNLEVS,
            flags: { hellish: true },
        }],
        u: { uz: { dnum: 0, dlevel } },
        level: { at: () => ({ typ: ROOM }) },
    };
}

// The selector's first draw is rn2(7); returning 6 picks the seventh
// (open-cavern) arm, the only ported generator. Every later draw returns 0.
function openCavernRandom() {
    let first = true;
    return (bound) => {
        if (first) {
            first = false;
            assert.equal(bound, 7);
            return 6;
        }
        return 0;
    };
}

test('hellfill keeps all seven source generator slots and selects arm 7', () => {
    assert.match(C_SOURCE, /-- 7: open cavern, "mines" with more space/);
    assert.equal(HELL_GENERATORS.length, 7);
    assert.ok(HELL_GENERATORS.every((generator) => typeof generator === 'function'));
    assert.equal(HELL_GENERATORS[6], hell_open_cavern);
});
test('hellfill runs the open-cavern arm and common population tail', async () => {
    const { calls, des } = descriptorLog();
    await hellfill(des, roomState(), openCavernRandom());

    assert.deepEqual(calls.slice(0, 8).map(({ method, args }) => ({
        method,
        args: method === 'terrain' ? [args[0].typ, args[0].lit] : args,
    })), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ', lit: 0 }] },
        { method: 'level_flags', args: ['mazelevel', 'noflip'] },
        {
            method: 'level_init',
            args: [{
                style: 'mines', fg: '.', bg: ' ', smoothed: true,
                joined: true, lit: 0,
            }],
        },
        { method: 'terrain', args: ['.', 0] },
        { method: 'terrain', args: [' ', 0] },
        { method: 'wallify', args: [] },
        { method: 'stair', args: ['up'] },
        { method: 'stair', args: ['down'] },
    ]);
    assert.equal(calls.filter(({ method }) => method === 'object').length, 15);
    assert.equal(calls.filter(({ method }) => method === 'monster').length, 9);
    assert.equal(calls.filter(({ method }) => method === 'gold').length, 8);
    assert.equal(calls.filter(({ method }) => method === 'trap').length, 8);
    assert.deepEqual(
        calls.filter(({ method }) => method === 'object')
            .slice(0, 12)
            .map(({ args }) => args),
        Array(12).fill(['*']),
    );
    assert.deepEqual(calls[6], { method: 'stair', args: ['up'] });
    assert.deepEqual(calls[7], { method: 'stair', args: ['down'] });
});

// C ref: dat/hellfill.lua's tail reads `u.invocation_level`, which nhlua.c
// answers with dungeon.c Invocation_lev(&u.uz). On that one level the fill
// places the vibrating square and no down stair; every other level gets the
// down stair and no trap for the square.
test('hellfill places the vibrating square only on the invocation level', async () => {
    assert.match(C_SOURCE, /if \(u\.invocation_level\) then/);
    const tail = (calls) => calls
        .filter(({ method }) => method === 'stair' || method === 'trap')
        // populatemaze()'s des.trap() calls carry no arguments; the invocation
        // trap is the only one that names its type.
        .filter(({ method, args }) => method === 'stair' || args.length > 0)
        .map(({ method, args }) => [method, ...args]);

    // Invocation_lev(): dlevel == num_dunlevs - 1 in a hellish dungeon.
    const invocation = descriptorLog();
    await hellfill(
        invocation.des,
        roomState(INVOCATION_DUNLEVS - 1),
        openCavernRandom(),
    );
    assert.deepEqual(tail(invocation.calls), [
        ['stair', 'up'],
        ['trap', 'vibrating square'],
    ]);

    // The bottom level and the level above the invocation level are the two
    // nearest non-invocation levels of the same dungeon.
    for (const dlevel of [INVOCATION_DUNLEVS, INVOCATION_DUNLEVS - 2]) {
        const ordinary = descriptorLog();
        await hellfill(ordinary.des, roomState(dlevel), openCavernRandom());
        assert.deepEqual(tail(ordinary.calls), [
            ['stair', 'up'],
            ['stair', 'down'],
        ], `dlevel ${dlevel}`);
    }

    // A non-hellish dungeon never has an invocation level, whatever the depth.
    const state = roomState(INVOCATION_DUNLEVS - 1);
    state.dungeons[0].flags.hellish = false;
    const nonHellish = descriptorLog();
    await hellfill(nonHellish.des, state, openCavernRandom());
    assert.deepEqual(tail(nonHellish.calls), [
        ['stair', 'up'],
        ['stair', 'down'],
    ]);
});
