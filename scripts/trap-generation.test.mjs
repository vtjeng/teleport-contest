import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    DB_EAST,
    DB_FLOOR,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DART_TRAP,
    DRAWBRIDGE_UP,
    FIRE_TRAP,
    HOLE,
    ICE,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    MELT_ICE_AWAY,
    MKTRAP_NOSPIDERONWEB,
    NO_TRAP,
    PIT,
    ROCKTRAP,
    ROOM,
    RUST_TRAP,
    SPIKED_PIT,
    SQKY_BOARD,
    STAIRS,
    STATUE_TRAP,
    TELEP_TRAP,
    TRAPDOOR,
    TRAPPED_CHEST,
    TRAPPED_DOOR,
    TT_BEARTRAP,
    TT_LAVA,
    TT_NONE,
    TT_PIT,
    TT_WEB,
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

test('maketrap preflights seams before changing an existing trap', () => {
    const state = initializedState();
    const existing = maketrap(10, 5, ARROW_TRAP, { state });
    // Each nondefault value is a field resetTrap() would overwrite if a
    // missing subsystem were discovered too late.
    Object.assign(existing, {
        madeby_u: true,
        once: true,
        tnote: 9,
        vl: { launch_otyp: 27 },
    });
    const original = structuredClone(existing);

    assert.throws(
        () => maketrap(10, 5, STATUE_TRAP, { state }),
        /statue-trap subsystem/,
    );
    assert.deepEqual(existing, original);
    state.level.buriedobjlist = { ox: 10, oy: 5, nobj: null };
    assert.throws(
        () => maketrap(10, 5, PIT, { state }),
        /buried-object subsystem/,
    );
    assert.deepEqual(existing, original);

    state.level.buriedobjlist = null;
    const location = state.level.at(10, 5);
    location.typ = DRAWBRIDGE_UP;
    location.flags = DB_ICE;
    assert.throws(
        () => maketrap(10, 5, PIT, { state }),
        /obj_ice_effects/,
    );
    assert.deepEqual(existing, original);
    assert.deepEqual(state.level.traps, [existing]);
    assert.deepEqual(
        [location.typ, location.flags],
        [DRAWBRIDGE_UP, DB_ICE],
    );
});

test('maketrap resets only incompatible hero trap states during replacement', () => {
    const state = initializedState();
    const existing = maketrap(10, 5, ARROW_TRAP, { state });
    Object.assign(state.u, {
        ux: 10,
        uy: 5,
        // A positive duration means the hero is currently held by the trap.
        utrap: 7,
        utraptype: TT_BEARTRAP,
    });

    assert.throws(
        () => maketrap(10, 5, WEB, { state }),
        /hero-trap reset support/,
    );
    assert.equal(existing.ttyp, ARROW_TRAP);
    assert.deepEqual([state.u.utrap, state.u.utraptype], [7, TT_BEARTRAP]);

    const resets = [];
    const replacement = maketrap(10, 5, WEB, {
        state,
        resetUtrap(showMessage, env) {
            resets.push(showMessage);
            env.state.u.utrap = 0;
            env.state.u.utraptype = TT_NONE;
        },
    });
    assert.equal(replacement, existing);
    assert.deepEqual(resets, [false]);
    assert.deepEqual([state.u.utrap, state.u.utraptype], [0, TT_NONE]);

    const compatibleCases = [
        ['bear trap', TT_BEARTRAP, BEAR_TRAP, ROOM, 0],
        ['web', TT_WEB, WEB, ROOM, 0],
        ['pit family', TT_PIT, SPIKED_PIT, ROOM, 0],
        ['lava terrain', TT_LAVA, ARROW_TRAP, DRAWBRIDGE_UP, DB_LAVA],
    ];
    for (const [label, trapState, replacementType, terrain, flags]
        of compatibleCases) {
        const compatibleState = initializedState();
        const compatible = maketrap(10, 5, ARROW_TRAP, {
            state: compatibleState,
        });
        const location = compatibleState.level.at(10, 5);
        location.typ = terrain;
        location.flags = flags;
        Object.assign(compatibleState.u, {
            ux: 10,
            uy: 5,
            utrap: 7,
            utraptype: trapState,
        });
        assert.equal(
            maketrap(10, 5, replacementType, { state: compatibleState }),
            compatible,
            label,
        );
        assert.deepEqual(
            [compatibleState.u.utrap, compatibleState.u.utraptype],
            [7, trapState],
            label,
        );
    }
});

test('maketrap uses raised drawbridge-under terrain for pits and holes', () => {
    for (const under of [DB_MOAT, DB_LAVA]) {
        const state = initializedState();
        const location = state.level.at(10, 5);
        location.typ = DRAWBRIDGE_UP;
        location.flags = under;
        assert.equal(maketrap(10, 5, PIT, { state }), null);
        assert.deepEqual(state.level.traps, []);
    }

    const floorState = initializedState();
    const floor = floorState.level.at(10, 5);
    floor.typ = DRAWBRIDGE_UP;
    floor.flags = DB_FLOOR | DB_EAST;
    assert.ok(maketrap(10, 5, PIT, { state: floorState }));
    assert.deepEqual(
        [floor.typ, floor.flags],
        [DRAWBRIDGE_UP, DB_FLOOR | DB_EAST],
    );

    const iceState = initializedState();
    const ice = iceState.level.at(10, 5);
    ice.typ = DRAWBRIDGE_UP;
    ice.flags = DB_ICE | DB_EAST;
    const calls = [];
    assert.ok(maketrap(10, 5, HOLE, {
        state: iceState,
        // A nonzero result stops hole_destination() after one floor.
        random: { rn2: () => 1 },
        objIceEffects(x, y, force) {
            calls.push(['objects', x, y, force, ice.flags]);
        },
        spotStopTimers(x, y, action) {
            calls.push(['timers', x, y, action, ice.flags]);
        },
    }));
    assert.deepEqual(calls, [
        ['objects', 10, 5, true, DB_FLOOR | DB_EAST],
        ['timers', 10, 5, MELT_ICE_AWAY, DB_FLOOR | DB_EAST],
    ]);
    assert.deepEqual(
        [ice.typ, ice.flags],
        [DRAWBRIDGE_UP, DB_FLOOR | DB_EAST],
    );
});
