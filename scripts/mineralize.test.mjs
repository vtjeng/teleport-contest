import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    MOAT,
    OBJ_BURIED,
    OBJ_FLOOR,
    POOL,
    ROOM,
    ROWNO,
    STONE,
    WATER,
    W_NONDIGGABLE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    UnsupportedMineralizeContextError,
    mineralize,
    water_has_kelp,
} from '../js/mineralize.js';
import { init_objects } from '../js/o_init.js';
import {
    AQUAMARINE,
    GEM_CLASS,
    GOLD_PIECE,
    KELP_FROND,
    ROCK,
    objects_globals_init,
} from '../js/objects.js';

const MAIN_DUNGEON = 0;
const FIRST_LEVEL = 1;
const FIRST_OBJECT_ID = 2; // context.ident reserves object id 1.
const MINERAL_X = 5;
const MINERAL_Y = 5;

function topologyState({ dnum = MAIN_DUNGEON, dlevel = FIRST_LEVEL } = {}) {
    const level = new GameMap();
    level.flags.arboreal = false;
    return {
        astral_level: { dnum: 8, dlevel: 1 },
        context: { ident: FIRST_OBJECT_ID, mon_moving: false },
        dungeons: Array.from({ length: 9 }, (_, index) => ({
            depth_start: index ? 20 : 1,
            flags: { hellish: false },
            ledger_start: index * 20,
            num_dunlevs: 20,
        })),
        flags: {},
        in_mklev: true,
        level,
        mines_dnum: 1,
        moves: 1,
        oracle_level: { dnum: MAIN_DUNGEON, dlevel: 0 },
        program_state: { gameover: false },
        quest_dnum: 2,
        rogue_level: { dnum: MAIN_DUNGEON, dlevel: 0 },
        specialLevels: [],
        tower_dnum: 7,
        u: {
            ulevel: 1,
            uz: { dnum, dlevel },
        },
        water_level: { dnum: 8, dlevel: 2 },
    };
}

function objectState(options = {}) {
    const state = topologyState(options);
    objects_globals_init(state);
    // Zero choices make catalog setup deterministic; mineral generation uses
    // a separate scripted source below.
    init_objects(state, () => 0);
    return state;
}

function fillTerrain(state, typ) {
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y)
            state.level.at(x, y).typ = typ;
    }
}

function makeStoneIsland(state, centerX, centerY) {
    // A 3x3 stone island has exactly one center with all eight stone
    // neighbors required by mineralize().
    for (let x = centerX - 1; x <= centerX + 1; ++x) {
        for (let y = centerY - 1; y <= centerY + 1; ++y)
            state.level.at(x, y).typ = STONE;
    }
}

function expectedCall(name, args, result) {
    return { name, args, result };
}

