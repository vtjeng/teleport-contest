import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    DART_TRAP,
    FIRE_TRAP,
    HOLE,
    ICE,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    MKTRAP_NOSPIDERONWEB,
    NO_TRAP,
    PIT,
    ROCKTRAP,
    ROOM,
    ROLLING_BOULDER_TRAP,
    RUST_TRAP,
    SQKY_BOARD,
    STAIRS,
    STATUE_TRAP,
    TELEP_TRAP,
    TRAPDOOR,
    TRAPPED_CHEST,
    TRAPPED_DOOR,
    VIBRATING_SQUARE,
    WEB,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { traptype_rnd } from '../js/mklev.js';
import { maketrap, t_at } from '../js/trap.js';

function initializedState(dlevel = 1) {
    const state = resetGame();
    state.u = {
        ulevel: 1,
        uz: { dnum: 0, dlevel },
        uevent: { invoked: false },
    };
    state.dungeons = [{
        depth_start: 1,
        entry_lev: 1,
        num_dunlevs: 10,
        dunlev_ureached: dlevel,
        flags: { hellish: false },
    }];
    state.level = new GameMap();
    state.level.at(10, 5).typ = ROOM;
    state.level.at(11, 5).typ = ROOM;
    return state;
}

function scriptedRandom(script) {
    const remaining = [...script];
    const draw = (name, bound) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${name}(${bound})`);
        assert.deepEqual(expected.slice(0, 2), [name, bound]);
        return expected[2];
    };
    return {
        random: {
            rnd: (bound) => draw('rnd', bound),
            rn2: (bound) => draw('rn2', bound),
        },
        done: () => assert.deepEqual(remaining, []),
    };
}

const D1_ALLOWED = new Set([
    ARROW_TRAP,
    DART_TRAP,
    ROCKTRAP,
    SQKY_BOARD,
    BEAR_TRAP,
    RUST_TRAP,
    PIT,
    HOLE,
    TRAPDOOR,
    TELEP_TRAP,
    MAGIC_TRAP,
    ANTI_MAGIC,
]);

test('traptype_rnd applies the complete ordinary D:1 eligibility table', () => {
    const state = initializedState();
    for (let kind = ARROW_TRAP; kind <= TRAPPED_CHEST; ++kind) {
        const script = [['rnd', 25, kind]];
        if (kind === HOLE) script.push(['rn2', 7, 0]);
        const random = scriptedRandom(script);
        assert.equal(
            traptype_rnd(0, { state, random: random.random }),
            D1_ALLOWED.has(kind) ? kind : NO_TRAP,
            `trap kind ${kind}`,
        );
        random.done();
    }
});

test('traptype_rnd preserves conditional rejection draws and flags', () => {
    const state = initializedState(8);

    let random = scriptedRandom([
        ['rnd', 25, HOLE],
        ['rn2', 7, 6],
    ]);
    assert.equal(
        traptype_rnd(0, { state, random: random.random }),
        NO_TRAP,
    );
    random.done();

    random = scriptedRandom([['rnd', 25, WEB]]);
    assert.equal(
        traptype_rnd(MKTRAP_NOSPIDERONWEB, {
            state: initializedState(),
            random: random.random,
        }),
        WEB,
    );
    random.done();

    state.dungeons[0].flags.hellish = true;
    random = scriptedRandom([['rnd', 25, FIRE_TRAP]]);
    assert.equal(
        traptype_rnd(0, { state, random: random.random }),
        FIRE_TRAP,
    );
    random.done();

    state.knox_level = { ...state.u.uz };
    random = scriptedRandom([['rnd', 25, LEVEL_TELEP]]);
    assert.equal(
        traptype_rnd(0, { state, random: random.random }),
        NO_TRAP,
    );
    random.done();
});

test('maketrap owns a head-first trap list and assigns unused board notes', () => {
    const state = initializedState();
    const random = scriptedRandom([
        ['rn2', 12, 7],
        ['rn2', 11, 7],
    ]);

    const first = maketrap(10, 5, SQKY_BOARD, {
        state,
        random: random.random,
    });
    const second = maketrap(11, 5, SQKY_BOARD, {
        state,
        random: random.random,
    });
    random.done();

    assert.equal(first.tnote, 7);
    // Note 7 is unavailable, so available index 7 maps to note 8.
    assert.equal(second.tnote, 8);
    assert.deepEqual(state.level.traps, [second, first]);
    assert.equal(t_at(10, 5, state), first);
    assert.equal(t_at(11, 5, state), second);
    assert.equal(t_at(12, 5, state), null);
});

test('maketrap gives holes visible state, destinations, and room terrain', () => {
    const state = initializedState();
    const location = state.level.at(10, 5);
    location.typ = ICE;
    location.flags = 37;
    const engraving = state.head_engr = {
        engr_x: 10,
        engr_y: 5,
        engr_txt: ['old'],
        nxt_engr: null,
    };
    const random = scriptedRandom([
        ['rn2', 4, 0],
        ['rn2', 4, 2],
    ]);

    const trap = maketrap(10, 5, HOLE, {
        state,
        random: random.random,
    });
    random.done();

    assert.deepEqual(trap.dst, { dnum: 0, dlevel: 3 });
    assert.equal(trap.tseen, true);
    assert.deepEqual(trap.launch, { x: -1, y: -1 });
    assert.equal(location.typ, ROOM);
    assert.equal(location.flags, 0);
    assert.equal(state.head_engr, engraving);
});

test('maketrap rejects non-map trap kinds and protected terrain', () => {
    const state = initializedState();
    state.level.at(10, 5).typ = STAIRS;
    assert.equal(maketrap(10, 5, ARROW_TRAP, { state }), null);
    assert.equal(maketrap(11, 5, TRAPPED_DOOR, { state }), null);
    assert.equal(maketrap(11, 5, TRAPPED_CHEST, { state }), null);

    const portal = maketrap(11, 5, MAGIC_PORTAL, { state });
    assert.equal(t_at(11, 5, state), portal);
    assert.equal(maketrap(11, 5, VIBRATING_SQUARE, { state }), null);
    assert.equal(t_at(11, 5, state), portal);
});

test('maketrap exposes later subsystem boundaries before linking a trap', () => {
    const state = initializedState();
    assert.throws(
        () => maketrap(10, 5, STATUE_TRAP, { state }),
        /statue-trap subsystem/,
    );
    assert.equal(state.level.traps.length, 0);

    assert.throws(
        () => maketrap(10, 5, ROLLING_BOULDER_TRAP, { state }),
        /rolling-boulder launch subsystem/,
    );
    assert.equal(state.level.traps.length, 0);

    state.level.buriedobjlist = { ox: 10, oy: 5, nobj: null };
    state.level.at(10, 5).flags = 37;
    assert.throws(
        () => maketrap(10, 5, PIT, { state }),
        /buried-object subsystem/,
    );
    assert.equal(state.level.at(10, 5).typ, ROOM);
    assert.equal(state.level.at(10, 5).flags, 37);
    assert.equal(state.level.traps.length, 0);
});
