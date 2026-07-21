import assert from 'node:assert/strict';
import test from 'node:test';

import {
    FILL_LVFLAGS,
    FILL_NONE,
    FILL_NORMAL,
    OBJ_FLOOR,
    OROOM,
    THEMEROOM,
    VAULT,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { fill_special_room } from '../js/mklev.js';
import { g_at, mkgold } from '../js/obj.js';
import { GOLD_PIECE, objects_globals_init } from '../js/objects.js';

function initializedState() {
    const state = resetGame();
    state.context = { ident: 2 }; // Object and monster id 1 is reserved.
    state.flags = {};
    state.moves = 0;
    state.in_mklev = true;
    state.u = { ulevel: 1, uz: { dnum: 0, dlevel: 1 } };
    state.dungeons = [{ depth_start: 1, entry_lev: 1, num_dunlevs: 10 }];
    state.level = new GameMap();
    objects_globals_init(state);
    return state;
}

function room({
    lx = 10,
    ly = 5,
    hx = lx,
    hy = ly,
    rtype = VAULT,
    needfill = FILL_NORMAL,
    sbrooms = [],
} = {}) {
    return {
        lx,
        ly,
        hx,
        hy,
        rtype,
        needfill,
        nsubrooms: sbrooms.length,
        sbrooms,
    };
}

function scriptedRandom(script) {
    const remaining = [...script];
    const draw = (name, bound) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${name}(${bound})`);
        assert.deepEqual(expected.slice(0, 2), [name, bound]);
        const result = expected[2];
        if (name === 'rn2')
            assert.ok(result >= 0 && result < bound);
        else
            assert.ok(result >= 1 && result <= bound);
        return result;
    };
    const rn2 = (bound) => draw('rn2', bound);
    return {
        random: {
            rn2,
            rnd: (bound) => draw('rnd', bound),
            // rn1(range, base) is the source macro rn2(range) + base. Keeping
            // that expansion here makes its recorder-visible draw explicit.
            rn1: (range, base) => rn2(range) + base,
            rne: (bound) => assert.fail(`unexpected rne(${bound})`),
        },
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

function noDrawRandom() {
    const unexpected = (name, args) => {
        assert.fail(`unexpected ${name}(${args.join(',')})`);
    };
    return {
        rn2: (...args) => unexpected('rn2', args),
        rnd: (...args) => unexpected('rnd', args),
        rn1: (...args) => unexpected('rn1', args),
        rne: (...args) => unexpected('rne', args),
    };
}

const VAULT_BOUNDS = Object.freeze({ lx: 10, ly: 5, hx: 11, hy: 6 });
const VAULT_COORDINATES = Object.freeze([
    [10, 5], [10, 6], [11, 5], [11, 6],
]);
const EMPTY_VAULT_DRAWS = Object.freeze([
    ['rn2', 100, 0], ['rnd', 2, 1],
    ['rn2', 100, 24], ['rnd', 2, 2],
    ['rn2', 100, 99], ['rnd', 2, 1],
    ['rn2', 100, 7], ['rnd', 2, 2],
]);

test('fill_special_room fills an empty 2x2 vault in source order', () => {
    const state = initializedState();
    // NetHack creates ordinary vaults as 2x2 rooms. These arbitrary in-map
    // bounds expose the source's x-outer, y-inner traversal order.
    const vault = room(VAULT_BOUNDS);
    const random = scriptedRandom([
        // At depth one, vault amounts use rn1(abs(depth) * 100, 51), hence
        // rn2(100). Each empty square then allocates gold via next_ident(),
        // whose increment is rnd(2).
        ...EMPTY_VAULT_DRAWS,
    ]);

    fill_special_room(vault, { state, random: random.random });
    random.done();

    const gold = VAULT_COORDINATES.map(([x, y]) => g_at(x, y, state));
    assert.deepEqual(gold.map((obj) => [obj.ox, obj.oy]), VAULT_COORDINATES);
    assert.deepEqual(gold.map((obj) => obj.quan), [51, 75, 150, 58]);
    assert.deepEqual(gold.map((obj) => obj.owt), [1, 1, 2, 1]);
    assert.deepEqual(gold.map((obj) => obj.o_id), [2, 3, 5, 6]);
    for (const obj of gold) {
        assert.equal(obj.otyp, GOLD_PIECE);
        assert.equal(obj.where, OBJ_FLOOR);
        assert.equal(state.level.objects[obj.ox][obj.oy], obj);
    }
    assert.equal(state.context.ident, 8);
    assert.equal(state.level.flags.has_vault, true);
});

test('mkgold derives a random amount from source depth and difficulty', () => {
    const state = initializedState();
    const random = scriptedRandom([
        // At depth one, rnd(30 / max(12 - depth, 2)) uses bound two.
        ['rnd', 2, 2],
        // Ordinary level difficulty one makes the second amount bound three.
        ['rnd', 3, 3],
        // The empty square allocates one gold object through next_ident().
        ['rnd', 2, 1],
    ]);

    const gold = mkgold(0, 10, 5, { state, random: random.random });
    random.done();

    assert.equal(gold.quan, 7); // 1 + rnd(3) * rnd(2) = 1 + 3 * 2.
    assert.equal(g_at(10, 5, state), gold);
    assert.equal(state.context.ident, 3);
});

test('a second vault fill merges gold without allocating new objects', () => {
    const state = initializedState();
    // A 2x2 room exercises all four source loop iterations while keeping each
    // coordinate's first object easy to retain and compare by identity.
    const vault = room(VAULT_BOUNDS);
    const first = scriptedRandom([
        // Depth-one amount draws and the four empty-square id increments.
        ...EMPTY_VAULT_DRAWS,
    ]);
    fill_special_room(vault, { state, random: first.random });
    first.done();
    const original = VAULT_COORDINATES.map(([x, y]) => g_at(x, y, state));
    const ids = original.map((obj) => obj.o_id);
    const nextIdent = state.context.ident;

    const second = scriptedRandom([
        // All squares already contain gold, so only rn1's four rn2(100)
        // draws remain; any rnd(2) allocation would fail this script.
        ['rn2', 100, 99],
        ['rn2', 100, 0],
        ['rn2', 100, 50],
        ['rn2', 100, 25],
    ]);
    fill_special_room(vault, { state, random: second.random });
    second.done();

    const merged = VAULT_COORDINATES.map(([x, y]) => g_at(x, y, state));
    assert.deepEqual(merged, original);
    assert.deepEqual(merged.map((obj) => obj.o_id), ids);
    assert.deepEqual(merged.map((obj) => obj.quan), [201, 126, 251, 134]);
    assert.deepEqual(merged.map((obj) => obj.owt), [2, 1, 3, 1]);
    assert.equal(state.context.ident, nextIdent);
    assert.equal(state.level.flags.has_vault, true);
});

test('fill modes and ordinary-room early returns consume no random values', () => {
    const random = noDrawRandom();

    const flagsOnly = initializedState();
    fill_special_room(room({ needfill: FILL_LVFLAGS }), {
        state: flagsOnly,
        random,
    });
    assert.equal(flagsOnly.level.flags.has_vault, true);
    assert.equal(flagsOnly.level.objlist, null);

    const noFill = initializedState();
    fill_special_room(room({ needfill: FILL_NONE }), {
        state: noFill,
        random,
    });
    assert.equal(noFill.level.flags.has_vault, undefined);
    assert.equal(noFill.level.objlist, null);

    // Ordinary and themed rooms have their own population path. Even normal
    // fill mode must return here before setting flags or consuming PRNG.
    for (const rtype of [OROOM, THEMEROOM]) {
        const state = initializedState();
        fill_special_room(room({ rtype }), { state, random });
        assert.equal(state.level.flags.has_vault, undefined);
        assert.equal(state.level.objlist, null);
    }

    const nullState = initializedState();
    fill_special_room(null, { state: nullState, random });
    assert.equal(nullState.level.objlist, null);
});

test('fill_special_room completes subrooms before their parent', () => {
    const state = initializedState();
    // One-cell child and parent rooms isolate recursion order: the first
    // amount belongs to the child and the second to the parent.
    const child = room({ lx: 12, ly: 7, hx: 12, hy: 7 });
    const parent = room({
        lx: 20,
        ly: 9,
        hx: 20,
        hy: 9,
        sbrooms: [child],
    });
    const random = scriptedRandom([
        // Depth-one vault amount followed by next_ident() for each empty cell.
        ['rn2', 100, 4], ['rnd', 2, 1],
        ['rn2', 100, 9], ['rnd', 2, 1],
    ]);

    fill_special_room(parent, { state, random: random.random });
    random.done();

    assert.equal(g_at(12, 7, state).quan, 55);
    assert.equal(g_at(20, 9, state).quan, 60);
    assert.deepEqual(
        [g_at(12, 7, state).o_id, g_at(20, 9, state).o_id],
        [2, 3],
    );
    assert.equal(state.context.ident, 4);
});