function scriptedRandom(script) {
    const remaining = [...script];
    const draw = (name, args) => {
        const expected = remaining.shift();
        assert.ok(expected, `unexpected ${name}(${args.join(',')})`);
        assert.equal(expected.name, name);
        assert.deepEqual(expected.args, args);
        return expected.result;
    };
    return {
        random: {
            rn2: (bound) => draw('rn2', [bound]),
            rnd: (bound) => draw('rnd', [bound]),
            rn1: (range, base) => draw('rn1', [range, base]),
            rne: (bound) => draw('rne', [bound]),
        },
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

function noUnexpectedObjectDraws(rn2Impl) {
    return {
        rn2: rn2Impl,
        rnd: () => assert.fail('unexpected rnd'),
        rn1: () => assert.fail('unexpected rn1'),
        rne: () => assert.fail('unexpected rne'),
    };
}

test('water_has_kelp preserves terrain and water-plane short circuits', () => {
    const state = topologyState();
    const x = 6;
    const y = 4;
    const location = state.level.at(x, y);

    location.typ = POOL;
    let script = scriptedRandom([
        expectedCall('rn2', [10], 0), // One-in-ten pool kelp succeeds.
    ]);
    assert.equal(water_has_kelp(x, y, 10, 30, {
        state,
        random: script.random,
    }), true);
    script.done();

    location.typ = MOAT;
    script = scriptedRandom([
        expectedCall('rn2', [30], 1), // Nonzero misses one-in-thirty moat kelp.
    ]);
    assert.equal(water_has_kelp(x, y, 10, 30, {
        state,
        random: script.random,
    }), false);
    script.done();

    location.typ = WATER;
    state.water_level = { ...state.u.uz };
    assert.equal(water_has_kelp(x, y, 10, 30, {
        state,
        random: noUnexpectedObjectDraws(
            () => assert.fail('the Plane of Water must not draw for kelp'),
        ),
    }), false);

    location.typ = POOL;
    assert.equal(water_has_kelp(x, y, 0, 0, {
        state,
        random: noUnexpectedObjectDraws(
            () => assert.fail('zero kelp divisors must short-circuit'),
        ),
    }), false);
});

test('mineralize scans kelp in x-major order before the mineral gate', () => {
    const state = objectState();
    fillTerrain(state, ROOM);
    state.level.at(2, 1).typ = MOAT;
    state.level.at(2, 2).typ = POOL;
    state.level.at(3, 1).typ = WATER;
    state.level.flags.arboreal = true;

    let rn2Calls = 0;
    let rndCalls = 0;
    const random = {
        rn2(bound) {
            assert.equal(bound, 1); // Divisor 1 selects every water square.
            ++rn2Calls;
            return 0;
        },
        rnd(bound) {
            assert.equal(bound, 2); // Object-id stride or kelp quantity.
            ++rndCalls;
            return 1;
        },
        rn1: () => assert.fail('unexpected rn1'),
        rne: () => assert.fail('unexpected rne'),
    };

    mineralize(1, 1, 0, 0, false, { state, random });

    assert.equal(state.level.objects[2][1].otyp, KELP_FROND);
    assert.equal(state.level.objects[2][1].o_id, FIRST_OBJECT_ID);
    assert.equal(state.level.objects[2][2].o_id, FIRST_OBJECT_ID + 1);
    assert.equal(state.level.objects[3][1].o_id, FIRST_OBJECT_ID + 2);
    assert.equal(rn2Calls, 3); // One selection draw for each water square.
    assert.equal(rndCalls, 6); // Each kelp uses an id draw and quantity draw.
});

test('mineralize retains the source y-skips in nonstone terrain', () => {
    class LoggingMap extends GameMap {
        constructor() {
            super();
            this.accesses = [];
        }

        at(x, y) {
            this.accesses.push([x, y]);
            return super.at(x, y);
        }
    }

    const state = topologyState();
    state.level = new LoggingMap();
    state.level.flags.arboreal = false;
    fillTerrain(state, ROOM);
    state.level.accesses = [];
    const random = noUnexpectedObjectDraws(
        () => assert.fail('room terrain cannot reach a probability draw'),
    );

    mineralize(0, 0, 0, 0, true, { state, random });

    // The kelp pass visits all 76x19 interior candidates first.
    const kelpAccesses = (COLNO - 4) * (ROWNO - 2);
    const mineralAccesses = state.level.accesses.slice(kelpAccesses);
    assert.deepEqual(
        mineralAccesses.slice(0, 7),
        [2, 5, 8, 11, 14, 17, 20].map((y) => [2, y]),
    );
    assert.deepEqual(
        mineralAccesses.slice(7, 14),
        [2, 5, 8, 11, 14, 17, 20].map((y) => [3, y]),
    );
    assert.equal(mineralAccesses.length, (COLNO - 4) * 7);
});

test('D:1 deposits preserve RNG order, weight, discard, and ownership', () => {
    const state = objectState();
    fillTerrain(state, ROOM);
    makeStoneIsland(state, MINERAL_X, MINERAL_Y);
    makeStoneIsland(state, 12, MINERAL_Y);
    state.level.at(12, MINERAL_Y).wall_info = W_NONDIGGABLE;

    const script = scriptedRandom([
        expectedCall('rn2', [1000], 0), // D:1 gold chance succeeds.
        expectedCall('rnd', [2], 1), // Gold consumes the next object id.
        expectedCall('rnd', [60], 17), // 20 gold probability gives range 60.
        expectedCall('rn2', [3], 0), // One-in-three deposits are buried.
        expectedCall('rn2', [1000], 0), // D:1 gem chance succeeds.
        expectedCall('rnd', [2], 2), // D:1 creates one or two gems.
        expectedCall('rnd', [1000], 1000), // Last probability bucket is ROCK.
        expectedCall('rnd', [2], 1), // Discarded rock still consumes an id.
        expectedCall('rn1', [6, 6], 6), // ROCK initializes a 6..11 stack.
        expectedCall('rnd', [1000], 1), // First live D:1 bucket is aquamarine.
        expectedCall('rnd', [2], 1), // Live gem consumes the following id.
        expectedCall('rn2', [6], 1), // Nonzero keeps a single gem quantity.
        expectedCall('rn2', [3], 1), // Nonzero places the gem on the floor.
    ]);

    mineralize(0, 0, -1, -1, false, {
        state,
        random: script.random,
    });
    script.done();

    const gold = state.level.buriedobjlist;
    assert.equal(gold.otyp, GOLD_PIECE);
    assert.equal(gold.where, OBJ_BURIED);
    assert.equal(gold.ox, MINERAL_X);
    assert.equal(gold.oy, MINERAL_Y);
    assert.equal(gold.quan, 18); // mineralize adds one to rnd(60)'s result 17.
    assert.equal(gold.owt, 1); // Fewer than 50 coins retain minimum weight 1.

    const gem = state.level.objects[MINERAL_X][MINERAL_Y];
    assert.equal(gem.otyp, AQUAMARINE);
    assert.equal(gem.where, OBJ_FLOOR);
    assert.equal(gem.ox, MINERAL_X);
    assert.equal(gem.oy, MINERAL_Y);
    assert.equal(gem.o_id, FIRST_OBJECT_ID + 2);
    assert.equal(state.context.ident, FIRST_OBJECT_ID + 3);
    assert.equal(state.level.objlist, gem);
    assert.equal(gem.nobj, null);
    assert.equal(gold.nobj, null);
    assert.equal(state.level.objects[12][MINERAL_Y], null);
    assert.notEqual(gem.otyp, ROCK);
});

test('level gates preserve special-level exceptions', () => {
    function probabilityDraws(modify) {
        const state = topologyState();
        fillTerrain(state, ROOM);
        makeStoneIsland(state, MINERAL_X, MINERAL_Y);
        modify(state);
        let calls = 0;
        const random = noUnexpectedObjectDraws((bound) => {
            assert.equal(bound, 1000); // Only gold and gem gates are reachable.
            ++calls;
            return 999; // Miss both zero-probability deposits.
        });
        mineralize(0, 0, 0, 0, false, { state, random });
        return calls;
    }

    assert.equal(probabilityDraws((state) => {
        state.dungeons[MAIN_DUNGEON].flags.hellish = true;
    }), 0);
    assert.equal(probabilityDraws((state) => {
        state.tower_dnum = MAIN_DUNGEON;
    }), 0);
    assert.equal(probabilityDraws((state) => {
        state.rogue_level = { ...state.u.uz };
    }), 0);
    assert.equal(probabilityDraws((state) => {
        state.level.flags.arboreal = true;
    }), 0);
    assert.equal(probabilityDraws((state) => {
        state.specialLevels = [{
            dlevel: { ...state.u.uz },
            flags: { town: false },
        }];
    }), 0);
    assert.equal(probabilityDraws((state) => {
        state.oracle_level = { ...state.u.uz };
        state.specialLevels = [{
            dlevel: { ...state.u.uz },
            flags: { town: false },
        }];
    }), 2); // Oracle levels remain mineral-eligible.
    assert.equal(probabilityDraws((state) => {
        state.mines_dnum = MAIN_DUNGEON;
        state.specialLevels = [{
            dlevel: { ...state.u.uz },
            flags: { town: false },
        }];
    }), 2); // Nontown Mines levels remain eligible.
    assert.equal(probabilityDraws((state) => {
        state.mines_dnum = MAIN_DUNGEON;
        state.specialLevels = [{
            dlevel: { ...state.u.uz },
            flags: { town: true },
        }];
    }), 0);
});

test('the endgame gate precedes kelp and missing topology fails explicitly', () => {
    const state = topologyState();
    fillTerrain(state, ROOM);
    state.level.at(2, 1).typ = POOL;
    state.astral_level = { ...state.u.uz };
    const random = noUnexpectedObjectDraws(
        () => assert.fail('the endgame gate must precede the kelp scan'),
    );

    mineralize(1, 1, 0, 0, false, { state, random });
    assert.equal(state.level.objects[2][1], null);

    state.astral_level = { dnum: 8, dlevel: 1 };
    delete state.tower_dnum;
    assert.throws(
        () => mineralize(0, 0, 0, 0, false, { state, random }),
        UnsupportedMineralizeContextError,
    );
});

test('Mines and Quest probability adjustments use C integer arithmetic', () => {
    function generatedGold({ mines, quantityBound }) {
        const state = objectState();
        fillTerrain(state, ROOM);
        makeStoneIsland(state, MINERAL_X, MINERAL_Y);
        if (mines) state.mines_dnum = MAIN_DUNGEON;
        else state.quest_dnum = MAIN_DUNGEON;

        const script = scriptedRandom([
            expectedCall('rn2', [1000], 0), // Gold gate succeeds.
            expectedCall('rnd', [2], 1), // Gold consumes one object id.
            expectedCall('rnd', [quantityBound], 7),
            expectedCall('rn2', [3], 1), // Place gold rather than bury it.
            expectedCall('rn2', [1000], 999), // Gem gate misses.
        ]);
        mineralize(0, 0, -1, -1, false, {
            state,
            random: script.random,
        });
        script.done();
        return state.level.objects[MINERAL_X][MINERAL_Y];
    }

    // D:1 base gold probability 20 doubles to 40 in the Mines, so the
    // quantity range is 3*40 = 120.
    assert.equal(generatedGold({ mines: true, quantityBound: 120 }).quan, 8);
    // Quest division truncates 20/4 to 5, so the quantity range is 3*5 = 15.
    assert.equal(generatedGold({ mines: false, quantityBound: 15 }).quan, 8);
});
