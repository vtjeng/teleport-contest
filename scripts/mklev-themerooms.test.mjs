import assert from 'node:assert/strict';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import {
    AGGRAVATE_MONSTER, ARMORSHOP, CLOUD, COLNO, CROSSWALL, DOOR, DUST, D_ISOPEN,
    D_CLOSED, D_LOCKED, D_NODOOR, D_TRAPPED,
    FILL_NONE, FILL_NORMAL, HWALL, ICE, LAVAPOOL, MKTRAP_MAZEFLAG,
    LR_TELE, MAXNROFROOMS, OROOM, POOL, ROOM, ROOMOFFSET, ROWNO,
    STATUE_TRAP, STONE,
    SDOOR, STRAT_WAITFORU, THEMEROOM, TLCORNER, TREE, VAULT, VWALL,
    WEAPONSHOP,
    W_ANY, W_RANDOM,
} from '../js/const.js';
import { depth, level_difficulty } from '../js/dungeon.js';
import { engr_at, make_engr_at } from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { initoptions_finish } from '../js/fruit.js';
import { game, resetGame } from '../js/gstate.js';
import { objectType } from '../js/obj.js';
import {
    add_doors_to_room,
    build_room,
    create_door,
    create_room_door,
    dispatch_themeroom,
    fill_special_room,
    initialize_themeroom_branch,
    lspo_map,
    mklev,
    run_room_descriptor,
    select_themeroom,
    themerooms_generate,
    UnsupportedThemeroomActionError,
} from '../js/mklev.js';
import {
    PM_FOG_CLOUD,
    PM_ETTIN_ZOMBIE,
    PM_GIANT_ZOMBIE,
    PM_SHOPKEEPER,
    PM_VAMPIRE_LEADER,
    S_HUMAN,
    S_LICH,
    S_MUMMY,
    S_VAMPIRE,
    S_ZOMBIE,
    monst_globals_init,
} from '../js/monsters.js';
import {
    ARMOR_CLASS,
    CHEST,
    CORPSE,
    GOLD_PIECE,
    GLASS,
    objects_globals_init,
    POT_EXTRA_HEALING,
    POT_HEALING,
    RIN_TELEPORTATION,
    SCR_TELEPORTATION,
    STATUE,
    SKELETON_KEY,
    WAN_DIGGING,
    WAN_MAGIC_MISSILE,
    WAN_STRIKING,
    WAN_TELEPORTATION,
    WEAPON_CLASS,
} from '../js/objects.js';
import { init_rect } from '../js/rect.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import { THEMEROOM_DEFINITIONS } from '../js/themeroom_data.js';
import { timeout_globals_init } from '../js/timeout.js';
import {
    initialize_themeroom_postprocess_branch,
    themeroom_fill,
} from '../js/themeroom_fill.js';
import { scriptedRandom, step } from './monster-scripted-random.mjs';

const LEVEL_ONE_RESERVOIR_DRAW_COUNT = 30;

function genericRoomPlacementDraws() {
    return [
        [100, 0], // build_room's default 100% chance
        [77, 1], // litstate_rnd keeps the room lit
        [1, 0], // select the sole initial free rectangle
        [12, 0], // width two
        [4, 0], // height two
        [70, 0], // leftmost valid x coordinate
        [13, 0], // upper-half y avoids the relocation-only rn1 branch
    ];
}

function definitionById(id) {
    return THEMEROOM_DEFINITIONS.find((definition) => definition.id === id);
}

function resetThemeroomLevel() {
    resetGame();
    game.level = new GameMap();
    game.u = { uz: { dnum: 0, dlevel: 1 } };
    game.smeq = new Array(MAXNROFROOMS + 1).fill(0);
    init_rect();
}

function buildFixedParentRoom() {
    const random = scriptedRandom([
        step('rn2', [100], 0),
        step('rnd', [5], 3),
        step('rnd', [5], 2),
        step('rnd', [3], 3),
        step('rnd', [3], 1),
    ]);
    const parent = build_room({
        x: -1,
        y: -1,
        w: 11,
        h: 9,
        rtype: OROOM,
        chance: 100,
        rlit: 0,
        needfill: FILL_NORMAL,
        joined: true,
    }, null, random.random.rn2, random.random.rnd);
    random.assertExhausted();
    return parent;
}

function buildDoorTestRooms() {
    // Sector (3,2), then center/top alignment, places an 11x9 parent at
    // (35,5)..(45,13) with ample stone outside its four walls.
    const parent = buildFixedParentRoom();
    const random = scriptedRandom([step('rn2', [100], 0)]);

    const child = build_room({
        // These source-relative coordinates put a 3x3 room wholly inside the
        // parent, leaving ordinary parent floor beyond every child wall.
        x: 4,
        y: 3,
        w: 3,
        h: 3,
        rtype: OROOM,
        chance: 100,
        rlit: 0,
        needfill: FILL_NORMAL,
        joined: false,
    }, parent, random.random.rn2, random.random.rnd);
    random.assertExhausted();
    // lspo_room() marks a parent irregular immediately after adding a child.
    parent.irregular = true;
    return { parent, child };
}

function initializeNewGame(seed) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    initRng(seed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'ThemeroomTest';
    game.flags = {
        initrole: str2role('Tourist'),
        initrace: str2race('human'),
        initgend: str2gend('female'),
        initalign: str2align('neutral'),
        female: true,
        bones: false,
    };
    game.iflags = {};
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    initoptions_finish({}, game);
    newgame_pre_mklev(game);
}

function initializeDirectThemeroomNewGame(seed) {
    initializeNewGame(seed);
    game.level = new GameMap();
    game.smeq = new Array(MAXNROFROOMS + 1).fill(0);
    game.in_mklev = true;
    init_rect();
}

function completeRandomFacade(random, randomOneBased, replacements = {}) {
    const unexpected = (name) => () => {
        assert.fail(`unexpected ${name} call`);
    };
    return {
        d: replacements.d ?? unexpected('d'),
        rn1: replacements.rn1 ?? unexpected('rn1'),
        rn2: random,
        rnd: randomOneBased,
        rne: replacements.rne ?? unexpected('rne'),
        rnz: replacements.rnz ?? unexpected('rnz'),
    };
}

test('themeroom reservoir selects Cross in source order', () => {
    const bounds = [];
    const selected = select_themeroom(1, (bound) => {
        bounds.push(bound);
        // Weight 1000 makes the default entry the initial choice. Returning
        // zero only at cumulative weight 1034 replaces it with Cross; the
        // final two eligible entries do not replace Cross.
        return bound === 1034 ? 0 : bound - 1;
    });

    assert.deepEqual(bounds, [
        // The 6/2/2 weighted fill-room variants cause the jumps from 1004
        // through 1014. Every following level-1 entry has weight one; Twin
        // businesses is excluded because its minimum difficulty is four.
        1000, 1001, 1002, 1003, 1004, 1010, 1012, 1014,
        ...Array.from({ length: 22 }, (_, index) => 1015 + index),
    ]);
    assert.equal(selected.name, 'Cross');
    assert.equal(selected.sourceKind, 'map');
    // These are Cross's source map dimensions and filler_region(6, 6) arguments.
    assert.equal(selected.width, 11);
    assert.equal(selected.height, 11);
    assert.deepEqual(selected.filler, { x: 6, y: 6 });
});

test('lspo_map places a Cross without a build_room chance draw', () => {
    const state = { level: new GameMap() };
    const calls = [];
    const results = [30, 4];
    const origin = lspo_map(definitionById('cross'), (bound) => {
        calls.push(bound);
        assert.ok(results.length, `unexpected rn2(${bound})`);
        return results.shift();
    }, state);

    // An 11-wide map uses 80 - 1 - 11 columns; an 11-high map uses
    // 21 - 11 rows. No rn2(100) room-chance call belongs between them.
    assert.deepEqual(calls, [68, 10]);
    // Draws 30 and 4 place the map at (31, 4). These cells sample Cross's
    // transparent corner, top wall, side wall, and interior floor.
    assert.deepEqual(origin, { x: 31, y: 4, width: 11, height: 11 });
    assert.equal(state.level.at(31, 4).typ, STONE); // transparent map 'x'
    assert.equal(state.level.at(34, 4).typ, HWALL);
    assert.equal(state.level.at(34, 4).horizontal, true);
    assert.equal(state.level.at(34, 5).typ, VWALL);
    assert.equal(state.level.at(34, 5).horizontal, false);
    assert.equal(state.level.at(35, 5).typ, ROOM);
});

test('lspo_map retries when the required stone halo is outside the map', () => {
    const state = { level: new GameMap() };
    const calls = [];
    const results = [0, 4, 30, 4];
    const origin = lspo_map(definitionById('cross'), (bound) => {
        calls.push(bound);
        assert.ok(results.length, `unexpected rn2(${bound})`);
        return results.shift();
    }, state);

    // The first x result gives origin column one, whose one-cell halo reaches
    // invalid column zero. The second candidate has a valid empty halo.
    assert.deepEqual(calls, [68, 10, 68, 10]);
    assert.equal(origin.x, 31);
    assert.equal(origin.y, 4);
});

test('themeroom generation connects selection, map placement, and filler region', async () => {
    resetGame();
    game.level = new GameMap();
    game.u = { uz: { dnum: 0, dlevel: 1 } };
    game.smeq = new Array(MAXNROFROOMS + 1).fill(0);
    const calls = [];
    // At difficulty one, all 30 eligible descriptors have positive frequency,
    // so selection consumes one reservoir draw per descriptor.
    let reservoirCalls = 0;
    const random = (bound) => {
        calls.push(bound);
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT)
            return bound === 1034 ? 0 : bound - 1;
        // Place at (31,4), choose the 70% ordinary-fill branch, and leave the
        // resulting level-1 region lit after litstate_rnd's second draw.
        const scripted = new Map([[68, 30], [10, 4], [100, 99], [77, 76]]);
        assert.ok(scripted.has(bound), `unexpected rn2(${bound})`);
        return scripted.get(bound);
    };
    const randomOneBased = (bound) => {
        assert.equal(bound, 2); // rnd(1 + abs(level depth)) at depth one
        return 2;
    };

    assert.equal(await themerooms_generate(
        1,
        random,
        randomOneBased,
        {
            randomFacade: completeRandomFacade(random, randomOneBased),
            themeroomFill() {
                assert.fail('ordinary filler-region branch must not fill');
            },
        },
    ), true);
    assert.deepEqual(
        calls.slice(LEVEL_ONE_RESERVOIR_DRAW_COUNT),
        [68, 10, 100, 77],
    );
    assert.equal(game.level.nroom, 1);
    const room = game.level.rooms[0];
    // Flooding from Cross's translated filler point (37, 10) registers its 9x9
    // interior bounds and assigns the adjacent top wall to the same irregular
    // room. The wall remains generic HWALL until post-level wallification.
    assert.deepEqual(
        [room.lx, room.ly, room.hx, room.hy],
        [32, 5, 40, 13],
    );
    assert.equal(room.irregular, true);
    assert.equal(room.needjoining, true);
    assert.equal(game.level.at(37, 10).roomno, ROOMOFFSET);
    assert.equal(game.level.at(34, 4).roomno, ROOMOFFSET);
    assert.notEqual(game.level.at(34, 4).typ, CROSSWALL);
});

test('live filler maps invoke their optional themed fill synchronously', async () => {
    resetThemeroomLevel();
    let reservoirCalls = 0;
    const events = [];
    const scripted = [
        [68, 30], [10, 4], // place Cross at (31,4)
        [100, 0], // take filler_region's 30% themed branch
        [77, 76], // light the region at depth one
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT)
            return bound === 1034 ? 0 : bound - 1;
        const next = scripted.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        assert.equal(bound, 2);
        return 2;
    };
    const randomFacade = completeRandomFacade(random, randomOneBased);
    let callbackCount = 0;

    assert.equal(await themerooms_generate(
        1,
        random,
        randomOneBased,
        {
            randomFacade,
            themeroomFill(room, difficulty, callbackEnv) {
                ++callbackCount;
                assert.equal(room, game.level.rooms[0]);
                assert.equal(room.rtype, THEMEROOM);
                assert.equal(room.irregular, true);
                assert.equal(room.needjoining, true);
                assert.equal(room.needfill, FILL_NORMAL);
                assert.equal(difficulty, 1);
                assert.equal(callbackEnv.state, game);
                assert.equal(callbackEnv.random, randomFacade);
            },
        },
    ), true);
    assert.equal(callbackCount, 1);
    assert.equal(scripted.length, 0);
    assert.deepEqual(events.slice(LEVEL_ONE_RESERVOIR_DRAW_COUNT), [
        'rn2(68)', 'rn2(10)', 'rn2(100)', 'rnd(2)', 'rn2(77)',
    ]);
});

test('live filler maps execute the selected default themed fill', async () => {
    resetThemeroomLevel();
    let reservoirCalls = 0;
    let fillBound = 0;
    const events = [];
    const scripted = [
        [68, 30], [10, 4], // place Cross at (31,4)
        [100, 0], // take filler_region's 30% themed branch
        [77, 76], // light the region at depth one
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT)
            return bound === 1034 ? 0 : bound - 1;
        if (scripted.length) {
            const next = scripted.shift();
            assert.equal(bound, next[0]);
            return next[1];
        }
        if (fillBound < 13) {
            assert.equal(bound, ++fillBound);
            // Retain Ice room, the first eligible fill descriptor.
            return bound - 1;
        }
        assert.equal(bound, 100);
        return 99; // do not schedule melt timers
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        assert.equal(bound, 2);
        return 2;
    };

    assert.equal(await themerooms_generate(
        1,
        random,
        randomOneBased,
        { randomFacade: completeRandomFacade(random, randomOneBased) },
    ), true);
    assert.equal(scripted.length, 0);
    assert.equal(fillBound, 13);
    assert.deepEqual(events.slice(LEVEL_ONE_RESERVOIR_DRAW_COUNT), [
        'rn2(68)', 'rn2(10)', 'rn2(100)', 'rnd(2)', 'rn2(77)',
        ...Array.from({ length: 13 }, (_, index) => `rn2(${index + 1})`),
        'rn2(100)',
    ]);
    const room = game.level.rooms[0];
    assert.equal(room.rtype, THEMEROOM);
    assert.equal(room.irregular, true);
    assert.equal(game.level.at(37, 10).typ, ICE);
});

test('live generic room generation keeps the injected RNG streams', async () => {
    resetThemeroomLevel();
    let reservoirCalls = 0;
    const events = [];
    const scripted = genericRoomPlacementDraws();
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT) return bound - 1;
        const next = scripted.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        assert.equal(bound, 2); // rnd(1 + abs(depth)) at depth one
        return 2;
    };

    assert.equal(await themerooms_generate(
        1,
        random,
        randomOneBased,
    ), true);
    assert.equal(scripted.length, 0);
    assert.deepEqual(events.slice(LEVEL_ONE_RESERVOIR_DRAW_COUNT), [
        'rn2(100)', 'rnd(2)', 'rn2(77)', 'rn2(1)',
        'rn2(12)', 'rn2(4)', 'rn2(70)', 'rn2(13)',
    ]);
    assert.equal(game.level.nroom, 1);
});

test('live generic themed rooms invoke their synchronous fill callback', async () => {
    resetThemeroomLevel();
    let reservoirCalls = 0;
    const events = [];
    const scripted = genericRoomPlacementDraws();
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT) {
            // The first weighted generic themed-room descriptor ends at 1010.
            return bound === 1010 ? 0 : bound - 1;
        }
        const next = scripted.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        assert.equal(bound, 2);
        return 2;
    };
    const randomFacade = completeRandomFacade(random, randomOneBased);
    let callbackCount = 0;

    assert.equal(await themerooms_generate(
        1,
        random,
        randomOneBased,
        {
            randomFacade,
            themeroomFill(room, difficulty, callbackEnv) {
                ++callbackCount;
                assert.equal(difficulty, 1);
                assert.equal(room.rtype, THEMEROOM);
                assert.equal(room.needfill, FILL_NONE);
                assert.equal(callbackEnv.state, game);
                assert.equal(callbackEnv.random, randomFacade);
            },
        },
    ), true);
    assert.equal(callbackCount, 1);
    assert.equal(scripted.length, 0);
    assert.deepEqual(events.slice(LEVEL_ONE_RESERVOIR_DRAW_COUNT), [
        'rn2(100)', 'rnd(2)', 'rn2(77)', 'rn2(1)',
        'rn2(12)', 'rn2(4)', 'rn2(70)', 'rn2(13)',
    ]);
    assert.equal(game.level.nroom, 1);
});

test('live generic fill dispatch executes selected Statuary', async () => {
    resetThemeroomLevel();
    let reservoirCalls = 0;
    const events = [];
    let fillBound = 0;
    const scripted = genericRoomPlacementDraws();
    const bodyDraws = [
        [5, 0], [5, 0], [5, 0], [5, 0], [5, 0],
        [3, 0],
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT) {
            // Select Default room with themed fill from the outer reservoir.
            return bound === 1010 ? 0 : bound - 1;
        }
        if (scripted.length) {
            const next = scripted.shift();
            assert.equal(bound, next[0]);
            return next[1];
        }
        if (fillBound < 13) {
            assert.equal(bound, ++fillBound);
            // Select Statuary at cumulative weight nine, then retain it
            // through every later eligible fill.
            return bound === 9 ? 0 : bound - 1;
        }
        const next = bodyDraws.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        assert.equal(bound, 2);
        return 2;
    };

    const roomCoordinateCalls = [];
    const randomFacade = completeRandomFacade(random, randomOneBased, {
        rn1(bound, base) {
            roomCoordinateCalls.push([bound, base]);
            return base;
        },
    });
    const objects = [];
    const traps = [];
    let filledRoom = null;
    assert.equal(await themerooms_generate(
        1,
        random,
        randomOneBased,
        {
            randomFacade,
            themeroomFill(room, difficulty, callbackEnv) {
                filledRoom = room;
                return themeroom_fill(room, difficulty, {
                    ...callbackEnv,
                    hooks: {
                        createObject(specification) {
                            objects.push(specification);
                            return {};
                        },
                        createTrap(type, flags, x, y) {
                            traps.push([type, flags, x, y]);
                            return {};
                        },
                    },
                });
            },
        },
    ), true);
    assert.equal(scripted.length, 0);
    assert.equal(bodyDraws.length, 0);
    assert.equal(fillBound, 13);
    assert.deepEqual(events.slice(LEVEL_ONE_RESERVOIR_DRAW_COUNT), [
        'rn2(100)', 'rnd(2)', 'rn2(77)', 'rn2(1)',
        'rn2(12)', 'rn2(4)', 'rn2(70)', 'rn2(13)',
        ...Array.from({ length: 13 }, (_, index) => `rn2(${index + 1})`),
        ...Array(5).fill('rn2(5)'),
        'rn2(3)',
    ]);
    assert.equal(game.level.nroom, 1);
    assert.equal(filledRoom, game.level.rooms[0]);
    assert.equal(filledRoom.rtype, THEMEROOM);
    assert.equal(filledRoom.needfill, FILL_NONE);
    assert.deepEqual(objects, Array(5).fill({ id: STATUE }));
    assert.deepEqual(roomCoordinateCalls, [
        [filledRoom.hx - filledRoom.lx + 1, filledRoom.lx],
        [filledRoom.hy - filledRoom.ly + 1, filledRoom.ly],
    ]);
    assert.deepEqual(traps, [[
        STATUE_TRAP,
        MKTRAP_MAZEFLAG,
        filledRoom.lx,
        filledRoom.ly,
    ]]);
});

test('live default fill executes supported handlers and propagates their errors', async () => {
    resetThemeroomLevel();
    // All 30 outer descriptors are eligible at difficulty one.
    let reservoirCalls = 0;
    let fillBound = 0;
    const marker = new Error('supported fill marker');
    const scripted = genericRoomPlacementDraws();
    const random = (bound) => {
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT) {
            // Select Default room with themed fill from the outer reservoir.
            return bound === 1010 ? 0 : bound - 1;
        }
        if (scripted.length) {
            const next = scripted.shift();
            assert.equal(bound, next[0]);
            return next[1];
        }
        // A lit D:1 room has 13 eligible fill descriptors: Boulder is too
        // difficult and Light source requires darkness.
        if (fillBound < 13) {
            assert.equal(bound, ++fillBound);
            // Retain Ice room, the first eligible fill, through the reservoir.
            return bound - 1;
        }
        // Ice room has already changed every room cell before its melt-chance
        // draw. An unrelated handler error must escape the default dispatcher.
        assert.equal(bound, 100);
        throw marker;
    };
    const randomOneBased = (bound) => {
        // litstate_rnd uses rnd(1 + abs(depth)) at dungeon depth one.
        assert.equal(bound, 2);
        return 2;
    };

    await assert.rejects(
        themerooms_generate(
            1,
            random,
            randomOneBased,
            { randomFacade: completeRandomFacade(random, randomOneBased) },
        ),
        (error) => error === marker,
    );
    assert.equal(scripted.length, 0);
    assert.equal(fillBound, 13);
    assert.equal(game.level.nroom, 1);
    const room = game.level.rooms[0];
    assert.equal(room.rtype, THEMEROOM);
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y)
            assert.equal(game.level.at(x, y).typ, ICE);
    }
});

test('makerooms uses adjusted level difficulty for eligibility', async () => {
    // Aggravate Monster doubles difficulty on this regular Dungeons-of-Doom
    // level.  Raw depth two excludes difficulty-four Twin businesses, while
    // source difficulty four includes its 31st outer-reservoir draw.
    // Newly chosen seed 15 enters the real room path and completes the
    // currently supported noninitial-level generation without a test seam.
    initializeNewGame(15);
    game.u.uz = { dnum: 0, dlevel: 2 };
    game.u.uprops[AGGRAVATE_MONSTER].extrinsic = 1;
    assert.equal(depth(game.u.uz, game), 2);
    assert.equal(level_difficulty(game), 4);

    enableRngLog();
    await mklev();
    const log = getRngLog();
    const reservoirStart = log.findIndex((entry) => entry.startsWith('rn2(1000)='));
    assert.ok(reservoirStart >= 0);
    const bounds = log.slice(reservoirStart, reservoirStart + 31).map((entry) => {
        const match = /^rn2\((\d+)\)=/.exec(entry);
        assert.ok(match, entry);
        return Number(match[1]);
    });
    assert.deepEqual(bounds, [
        1000, 1001, 1002, 1003, 1004, 1010, 1012, 1014,
        ...Array.from({ length: 23 }, (_, index) => 1015 + index),
    ]);
    assert.deepEqual([game.xstart, game.ystart], [0, 0]);
});

test('failed vault realization performs the one source retry attempt', async () => {
    initializeNewGame(2);
    enableRngLog();
    await mklev();

    // The first staged vault no longer fits after corridor generation. One
    // free rectangle remains, but it is too small: the condition's rnd_rect()
    // draw plus create_room()'s 101 do-while attempts produce this exact run.
    let longestRun = 0;
    let currentRun = 0;
    for (const entry of getRngLog()) {
        if (entry === 'rn2(1)=0') {
            longestRun = Math.max(longestRun, ++currentRun);
        } else {
            currentRun = 0;
        }
    }
    assert.equal(longestRun, 102);
    assert.equal(game.level.flags.has_vault, false);
    assert.equal(
        game.level.rooms.slice(0, game.level.nroom)
            .some((room) => room.rtype === VAULT),
        false,
    );
});

test('successful vault retry realizes and fills its replacement room', async () => {
    // A precise branch-coverage probe on this newly chosen seed verifies that
    // the staged vault at (39,17) fails check_room(), then create_vault()
    // stages the successful replacement at (52,16).
    initializeNewGame(405);
    enableRngLog();
    await mklev();

    assert.deepEqual(getRngLog().slice(859, 863), [
        'rn2(3)=2', // rnd_rect() selects the remaining free rectangle
        'rn2(3)=2', 'rn2(5)=4', 'rn2(4)=1', // create_vault()
    ]);
    assert.equal(game.level.flags.has_vault, true);
    assert.deepEqual([game.vault_x, game.vault_y], [52, 16]);
    const vaults = game.level.rooms.slice(0, game.level.nroom)
        .filter((room) => room.rtype === VAULT);
    assert.equal(vaults.length, 1);
    assert.deepEqual(
        [vaults[0].lx, vaults[0].ly, vaults[0].hx, vaults[0].hy],
        [52, 16, 53, 17],
    );
    assert.deepEqual(
        [
            game.level.objects[52][16], game.level.objects[52][17],
            game.level.objects[53][16], game.level.objects[53][17],
        ].map((object) => [object.otyp, object.quan]),
        [
            [GOLD_PIECE, 235], [GOLD_PIECE, 216],
            [GOLD_PIECE, 196], [GOLD_PIECE, 187],
        ],
    );
});

test('mklev discards exclusion zones retained from the previous level', async () => {
    initializeNewGame(450);
    const staleZone = {
        zonetype: LR_TELE,
        lx: 1,
        ly: 1,
        hx: 2,
        hy: 2,
        next: null,
    };
    game.exclusion_zones = staleZone;

    await mklev();

    for (let zone = game.exclusion_zones; zone; zone = zone.next)
        assert.notEqual(zone, staleZone);
});

test('mklev runs themed-room postprocessing before final wallification', async () => {
    // Seed 450 completes the supported initial-level generation path. Calling
    // mklev() reaches its first async boundary after clearing the level and
    // initializing branch state, where this injected callback joins the live
    // generation attempt without relying on a seed-selected themed room.
    initializeNewGame(450);
    const generation = mklev();
    const queue = initialize_themeroom_postprocess_branch(game);
    let callbackCount = 0;
    let marker = null;
    queue.push({
        handler(_data, env) {
            ++callbackCount;
            assert.equal(env.state, game);
            assert.equal(game.in_mklev, true);
            assert.equal(game.in_mk_themerooms, true);
            assert.deepEqual(
                [game.xstart, game.ystart, game.xsize, game.ysize],
                [1, 0, COLNO - 1, ROWNO],
            );

            // An isolated wall inside a 3x3 stone patch is removed by the
            // wall_cleanup() phase that must follow this callback.
            findPatch:
            for (let x = 2; x < COLNO - 1; ++x) {
                for (let y = 1; y < ROWNO - 1; ++y) {
                    let allStone = true;
                    for (let dx = -1; dx <= 1 && allStone; ++dx) {
                        for (let dy = -1; dy <= 1; ++dy) {
                            if (game.level.at(x + dx, y + dy).typ !== STONE) {
                                allStone = false;
                                break;
                            }
                        }
                    }
                    if (!allStone) continue;
                    marker = { x, y };
                    game.level.at(x, y).typ = HWALL;
                    break findPatch;
                }
            }
            assert.ok(marker, 'generated level should retain a 3x3 stone patch');
        },
        data: null,
    });

    await generation;

    assert.equal(callbackCount, 1);
    assert.notEqual(game.themeroom_postprocess[0], queue);
    assert.deepEqual(game.themeroom_postprocess[0], []);
    assert.equal(game.level.at(marker.x, marker.y).typ, STONE);
    assert.deepEqual(
        [game.xstart, game.ystart, game.xsize, game.ysize],
        [0, 0, COLNO - 1, ROWNO],
    );
    assert.equal(game.in_mk_themerooms, false);
    assert.equal(game.in_mklev, false);
});

test('generic room descriptors set topology and flags before synchronous contents', () => {
    const cases = [
        // The source default is an ordinary room scheduled for normal fill.
        ['default', OROOM, FILL_NORMAL, false],
        // The three weighted variants are themed; only the last also requests
        // ordinary room contents through filled=1.
        ['default-room-with-themed-fill', THEMEROOM, FILL_NONE, true],
        ['unlit-room-with-themed-fill', THEMEROOM, FILL_NONE, true],
        ['room-with-both-normal-contents-and-themed-fill', THEMEROOM, FILL_NORMAL, true],
    ];

    for (const [id, roomType, needfill, hasContents] of cases) {
        resetThemeroomLevel();
        let phase = 'dispatching';
        let callbackCount = 0;
        const random = () => 0;
        const randomOneBased = (bound) => bound;
        const randomFacade = completeRandomFacade(random, randomOneBased);
        const result = dispatch_themeroom(
            definitionById(id),
            random,
            randomOneBased,
            {
                difficulty: 1,
                randomFacade,
                themeroomFill(room, difficulty, callbackEnv) {
                    ++callbackCount;
                    assert.equal(phase, 'dispatching');
                    assert.equal(difficulty, 1);
                    assert.equal(typeof difficulty, 'number');
                    assert.equal(callbackEnv.state, game);
                    assert.equal(callbackEnv.random, randomFacade);
                    assert.equal(room.rtype, roomType);
                    assert.equal(room.needfill, needfill);
                    assert.equal(room.needjoining, true);
                    assert.equal(
                        game.level.at(room.lx, room.ly).roomno,
                        ROOMOFFSET,
                    );
                },
            },
        );
        phase = 'returned';

        assert.equal(result, true, id);
        assert.equal(callbackCount, hasContents ? 1 : 0, id);
        assert.equal(game.level.nroom, 1, id);
        const room = game.level.rooms[0];
        assert.equal(room.rtype, roomType, id);
        assert.equal(room.needfill, needfill, id);
        assert.equal(room.needjoining, true, id);
        if (id === 'unlit-room-with-themed-fill')
            assert.equal(room.rlit, 0);
    }
});

test('generic room relocation keeps rn1 distinct from rnd', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [100], 0),
        step('rnd', [2], 2), // rnd(1 + abs(depth)) at depth one
        step('rn2', [77], 1),
        step('rn2', [1], 0),
        step('rn2', [12], 0),
        step('rn2', [4], 3), // height five triggers lower-half relocation
        step('rn2', [70], 0),
        step('rn2', [10], 9),
        step('rn2', [3], 0), // rn1(3, 2) expands to rn2(3) + 2
    ]);
    assert.equal(dispatch_themeroom(
        definitionById('default'),
        random.random.rn2,
        random.random.rnd,
        { difficulty: 1 },
    ), true);
    random.assertExhausted();
    assert.equal(game.level.rooms[0].ly, 2);
});

test('build_room places a partially specified top-level room in source order', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [100], 0), // keep the requested room type
        step('rnd', [2], 2), // depth-one lighting bound
        step('rn2', [77], 76), // light the room
        step('rnd', [5], 3), // horizontal sector
        step('rnd', [5], 2), // vertical sector
        step('rnd', [3], 3), // align right within the horizontal sector
        step('rnd', [3], 1), // align top within the vertical sector
    ]);

    const room = build_room({
        x: -1,
        y: -1,
        w: 11,
        h: 9,
        xalign: -1,
        yalign: -1,
        rtype: OROOM,
        chance: 100,
        rlit: -1,
        needfill: FILL_NORMAL,
        joined: false,
    }, null, random.random.rn2, random.random.rnd);

    random.assertExhausted();
    assert.equal(room, game.level.rooms[0]);
    assert.deepEqual(
        [room.lx, room.ly, room.hx, room.hy],
        [35, 5, 45, 13],
    );
    assert.equal(room.rlit, 1);
    assert.equal(room.needfill, FILL_NORMAL);
    assert.equal(room.needjoining, false);
    assert.equal(game.level.at(35, 5).roomno, ROOMOFFSET);
    assert.equal(game.level.at(34, 4).typ, TLCORNER);
});

test('build_room creates and indexes random nested subrooms', () => {
    resetThemeroomLevel();
    const parent = buildFixedParentRoom();
    const random = scriptedRandom([
        step('rn2', [100], 0), // keep the requested room type
        step('rnd', [8], 4), // child width within the 11-wide parent
        step('rnd', [6], 3), // child height within the 9-high parent
        step('rnd', [7], 1), // left edge adjusts from one to zero
        step('rnd', [6], 5), // bottom edge adjusts from five to six
        step('rnd', [2], 2), // depth-one lighting bound
        step('rn2', [77], 76), // light the child
    ]);

    const child = build_room({
        x: -1,
        y: -1,
        w: -1,
        h: -1,
        rtype: THEMEROOM,
        chance: 100,
        rlit: -1,
        needfill: FILL_NORMAL,
        joined: false,
    }, parent, random.random.rn2, random.random.rnd);

    random.assertExhausted();
    assert.equal(parent.nsubrooms, 1);
    assert.equal(parent.sbrooms[0], child);
    assert.equal(game.nsubroom, 1);
    assert.equal(game.subrooms[0], child);
    assert.equal(game.subrooms[1].hx, -1);
    assert.equal(child.roomnoidx, MAXNROFROOMS + 1);
    assert.deepEqual(
        [child.lx, child.ly, child.hx, child.hy],
        [parent.lx, parent.ly + 6, parent.lx + 3, parent.hy],
    );
    assert.equal(child.rlit, 1);
    assert.equal(child.needfill, FILL_NORMAL);
    assert.equal(child.needjoining, false);
    assert.equal(
        game.level.at(child.lx, child.ly).roomno,
        child.roomnoidx + ROOMOFFSET,
    );
});

test('nested room failure preserves ancestor finalization and short-circuits siblings', () => {
    resetThemeroomLevel();
    const parent = buildFixedParentRoom();
    const random = scriptedRandom([
        step('rn2', [100], 0), // create the 3x3 ancestor subroom
        step('rn2', [4], 0), // place its door on the north wall
        step('rn2', [100], 0), // attempt the too-small nested room
    ]);
    const context = {
        definition: { id: 'nested-failure-test' },
        random: random.random.rn2,
        randomOneBased: random.random.rnd,
        roomFailed: false,
    };
    let skippedContents = false;

    const ancestor = run_room_descriptor(
        {
            type: 'ordinary', x: 4, y: 3, w: 3, h: 3,
            lit: 0, filled: FILL_NONE,
        },
        parent,
        context,
        (created) => {
            assert.equal(create_room_door(
                { state: 'open', wall: 'north', pos: 1 },
                created,
                context.random,
            ), true);
            assert.equal(run_room_descriptor(
                { type: 'ordinary', x: 0, y: 0, w: 1, h: 1, lit: 0 },
                created,
                context,
            ), null);
            assert.equal(context.roomFailed, true);
            assert.equal(run_room_descriptor(
                { type: 'unsupported' },
                created,
                context,
                () => { skippedContents = true; },
            ), null);
        },
    );

    random.assertExhausted();
    assert.equal(context.roomFailed, true);
    assert.equal(skippedContents, false);
    assert.equal(ancestor, game.subrooms[0]);
    const door = { x: ancestor.lx + 1, y: ancestor.ly - 1 };
    assert.deepEqual(game.level.doors, [door]);
    assert.deepEqual([ancestor.fdoor, ancestor.doorct], [0, 1]);
});

test('live Fake Delphi builds and registers its nested room in source order', async () => {
    resetThemeroomLevel();
    let reservoirCalls = 0;
    const events = [];
    const coreDraws = [
        [100, 0], [77, 76], // outer room chance and lighting
        [100, 0], [77, 76], // fixed child chance and lighting
        [5, 4], // lspo_door's discarded random state
        [3, 1], // choose an empty doorway
        [4, 0], [3, 1], // north wall, centered position
    ];
    const oneBasedDraws = [
        [2, 2], // outer lighting depth roll
        [5, 3], [5, 2], // outer room sectors
        [3, 3], [3, 1], // outer center/top alignment
        [2, 2], // child lighting depth roll
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < LEVEL_ONE_RESERVOIR_DRAW_COUNT) {
            // Fake Delphi is the second source entry, at cumulative weight
            // 1001. Later entries retain it by returning their final slot.
            return bound === 1001 ? 0 : bound - 1;
        }
        const next = coreDraws.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        const next = oneBasedDraws.shift();
        assert.ok(next, `unexpected rnd(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };

    assert.equal(await themerooms_generate(
        1,
        random,
        randomOneBased,
    ), true);
    assert.equal(coreDraws.length, 0);
    assert.equal(oneBasedDraws.length, 0);
    assert.deepEqual(events.slice(LEVEL_ONE_RESERVOIR_DRAW_COUNT), [
        'rn2(100)', 'rnd(2)', 'rn2(77)',
        'rnd(5)', 'rnd(5)', 'rnd(3)', 'rnd(3)',
        'rn2(100)', 'rnd(2)', 'rn2(77)',
        'rn2(5)', 'rn2(3)', 'rn2(4)', 'rn2(3)',
    ]);

    assert.equal(game.level.nroom, 1);
    assert.equal(game.nsubroom, 1);
    const parent = game.level.rooms[0];
    const child = game.subrooms[0];
    assert.deepEqual(
        [parent.lx, parent.ly, parent.hx, parent.hy],
        [35, 5, 45, 13],
    );
    assert.deepEqual(
        [child.lx, child.ly, child.hx, child.hy],
        [39, 8, 41, 10],
    );
    assert.equal(parent.irregular, true);
    assert.equal(parent.needfill, FILL_NORMAL);
    assert.equal(child.needfill, FILL_NORMAL);
    assert.equal(child.needjoining, true);

    const door = { x: 40, y: 7 };
    const loc = game.level.at(door.x, door.y);
    assert.equal(loc.typ, DOOR);
    assert.equal(loc.doormask, D_NODOOR);
    assert.deepEqual(game.level.doors, [door, door]);
    assert.deepEqual(
        [child.fdoor, child.doorct, parent.fdoor, parent.doorct],
        [0, 1, 1, 1],
    );
});

test('Room in a room preserves random room and door source order', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [100], 0), // keep the outer ordinary room type
        step('rnd', [2], 2), // depth-one outer lighting bound
        step('rn2', [77], 76), // light the outer room
        step('rn2', [1], 0), // select the sole free rectangle
        step('rn2', [12], 8), // outer extent is ten plus its inclusive cell
        step('rn2', [4], 3), // outer extent is five plus its inclusive cell
        step('rn2', [62], 10), // outer left edge becomes column 13
        step('rn2', [10], 2), // outer top edge becomes row 4
        step('rn2', [100], 0), // keep the child ordinary room type
        step('rnd', [8], 4), // four-cell child width
        step('rnd', [3], 2), // two-cell child height
        step('rnd', [7], 2), // child x offset inside the parent
        step('rnd', [4], 2), // child y offset inside the parent
        step('rnd', [2], 2), // depth-one child lighting bound
        step('rn2', [77], 76), // light the child
        step('rn2', [5], 4), // discarded lspo_door random state
        step('rn2', [3], 1), // actual state is D_NODOOR
        step('rn2', [4], 0), // north wall
        step('rn2', [4], 1), // second cell along the four-cell wall
    ]);

    assert.equal(dispatch_themeroom(
        definitionById('room-in-a-room'),
        random.random.rn2,
        random.random.rnd,
        { difficulty: 1 },
    ), true);
    random.assertExhausted();

    assert.equal(game.level.nroom, 1);
    assert.equal(game.nsubroom, 1);
    const parent = game.level.rooms[0];
    const child = game.subrooms[0];
    assert.deepEqual(
        [parent.lx, parent.ly, parent.hx, parent.hy],
        [13, 4, 23, 9],
    );
    assert.deepEqual(
        [child.lx, child.ly, child.hx, child.hy],
        [15, 6, 18, 7],
    );
    assert.equal(parent.irregular, true);
    assert.equal(parent.needfill, FILL_NORMAL);
    assert.equal(child.needfill, FILL_NONE);

    const door = { x: 16, y: 5 };
    assert.equal(game.level.at(door.x, door.y).doormask, D_NODOOR);
    assert.deepEqual(game.level.doors, [door, door]);
    assert.deepEqual(
        [child.fdoor, child.doorct, parent.fdoor, parent.doorct],
        [0, 1, 1, 1],
    );
});

test('Huge nested room creates both source-ordered optional doors', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [10], 0), // outer width 11
        step('rn2', [5], 0), // outer height 8
        step('rn2', [100], 0), // keep the outer ordinary room type
        step('rnd', [2], 2), // depth-one outer lighting bound
        step('rn2', [77], 76), // light the outer room
        step('rnd', [5], 3), // horizontal sector
        step('rnd', [5], 2), // vertical sector
        step('rnd', [3], 3), // center within the horizontal sector
        step('rnd', [3], 1), // top within the vertical sector
        step('rn2', [100], 0), // pass the 90-percent child gate
        step('rn2', [100], 0), // keep the child ordinary room type
        step('rnd', [8], 4), // four-cell child width
        step('rnd', [5], 3), // three-cell child height
        step('rnd', [7], 2), // child x offset
        step('rnd', [5], 2), // child y offset
        step('rnd', [2], 2), // depth-one child lighting bound
        step('rn2', [77], 76), // light the child
        step('rn2', [5], 4), // first discarded random door state
        step('rn2', [3], 1), // first actual state is D_NODOOR
        step('rn2', [4], 0), // first door uses the north wall
        step('rn2', [4], 1), // first door x offset
        step('rn2', [100], 0), // pass the 50-percent second-door gate
        step('rn2', [5], 4), // second discarded random door state
        step('rn2', [3], 1), // second actual state is D_NODOOR
        step('rn2', [4], 1), // second door uses the south wall
        step('rn2', [4], 2), // second door x offset
    ]);

    assert.equal(dispatch_themeroom(
        definitionById('huge-room-with-another-room-inside'),
        random.random.rn2,
        random.random.rnd,
        { difficulty: 1 },
    ), true);
    random.assertExhausted();

    const parent = game.level.rooms[0];
    const child = game.subrooms[0];
    assert.deepEqual(
        [parent.lx, parent.ly, parent.hx, parent.hy],
        [35, 5, 45, 12],
    );
    assert.deepEqual(
        [child.lx, child.ly, child.hx, child.hy],
        [37, 7, 40, 9],
    );
    assert.equal(parent.needfill, FILL_NORMAL);
    assert.equal(child.needfill, FILL_NORMAL);
    const doors = [{ x: 38, y: 6 }, { x: 39, y: 10 }];
    assert.deepEqual(
        doors.map(({ x, y }) => game.level.at(x, y).doormask),
        [D_NODOOR, D_NODOOR],
    );
    assert.equal(new Set(game.level.doors.map(({ x, y }) => `${x},${y}`)).size, 2);
    assert.deepEqual([child.doorct, parent.doorct], [2, 2]);
    assert.equal(game.level.doorindex, 4);
});

test('Huge nested room stops after the failed second-door gate', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [10], 0), // outer width 11
        step('rn2', [5], 0), // outer height 8
        step('rn2', [100], 0), // keep the outer ordinary room type
        step('rnd', [2], 2), // depth-one outer lighting bound
        step('rn2', [77], 76), // light the outer room
        step('rnd', [5], 3), // horizontal sector
        step('rnd', [5], 2), // vertical sector
        step('rnd', [3], 3), // center within the horizontal sector
        step('rnd', [3], 1), // top within the vertical sector
        step('rn2', [100], 0), // pass the 90-percent child gate
        step('rn2', [100], 0), // keep the child ordinary room type
        step('rnd', [8], 4), // four-cell child width
        step('rnd', [5], 3), // three-cell child height
        step('rnd', [7], 2), // child x offset
        step('rnd', [5], 2), // child y offset
        step('rnd', [2], 2), // depth-one child lighting bound
        step('rn2', [77], 76), // light the child
        step('rn2', [5], 4), // first discarded random door state
        step('rn2', [3], 1), // first actual state is D_NODOOR
        step('rn2', [4], 0), // first door uses the north wall
        step('rn2', [4], 1), // first door x offset
        step('rn2', [100], 50), // fail percent(50) at its boundary
    ]);

    assert.equal(dispatch_themeroom(
        definitionById('huge-room-with-another-room-inside'),
        random.random.rn2,
        random.random.rnd,
        { difficulty: 1 },
    ), true);
    random.assertExhausted();

    const parent = game.level.rooms[0];
    const child = game.subrooms[0];
    assert.equal(game.level.at(38, 6).doormask, D_NODOOR);
    assert.equal(new Set(
        game.level.doors.map(({ x, y }) => `${x},${y}`),
    ).size, 1);
    assert.deepEqual([child.doorct, parent.doorct], [1, 1]);
    assert.equal(game.level.doorindex, 2);
});

test('Huge nested room stops after the failed child percentage gate', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [10], 0), // outer width 11
        step('rn2', [5], 0), // outer height 8
        step('rn2', [100], 0), // keep the ordinary room type
        step('rnd', [2], 2), // depth-one lighting bound
        step('rn2', [77], 76), // light the room
        step('rnd', [5], 3), // horizontal sector
        step('rnd', [5], 2), // vertical sector
        step('rnd', [3], 3), // centered horizontally
        step('rnd', [3], 1), // aligned to the top vertically
        step('rn2', [100], 90), // fail percent(90) at its boundary
    ]);

    assert.equal(dispatch_themeroom(
        definitionById('huge-room-with-another-room-inside'),
        random.random.rn2,
        random.random.rnd,
        { difficulty: 1 },
    ), true);
    random.assertExhausted();
    assert.equal(game.level.nroom, 1);
    assert.equal(game.nsubroom ?? 0, 0);
    assert.equal(game.level.rooms[0].irregular, false);
    assert.equal(game.level.doors?.length ?? 0, 0);
});

test('Nesting rooms preserves deep room, percentage, and door order', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [4], 0), // outer width 9
        step('rn2', [4], 0), // outer height 9
        step('rn2', [100], 0), // keep the outer ordinary room type
        step('rnd', [2], 2), // depth-one outer lighting bound
        step('rn2', [77], 76), // light the outer room
        step('rnd', [5], 3), // horizontal sector
        step('rnd', [5], 2), // vertical sector
        step('rnd', [3], 3), // center within the horizontal sector
        step('rnd', [3], 1), // top within the vertical sector
        step('rn2', [4], 2), // child width 6 from Lua range 4..7
        step('rn2', [4], 2), // child height 6 from Lua range 4..7
        step('rn2', [100], 0), // keep the child ordinary room type
        step('rnd', [3], 1), // child left edge adjusts to zero
        step('rnd', [3], 1), // child top edge adjusts to zero
        step('rnd', [2], 2), // depth-one child lighting bound
        step('rn2', [77], 76), // light the child
        step('rn2', [100], 0), // pass the 90-percent grandchild gate
        step('rn2', [100], 0), // keep the grandchild ordinary room type
        step('rnd', [3], 2), // two-cell grandchild width
        step('rnd', [3], 2), // two-cell grandchild height
        step('rnd', [4], 2), // grandchild x offset
        step('rnd', [4], 2), // grandchild y offset
        step('rnd', [2], 2), // depth-one grandchild lighting bound
        step('rn2', [77], 76), // light the grandchild
        step('rn2', [5], 4), // first grandchild discarded door state
        step('rn2', [3], 1), // first grandchild door is D_NODOOR
        step('rn2', [4], 0), // grandchild north wall
        step('rn2', [2], 0), // grandchild north x offset
        step('rn2', [100], 0), // pass the grandchild percent(15) gate
        step('rn2', [5], 4), // second grandchild discarded door state
        step('rn2', [3], 1), // second grandchild door is D_NODOOR
        step('rn2', [4], 1), // grandchild south wall
        step('rn2', [2], 1), // grandchild south x offset
        step('rn2', [5], 4), // first child discarded door state
        step('rn2', [3], 1), // first child door is D_NODOOR
        step('rn2', [4], 1), // child south wall
        step('rn2', [6], 3), // child south x offset
        step('rn2', [100], 0), // pass the child percent(15) gate
        step('rn2', [5], 4), // second child discarded door state
        step('rn2', [3], 1), // second child door is D_NODOOR
        step('rn2', [4], 3), // child east wall
        step('rn2', [6], 4), // child east y offset
    ]);

    assert.equal(dispatch_themeroom(
        definitionById('nesting-rooms'),
        random.random.rn2,
        random.random.rnd,
        { difficulty: 1 },
    ), true);
    random.assertExhausted();

    assert.equal(game.level.nroom, 1);
    assert.equal(game.nsubroom, 2);
    const parent = game.level.rooms[0];
    const child = game.subrooms[0];
    const grandchild = game.subrooms[1];
    assert.deepEqual(
        [parent.lx, parent.ly, parent.hx, parent.hy],
        [36, 5, 44, 13],
    );
    assert.deepEqual(
        [child.lx, child.ly, child.hx, child.hy],
        [36, 5, 41, 10],
    );
    assert.deepEqual(
        [grandchild.lx, grandchild.ly, grandchild.hx, grandchild.hy],
        [38, 7, 39, 8],
    );
    assert.deepEqual(
        [parent.needfill, child.needfill, grandchild.needfill],
        [FILL_NORMAL, FILL_NORMAL, FILL_NORMAL],
    );
    assert.deepEqual(
        [parent.irregular, child.irregular, grandchild.irregular],
        [true, true, false],
    );
    const doors = [
        { x: 38, y: 6 },
        { x: 39, y: 9 },
        { x: 39, y: 11 },
        { x: 42, y: 9 },
    ];
    assert.deepEqual(
        doors.map(({ x, y }) => game.level.at(x, y).doormask),
        [D_NODOOR, D_NODOOR, D_NODOOR, D_NODOOR],
    );
    assert.equal(new Set(game.level.doors.map(({ x, y }) => `${x},${y}`)).size, 4);
    assert.deepEqual(
        [parent.doorct, child.doorct, grandchild.doorct],
        [2, 4, 2],
    );
    assert.equal(game.level.doorindex, 8);
});

test('Nesting rooms skips the grandchild and second child door at boundaries', () => {
    resetThemeroomLevel();
    const random = scriptedRandom([
        step('rn2', [4], 0), // outer width 9
        step('rn2', [4], 0), // outer height 9
        step('rn2', [100], 0), // keep the outer ordinary room type
        step('rnd', [2], 2), // depth-one outer lighting bound
        step('rn2', [77], 76), // light the outer room
        step('rnd', [5], 3), // horizontal sector
        step('rnd', [5], 2), // vertical sector
        step('rnd', [3], 3), // centered horizontally
        step('rnd', [3], 1), // aligned to the top vertically
        step('rn2', [4], 2), // child width 6
        step('rn2', [4], 2), // child height 6
        step('rn2', [100], 0), // keep the child ordinary room type
        step('rnd', [3], 1), // child left edge adjusts to zero
        step('rnd', [3], 1), // child top edge adjusts to zero
        step('rnd', [2], 2), // depth-one child lighting bound
        step('rn2', [77], 76), // light the child
        step('rn2', [100], 90), // fail percent(90) at its boundary
        step('rn2', [5], 4), // discarded child random door state
        step('rn2', [3], 1), // actual child state is D_NODOOR
        step('rn2', [4], 1), // child south wall
        step('rn2', [6], 3), // child south x offset
        step('rn2', [100], 15), // fail percent(15) at its boundary
    ]);

    assert.equal(dispatch_themeroom(
        definitionById('nesting-rooms'),
        random.random.rn2,
        random.random.rnd,
        { difficulty: 1 },
    ), true);
    random.assertExhausted();
    assert.equal(game.level.nroom, 1);
    assert.equal(game.nsubroom, 1);
    assert.deepEqual([game.level.rooms[0].doorct, game.subrooms[0].doorct], [1, 1]);
    assert.equal(game.level.doorindex, 2);
});

test('Pillars preserves every distinct shuffled terrain outcome', () => {
    const cases = [
        [HWALL, [6, 5, 4, 3, 2, 1]],
        [LAVAPOOL, [6, 5, 0, 3, 2, 1]],
        [POOL, [6, 0, 4, 3, 2, 1]],
        [TREE, [0, 5, 4, 3, 2, 1]],
    ];
    for (const [expectedTerrain, shuffleResults] of cases) {
        resetThemeroomLevel();
        const random = scriptedRandom([
            step('rn2', [100], 0), // keep the themed room type
            step('rnd', [2], 2), // depth-one lighting bound
            step('rn2', [77], 0), // leave the outer room unlit
            step('rnd', [5], 3), // horizontal sector
            step('rnd', [5], 2), // vertical sector
            step('rnd', [3], 3), // center within the horizontal sector
            step('rnd', [3], 1), // top within the vertical sector
            ...shuffleResults.map((result, index) =>
                step('rn2', [7 - index], result)),
        ]);

        assert.equal(dispatch_themeroom(
            definitionById('pillars'),
            random.random.rn2,
            random.random.rnd,
            { difficulty: 1 },
        ), true);
        random.assertExhausted();

        const room = game.level.rooms[0];
        assert.deepEqual(
            [room.lx, room.ly, room.hx, room.hy],
            [36, 5, 45, 14],
        );
        assert.deepEqual(
            [room.rtype, room.needfill, room.rlit],
            [THEMEROOM, FILL_NONE, 0],
        );
        const pillarCoordinates = [];
        for (const x of [38, 39, 42, 43]) {
            for (const y of [7, 8, 11, 12])
                pillarCoordinates.push([x, y]);
        }
        assert.equal(pillarCoordinates.length, 16);
        for (const [x, y] of pillarCoordinates) {
            const location = game.level.at(x, y);
            assert.equal(
                location.typ,
                expectedTerrain,
                `${expectedTerrain} ${x},${y} type`,
            );
            assert.equal(
                Boolean(location.horizontal),
                expectedTerrain === HWALL,
                `${expectedTerrain} ${x},${y} orientation`,
            );
            assert.equal(location.roomno, ROOMOFFSET, `${x},${y} room`);
            assert.equal(
                location.lit,
                expectedTerrain === LAVAPOOL,
                `${expectedTerrain} ${x},${y} lighting`,
            );
        }
        assert.equal(game.level.at(room.lx + 1, room.ly + 1).typ, ROOM);
    }
});

test('Odd-room feature preserves every distinct shuffled terrain outcome', () => {
    const cases = [
        [CLOUD, 0, 0, [4, 3, 2, 1]],
        [LAVAPOOL, 1, 0, [4, 3, 2, 0]],
        [ICE, 2, 1, [4, 3, 0, 1]],
        [POOL, 0, 2, [4, 0, 2, 1]],
        [TREE, 2, 2, [0, 3, 2, 1]],
    ];
    for (const [
        expectedTerrain,
        widthDraw,
        heightDraw,
        shuffleResults,
    ] of cases) {
        resetThemeroomLevel();
        const expectedCenter = { x: 40, y: 6 + heightDraw };
        make_engr_at(
            expectedCenter.x,
            expectedCenter.y,
            'old',
            null,
            0,
            DUST,
            { state: game },
        );
        const random = scriptedRandom([
            step('rn2', [3], widthDraw),
            step('rn2', [3], heightDraw),
            step('rn2', [100], 0), // keep the ordinary room type
            step('rnd', [2], 2), // depth-one lighting bound
            step('rn2', [77], 0), // leave the room unlit
            step('rnd', [5], 3), // horizontal sector
            step('rnd', [5], 2), // vertical sector
            step('rnd', [3], 3), // center within the horizontal sector
            step('rnd', [3], 1), // top within the vertical sector
            ...shuffleResults.map((result, index) =>
                step('rn2', [5 - index], result)),
        ]);

        assert.equal(dispatch_themeroom(
            definitionById(
                'random-dungeon-feature-in-the-middle-of-an-odd-sized-room',
            ),
            random.random.rn2,
            random.random.rnd,
            { difficulty: 1 },
        ), true);
        random.assertExhausted();

        const room = game.level.rooms[0];
        assert.deepEqual(
            [room.hx - room.lx + 1, room.hy - room.ly + 1],
            [3 + widthDraw * 2, 3 + heightDraw * 2],
        );
        assert.deepEqual(
            [room.rtype, room.needfill, room.rlit],
            [OROOM, FILL_NORMAL, 0],
        );
        const center = {
            x: room.lx + Math.trunc((room.hx - room.lx) / 2),
            y: room.ly + Math.trunc((room.hy - room.ly) / 2),
        };
        assert.deepEqual(center, expectedCenter);
        const location = game.level.at(center.x, center.y);
        assert.deepEqual(
            [location.typ, location.roomno, location.lit],
            [expectedTerrain, ROOMOFFSET, expectedTerrain === LAVAPOOL],
        );
        if (expectedTerrain === CLOUD)
            assert.equal(engr_at(center.x, center.y), null);
        else
            assert.ok(engr_at(center.x, center.y), `${expectedTerrain} engraving`);
        assert.equal(game.level.at(center.x - 1, center.y).typ, ROOM);
    }
});

test('Mausoleum corpse branch centers one human corpse in its inner room', () => {
    initializeDirectThemeroomNewGame(1);

    assert.equal(dispatch_themeroom(definitionById('mausoleum')), true);

    const parent = game.level.rooms[0];
    const child = game.subrooms[0];
    assert.deepEqual(
        [parent.lx, parent.ly, parent.hx, parent.hy],
        [53, 12, 59, 18],
    );
    assert.deepEqual(
        [child.lx, child.ly, child.hx, child.hy],
        [56, 15, 56, 15],
    );
    assert.deepEqual(
        [parent.rtype, parent.needfill, child.rtype, child.needfill],
        [THEMEROOM, FILL_NONE, THEMEROOM, FILL_NONE],
    );
    assert.equal(child.needjoining, false);
    const corpse = game.level.objects[child.lx][child.ly];
    assert.equal(corpse.otyp, CORPSE);
    assert.equal(game.mons[corpse.corpsenm].mlet, S_HUMAN);
    assert.equal(game.level.monsters[child.lx][child.ly], null);
});

test('Mausoleum creates every source monster class and preserves waiting', () => {
    const cases = [
        [2, S_MUMMY],
        [3, S_VAMPIRE],
        [5, S_ZOMBIE],
        [7, S_LICH],
    ];
    for (const [seed, expectedClass] of cases) {
        initializeDirectThemeroomNewGame(seed);
        assert.equal(dispatch_themeroom(definitionById('mausoleum')), true);

        const child = game.subrooms[0];
        const monster = game.level.monsters[child.lx][child.ly];
        assert.ok(monster, `seed ${seed}`);
        assert.equal(monster.data.mlet, expectedClass, `seed ${seed} class`);
        assert.ok(monster.mstrategy & STRAT_WAITFORU, `seed ${seed} waiting`);
        assert.equal(game.level.objects[child.lx][child.ly], null);
        const parent = game.level.rooms[0];
        const secretDoors = [];
        for (let x = child.lx - 1; x <= child.hx + 1; ++x) {
            for (let y = child.ly - 1; y <= child.hy + 1; ++y) {
                if (game.level.at(x, y).typ === SDOOR)
                    secretDoors.push([x, y]);
            }
        }
        if (seed === 5) {
            // This seed also takes Mausoleum's independent 20-percent
            // secret-door branch.
            assert.equal(secretDoors.length, 1);
            assert.deepEqual(
                [child.doorct, parent.doorct, game.level.doorindex],
                [1, 1, 2],
            );
            assert.deepEqual(game.level.doors[0], game.level.doors[1]);
        } else {
            assert.deepEqual(secretDoors, [], `seed ${seed} secret doors`);
            assert.deepEqual(
                [child.doorct, parent.doorct, game.level.doorindex],
                [0, 0, 0],
                `seed ${seed} door ownership`,
            );
        }
        if (expectedClass === S_VAMPIRE) {
            assert.equal(monster.mnum, monster.cham, `seed ${seed} form`);
            assert.equal(monster.data, game.mons[monster.cham], `seed ${seed} data`);
            assert.equal(monster.minvent, null, `seed ${seed} inventory`);
        }
    }
});

test('random room doors preserve source draws, state, and nested registration', () => {
    resetThemeroomLevel();
    const { parent, child } = buildDoorTestRooms();
    const random = scriptedRandom([
        step('rn2', [5], 4), // lspo_door's discarded rnddoor state
        step('rn2', [3], 0), // create an actual door
        step('rn2', [5], 1), // skip open
        step('rn2', [6], 0), // choose locked
        step('rn2', [25], 0), // trap the non-open door
        step('rn2', [4], 0), // north wall
        step('rn2', [3], 1), // center of the three-cell wall
    ]);

    assert.equal(create_room_door(
        { state: 'random', wall: 'all' },
        child,
        random.random.rn2,
    ), true);
    random.assertExhausted();

    const door = { x: child.lx + 1, y: child.ly - 1 };
    const loc = game.level.at(door.x, door.y);
    assert.equal(loc.typ, DOOR);
    assert.equal(loc.horizontal, true);
    assert.equal(loc.flags, D_LOCKED | D_TRAPPED);
    assert.equal(loc.doormask, D_LOCKED | D_TRAPPED);

    // A nested lspo_room() registers its doors when its callback closes. The
    // outer close then registers the shared physical door for the parent too,
    // while recursive child registration recognizes its existing entry.
    add_doors_to_room(child);
    add_doors_to_room(parent);
    assert.deepEqual(game.level.doors, [door, door]);
    assert.deepEqual(
        [child.fdoor, child.doorct, parent.fdoor, parent.doorct],
        [0, 1, 1, 1],
    );
    assert.equal(game.level.doorindex, 2);
});

test('door insertion shifts later top-room and subroom ownership slices', () => {
    resetThemeroomLevel();
    const room = (lx, roomnoidx) => ({
        lx,
        ly: 2,
        hx: lx + 2,
        hy: 4,
        roomnoidx,
        doorct: 0,
        fdoor: 0,
        irregular: false,
        nsubrooms: 0,
        sbrooms: [],
    });
    const early = room(2, 0);
    const later = room(12, 1);
    const nested = room(22, MAXNROFROOMS + 1);
    game.level.rooms = [early, later, { hx: -1 }];
    game.level.nroom = 2;
    game.subrooms = [nested, { hx: -1 }];
    game.nsubroom = 1;

    const earlyOld = { x: 3, y: 1 };
    const earlyNew = { x: 4, y: 1 };
    const laterDoor = { x: 13, y: 1 };
    const nestedDoor = { x: 23, y: 1 };
    for (const door of [earlyOld, laterDoor, nestedDoor])
        game.level.at(door.x, door.y).typ = DOOR;
    add_doors_to_room(early);
    add_doors_to_room(later);
    add_doors_to_room(nested);
    assert.deepEqual(game.level.doors, [earlyOld, laterDoor, nestedDoor]);

    game.level.at(earlyNew.x, earlyNew.y).typ = DOOR;
    add_doors_to_room(early);

    assert.deepEqual(
        game.level.doors,
        [earlyNew, earlyOld, laterDoor, nestedDoor],
    );
    assert.deepEqual(
        [early.fdoor, early.doorct, later.fdoor, later.doorct,
            nested.fdoor, nested.doorct],
        [0, 2, 2, 1, 3, 1],
    );
    assert.deepEqual(
        [early, later, nested].map((entry) =>
            game.level.doors.slice(entry.fdoor, entry.fdoor + entry.doorct)),
        [[earlyNew, earlyOld], [laterDoor], [nestedDoor]],
    );
});

test('south and west doors retry obstructed outward squares', () => {
    for (const scenario of [
        {
            wall: 'south',
            wallDraw: 1,
            rejected(child) {
                return { x: child.lx, y: child.hy + 1 };
            },
            outward(door) { return { x: door.x, y: door.y + 1 }; },
            placed(child) {
                return { x: child.lx + 1, y: child.hy + 1 };
            },
            horizontal: true,
        },
        {
            wall: 'west',
            wallDraw: 2,
            rejected(child) {
                return { x: child.lx - 1, y: child.ly };
            },
            outward(door) { return { x: door.x - 1, y: door.y }; },
            placed(child) {
                return { x: child.lx - 1, y: child.ly + 1 };
            },
            horizontal: false,
        },
    ]) {
        resetThemeroomLevel();
        const { child } = buildDoorTestRooms();
        const rejected = scenario.rejected(child);
        const outward = scenario.outward(rejected);
        const rejectedType = game.level.at(rejected.x, rejected.y).typ;
        game.level.at(outward.x, outward.y).typ = STONE;
        const random = scriptedRandom([
            step('rn2', [4], scenario.wallDraw),
            step('rn2', [3], 0),
            step('rn2', [4], scenario.wallDraw),
            step('rn2', [3], 1),
        ]);

        assert.equal(create_room_door(
            { state: 'open', wall: scenario.wall },
            child,
            random.random.rn2,
        ), true, scenario.wall);
        random.assertExhausted();
        const placed = scenario.placed(child);
        const location = game.level.at(placed.x, placed.y);
        assert.equal(location.typ, DOOR, scenario.wall);
        assert.equal(location.horizontal, scenario.horizontal, scenario.wall);
        assert.equal(location.doormask, D_ISOPEN, scenario.wall);
        assert.equal(
            game.level.at(rejected.x, rejected.y).typ,
            rejectedType,
            scenario.wall,
        );
    }
});

test('explicit secret room doors retry walls and truncate the parser-only bit', () => {
    resetThemeroomLevel();
    const { child } = buildDoorTestRooms();
    const random = scriptedRandom([
        step('rn2', [4], 0), // north is excluded by wall="east"
        step('rn2', [4], 3), // retry on the east wall
    ]);

    assert.equal(create_room_door(
        { state: 'secret', wall: 'east', pos: 1 },
        child,
        random.random.rn2,
    ), true);
    random.assertExhausted();

    const loc = game.level.at(child.hx + 1, child.ly + 1);
    assert.equal(loc.typ, SDOOR);
    assert.equal(loc.horizontal, false);
    // D_SECRET is 0x20, outside struct rm.flags' five bits. A room-wall secret
    // door therefore stores zero and becomes closed when eventually revealed.
    assert.equal(loc.flags, 0);
    assert.equal(loc.doormask, 0);
});

test('create_door resolves random secret descriptors in place', () => {
    resetThemeroomLevel();
    const { child } = buildDoorTestRooms();
    const descriptor = {
        secret: -1,
        mask: -1,
        pos: 1,
        wall: W_RANDOM,
    };
    const random = scriptedRandom([
        step('rn2', [2], 1), // secret door
        step('rn2', [5], 0), // locked secret door
        step('rn2', [20], 1), // not trapped
        step('rn2', [4], 3), // east wall
    ]);

    assert.equal(create_door(descriptor, child, random.random.rn2), true);
    random.assertExhausted();
    assert.deepEqual(descriptor, {
        secret: 1,
        mask: D_LOCKED,
        pos: 1,
        wall: W_ANY,
    });
    const loc = game.level.at(child.hx + 1, child.ly + 1);
    assert.equal(loc.typ, SDOOR);
    assert.equal(loc.flags, D_LOCKED);
    assert.equal(loc.doormask, D_LOCKED);
});

test('create_room_door stops after one hundred rejected wall attempts', () => {
    resetThemeroomLevel();
    const { child } = buildDoorTestRooms();
    let calls = 0;
    const target = game.level.at(child.lx, child.ly - 1);
    const originalType = target.typ;

    assert.equal(create_room_door(
        { state: 'open', wall: 'north', pos: 0 },
        child,
        (bound) => {
            assert.equal(bound, 4);
            ++calls;
            return 1; // repeatedly choose the excluded south wall
        },
    ), false);
    assert.equal(calls, 100);
    assert.equal(target.typ, originalType);
    assert.equal(game.level.doorindex, 0);
});

test('strict dispatch rejects alternate state before draws or mutation', () => {
    resetThemeroomLevel();
    const alternate = { level: new GameMap() };
    let randomCalls = 0;

    assert.throws(
        () => dispatch_themeroom(
            definitionById('default'),
            () => { ++randomCalls; return 0; },
            (bound) => bound,
            { difficulty: 1, state: alternate },
        ),
        /only supports the global game state/,
    );
    assert.equal(randomCalls, 0);
    assert.equal(game.level.nroom, 0);
    assert.equal(game.level.at(10, 10).typ, STONE);
    assert.equal(alternate.level.nroom, 0);
    assert.equal(alternate.level.at(10, 10).typ, STONE);
});

test('strict map dispatch preflights its fill callback before loading terrain', () => {
    resetThemeroomLevel();
    let randomCalls = 0;
    // Without the preflight, these values place Cross at (31,4) and select its
    // themed branch, reproducing the former partially mutated failure.
    const wouldMutate = [[68, 30], [10, 4], [100, 0]];

    assert.throws(
        () => dispatch_themeroom(
            definitionById('cross'),
            (bound) => {
                ++randomCalls;
                const next = wouldMutate.shift();
                assert.ok(next, `unexpected rn2(${bound})`);
                assert.equal(bound, next[0]);
                return next[1];
            },
            (bound) => bound,
            { difficulty: 1 },
        ),
        UnsupportedThemeroomActionError,
    );
    assert.equal(randomCalls, 0);
    assert.equal(game.level.nroom, 0);
    assert.equal(game.level.at(31, 4).typ, STONE);
});

test('strict map dispatch preflights its fill callback RNG contract', () => {
    const cases = [
        {
            name: 'integer difficulty',
            expected: /integer difficulty/,
            configure(random, randomOneBased) {
                return {
                    difficulty: '1',
                    randomFacade: completeRandomFacade(random, randomOneBased),
                    themeroomFill() {},
                };
            },
        },
        {
            name: 'complete facade',
            expected: /randomFacade\.rnz/,
            configure(random, randomOneBased) {
                const randomFacade = completeRandomFacade(random, randomOneBased);
                delete randomFacade.rnz;
                return { difficulty: 1, randomFacade, themeroomFill() {} };
            },
        },
        {
            name: 'shared scalar streams',
            expected: /randomFacade\.rn2\/rnd to match/,
            configure(random, randomOneBased) {
                const randomFacade = completeRandomFacade(random, randomOneBased);
                randomFacade.rn2 = () => 0;
                return { difficulty: 1, randomFacade, themeroomFill() {} };
            },
        },
    ];

    for (const contractCase of cases) {
        resetThemeroomLevel();
        let randomCalls = 0;
        const random = () => { ++randomCalls; return 0; };
        const randomOneBased = (bound) => bound;

        assert.throws(
            () => dispatch_themeroom(
                definitionById('cross'),
                random,
                randomOneBased,
                contractCase.configure(random, randomOneBased),
            ),
            contractCase.expected,
            contractCase.name,
        );
        assert.equal(randomCalls, 0, contractCase.name);
        assert.equal(game.level.nroom, 0, contractCase.name);
        // Cross would write its top wall here if contract validation happened
        // after lspo_map's terrain mutation.
        assert.equal(game.level.at(34, 4).typ, STONE, contractCase.name);
    }
});

test('all static filler-map descriptors dispatch through filler_region', () => {
    const fillerMaps = THEMEROOM_DEFINITIONS.filter(
        (definition) => definition.action.kind === 'map'
            && definition.action.contents.kind === 'filler-region',
    );
    // The source table has exactly 17 static maps whose callbacks only call
    // filler_region; Blocked center and Water-surrounded vault are separate.
    assert.equal(fillerMaps.length, 17);

    for (const definition of fillerMaps) {
        resetThemeroomLevel();
        const random = (bound) => Math.floor(bound / 2);
        const randomOneBased = (bound) => bound;
        const result = dispatch_themeroom(
            definition,
            // Midpoint origins keep every map and its one-cell halo in bounds;
            // rn2(100)=50 selects filler_region's ordinary 70% branch.
            random,
            randomOneBased,
            {
                difficulty: 1,
                randomFacade: completeRandomFacade(random, randomOneBased),
                themeroomFill() {},
            },
        );
        assert.equal(result, true, definition.id);
        assert.equal(game.level.nroom, 1, definition.id);
        assert.equal(game.level.rooms[0].irregular, true, definition.id);
        assert.equal(game.level.rooms[0].needfill, FILL_NORMAL, definition.id);
    }
});

test('map loading preserves sel_set_ter lighting and door orientation', () => {
    const state = { level: new GameMap() };
    const definition = {
        // The left wall precedes '+' in source iteration order, while 'L' is
        // a lava pool whose light overrides the map's default lit=false.
        map: ['-----', '|+L.|', '-----'],
        width: 5,
        height: 3,
    };
    const results = [9, 4];
    const origin = lspo_map(definition, (bound) => {
        assert.ok(results.length, `unexpected rn2(${bound})`);
        return results.shift();
    }, state);

    assert.deepEqual(origin, { x: 10, y: 4, width: 5, height: 3 });
    assert.equal(state.level.at(11, 5).typ, DOOR);
    assert.equal(state.level.at(11, 5).horizontal, true);
    assert.equal(state.level.at(12, 5).typ, LAVAPOOL);
    assert.equal(state.level.at(12, 5).lit, true);
    assert.equal(state.level.at(13, 5).typ, ROOM);
    assert.equal(state.level.at(13, 5).lit, false);
});

test('Blocked center uses core shuffle and matching-cell chance draws in order', () => {
    resetThemeroomLevel();
    const scripted = [
        [68, 30], // map x origin: 1 + 30 = 31
        [10, 4], // map y origin: 4
        [100, 0], // enter Blocked center's 30% replacement branch
        [2, 0], // nhlib math.random(2): swap pool into the first slot
        // replace_terrain's default 100% chance still draws once for each of
        // the nine matching lava cells, in x-major then y-major order.
        ...Array.from({ length: 9 }, () => [100, 0]),
        [100, 99], // filler_region takes its ordinary 70% branch
        [77, 76], // the depth-one irregular room is lit
    ];
    const events = [];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        const next = scripted.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        assert.equal(bound, 2); // rnd(1 + abs(depth)) at depth one
        return 2;
    };
    const randomFacade = completeRandomFacade(random, randomOneBased);

    assert.equal(
        dispatch_themeroom(
            definitionById('blocked-center'),
            random,
            randomOneBased,
            { difficulty: 1, randomFacade, themeroomFill() {} },
        ),
        true,
    );
    assert.equal(scripted.length, 0);
    assert.deepEqual(events, [
        'rn2(68)', 'rn2(10)', 'rn2(100)', 'rn2(2)',
        ...Array.from({ length: 9 }, () => 'rn2(100)'),
        'rn2(100)', 'rnd(2)', 'rn2(77)',
    ]);
    for (let x = 35; x <= 37; ++x) {
        for (let y = 8; y <= 10; ++y) {
            assert.equal(game.level.at(x, y).typ, POOL);
            // replace_terrain defaults to lit=-2, so converted lava retains
            // the light established while loading the map.
            assert.equal(game.level.at(x, y).lit, true);
        }
    }
});

test('Blocked center replace_terrain scans matching cells x-major', () => {
    resetThemeroomLevel();
    const stop = new Error('stop on third matching-cell chance draw');
    let call = 0;
    const random = (bound) => {
        ++call;
        if (call === 1) return 30; // x origin 31
        if (call === 2) return 4; // y origin 4
        if (call === 3) return 0; // enter the replacement branch
        if (call === 4) return 0; // shuffle pool into terrain[0]
        if (call === 7) throw stop;
        assert.equal(bound, 100);
        return 0;
    };
    const randomOneBased = (bound) => bound;

    assert.throws(
        () => dispatch_themeroom(
            definitionById('blocked-center'),
            random,
            randomOneBased,
            {
                difficulty: 1,
                randomFacade: completeRandomFacade(random, randomOneBased),
                themeroomFill() {},
            },
        ),
        (error) => error === stop,
    );
    // The first two x-major cells changed before the third draw threw. A
    // y-major traversal would have changed (36,8) instead of (35,9).
    assert.equal(game.level.at(35, 8).typ, POOL);
    assert.equal(game.level.at(35, 9).typ, POOL);
    assert.equal(game.level.at(36, 8).typ, LAVAPOOL);
});

test('filler_region invokes an injected fill after registering room flags', () => {
    resetThemeroomLevel();
    const scripted = [
        [68, 30], [10, 4], // place Cross at (31,4)
        [100, 0], // take filler_region's 30% themed branch
        [77, 76], // light the region at depth one
    ];
    let callbackCount = 0;
    const random = (bound) => {
        const next = scripted.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => bound;
    const methods = Object.fromEntries(
        ['d', 'rn1', 'rne', 'rnz'].map((name) => [name, () => {
            assert.fail(`callback must not call random.${name}`);
        }]),
    );
    const randomFacade = completeRandomFacade(
        random,
        randomOneBased,
        methods,
    );
    const expectedMethods = {
        ...methods,
        rn2: random,
        rnd: randomOneBased,
    };

    assert.equal(dispatch_themeroom(
        definitionById('cross'),
        random,
        randomOneBased,
        {
            difficulty: 1,
            randomFacade,
            themeroomFill(room, difficulty, callbackEnv) {
                ++callbackCount;
                assert.equal(difficulty, 1);
                assert.equal(callbackEnv.state, game);
                assert.equal(callbackEnv.random, randomFacade);
                assert.deepEqual(Object.keys(callbackEnv).sort(), ['random', 'state']);
                for (const name of ['d', 'rn1', 'rn2', 'rnd', 'rne', 'rnz']) {
                    assert.equal(callbackEnv.random[name], expectedMethods[name], name);
                }
                assert.equal(room.rtype, THEMEROOM);
                assert.equal(room.irregular, true);
                assert.equal(room.needjoining, true);
                assert.equal(room.needfill, FILL_NORMAL);
                assert.equal(game.level.at(37, 10).roomno, ROOMOFFSET);
            },
        },
    ), true);
    assert.equal(callbackCount, 1);
    assert.equal(scripted.length, 0);
});

test('Water vault requires its complete creation facade before map mutation', () => {
    resetThemeroomLevel();
    let randomCalls = 0;
    assert.throws(
        () => dispatch_themeroom(
            definitionById('water-surrounded-vault'),
            () => { ++randomCalls; return 0; },
            (bound) => bound,
            { difficulty: 1 },
        ),
        UnsupportedThemeroomActionError,
    );
    assert.equal(randomCalls, 0);
    assert.equal(game.level.nroom, 0);
    assert.equal(game.level.at(10, 10).typ, STONE);
});

test('Water vault registers its chamber, chests, undead, and exclusion', () => {
    initializeDirectThemeroomNewGame(1);

    assert.equal(dispatch_themeroom(
        definitionById('water-surrounded-vault'),
    ), true);

    const room = game.level.rooms[0];
    assert.deepEqual(
        [room.lx, room.ly, room.hx, room.hy],
        [32, 9, 33, 10],
    );
    assert.deepEqual(
        [room.rtype, room.irregular, room.needfill, room.needjoining],
        [THEMEROOM, true, FILL_NONE, false],
    );
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            const chest = game.level.objects[x][y];
            assert.equal(chest.otyp, CHEST, `${x},${y}`);
        }
    }
    assert.equal(
        game.level.objects[room.hx][room.hy].cobj.otyp,
        WAN_TELEPORTATION,
    );
    assert.equal(
        game.level.monsters[room.lx][room.ly].mnum,
        PM_GIANT_ZOMBIE,
    );
    assert.deepEqual(game.exclusion_zones, {
        zonetype: LR_TELE,
        lx: room.lx,
        ly: room.ly,
        hx: room.hx,
        hy: room.hy,
        next: null,
    });
});

test('Water vault retains the random chest lock despite source olocked typo', () => {
    initializeDirectThemeroomNewGame(14);
    assert.equal(dispatch_themeroom(
        definitionById('water-surrounded-vault'),
    ), true);

    const chest = game.level.objects[72][12];
    const escapeItem = chest.cobj;
    assert.equal(escapeItem.otyp, WAN_DIGGING);
    assert.equal(objectType(escapeItem, game).oc_material, GLASS);
    // themerms.lua supplies `olocked`, while lspo_object() reads `locked`.
    assert.equal(chest.olocked, true);
});

test('Water vault reaches every escape item and nasty-undead variant', () => {
    const cases = [
        [1, WAN_TELEPORTATION, PM_GIANT_ZOMBIE, false],
        [2, WAN_DIGGING, PM_ETTIN_ZOMBIE, true],
        [3, SCR_TELEPORTATION, PM_VAMPIRE_LEADER, true],
        [7, RIN_TELEPORTATION, PM_VAMPIRE_LEADER, true],
    ];
    const escapeTypes = new Set([
        SCR_TELEPORTATION,
        RIN_TELEPORTATION,
        WAN_TELEPORTATION,
        WAN_DIGGING,
    ]);

    for (const [seed, escapeType, undeadType, locked] of cases) {
        initializeDirectThemeroomNewGame(seed);
        assert.equal(dispatch_themeroom(
            definitionById('water-surrounded-vault'),
        ), true, `seed ${seed}`);

        const room = game.level.rooms[0];
        const escapeChests = [];
        for (let x = room.lx; x <= room.hx; ++x) {
            for (let y = room.ly; y <= room.hy; ++y) {
                const chest = game.level.objects[x][y];
                if (escapeTypes.has(chest.cobj?.otyp)) escapeChests.push(chest);
            }
        }
        assert.equal(escapeChests.length, 1, `seed ${seed}`);
        assert.equal(escapeChests[0].cobj.otyp, escapeType, `seed ${seed}`);
        assert.equal(escapeChests[0].olocked, locked, `seed ${seed}`);

        const monster = game.level.monsters[room.lx][room.ly];
        const naturalType = monster.cham === PM_VAMPIRE_LEADER
            ? monster.cham
            : monster.mnum;
        assert.equal(naturalType, undeadType, `seed ${seed}`);
    }
});

test('Water vault preserves the male parse of its vampire-lord name', () => {
    initializeDirectThemeroomNewGame(3);
    assert.equal(dispatch_themeroom(
        definitionById('water-surrounded-vault'),
    ), true);

    const room = game.level.rooms[0];
    const monster = game.level.monsters[room.lx][room.ly];
    assert.equal(monster.cham, PM_VAMPIRE_LEADER);
    assert.equal(monster.mnum, PM_FOG_CLOUD);
    assert.equal(monster.female, false);
});

test('Twin businesses builds both source shop subrooms', () => {
    initializeDirectThemeroomNewGame(1);
    enableRngLog();
    assert.equal(dispatch_themeroom(
        definitionById('twin-businesses'),
    ), true);
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/, '')),
        [
            'rn2(100)', 'rnd(2)', 'rn2(77)',
            'rnd(5)', 'rnd(5)', 'rnd(3)', 'rnd(3)',
            ...Array(13).fill('rn2(100)'),
            'rnd(8)',
            'rn2(100)', 'rnd(2)', 'rn2(77)',
            'rn2(100)', 'rn2(100)', 'rn2(4)', 'rn2(3)',
            'rn2(100)', 'rnd(2)', 'rn2(77)',
            'rn2(100)', 'rn2(100)', 'rn2(4)', 'rn2(4)', 'rn2(3)',
        ],
    );

    const parent = game.level.rooms[0];
    const shops = game.subrooms.slice(0, game.nsubroom);
    assert.deepEqual(
        [parent.lx, parent.ly, parent.hx, parent.hy, parent.rtype],
        [68, 2, 76, 6, THEMEROOM],
    );
    assert.equal(parent.nsubrooms, 2);
    assert.deepEqual(
        shops.map((room) => [
            room.lx, room.ly, room.hx, room.hy,
            room.rtype, room.needfill, room.needjoining,
        ]),
        [
            [70, 4, 72, 6, ARMORSHOP, FILL_NORMAL, false],
            [74, 4, 76, 6, WEAPONSHOP, FILL_NORMAL, false],
        ],
    );
    assert.deepEqual(
        shops.map((room) => game.level.doors[room.fdoor]),
        [{ x: 70, y: 3 }, { x: 75, y: 3 }],
    );
    assert.deepEqual(
        shops.map((room) => {
            const door = game.level.doors[room.fdoor];
            return game.level.at(door.x, door.y).doormask;
        }),
        [D_CLOSED, D_CLOSED],
    );
});

test('Twin businesses stocks both shops and initializes their keepers', () => {
    initializeDirectThemeroomNewGame(1);
    assert.equal(dispatch_themeroom(
        definitionById('twin-businesses'),
    ), true);
    const parent = game.level.rooms[0];
    fill_special_room(parent);

    assert.equal(game.level.flags.has_shop, true);
    const shops = game.subrooms.slice(0, game.nsubroom);
    assert.deepEqual(
        shops.map((room) => room.resident?.mnum),
        [PM_SHOPKEEPER, PM_SHOPKEEPER],
    );
    assert.deepEqual(
        shops.map((room) => room.resident.mextra.eshk.shknam),
        ['Siirt', 'Laguiolet'],
    );

    const expectedStock = [
        {
            oclass: ARMOR_CLASS,
            squares: ['70,5', '70,6', '71,5', '71,6', '72,5', '72,6'],
        },
        {
            oclass: WEAPON_CLASS,
            squares: ['74,5', '74,6', '75,5', '75,6', '76,5', '76,6'],
        },
    ];

    for (const [index, room] of shops.entries()) {
        const keeper = room.resident;
        const eshk = keeper.mextra.eshk;
        assert.equal(keeper.isshk, true);
        assert.equal(keeper.mpeaceful, true);
        assert.equal(keeper.mtrapseen, -1);
        assert.equal(eshk.parentmid, 0);
        assert.equal(eshk.shoptype, room.rtype);
        assert.equal(eshk.shoproom, room.roomnoidx + ROOMOFFSET);
        assert.deepEqual(eshk.shoplevel, game.u.uz);

        const inventory = [];
        for (let obj = keeper.minvent; obj; obj = obj.nobj)
            inventory.push(obj.otyp);
        assert.ok(inventory.includes(GOLD_PIECE));
        assert.ok(inventory.includes(SKELETON_KEY));

        const stockedSquares = [];
        for (let x = room.lx; x <= room.hx; ++x) {
            for (let y = room.ly; y <= room.hy; ++y) {
                const object = game.level.objects[x][y];
                if (!object) continue;
                stockedSquares.push(`${x},${y}`);
                assert.equal(object.oclass, expectedStock[index].oclass);
            }
        }
        assert.deepEqual(stockedSquares, expectedStock[index].squares);
        assert.equal(game.level.objects[keeper.mx][keeper.my], null);
    }
});

test('shopkeeper startup reaches every source inventory fallthrough', () => {
    const cases = [
        [1, 0, [POT_HEALING, POT_EXTRA_HEALING, WAN_STRIKING, WAN_MAGIC_MISSILE]],
        [6, 1, [POT_HEALING, POT_EXTRA_HEALING, WAN_STRIKING]],
        [1, 1, [POT_HEALING, WAN_STRIKING]],
        [3, 0, [WAN_STRIKING]],
    ];
    const fallthroughTypes = new Set([
        POT_HEALING,
        POT_EXTRA_HEALING,
        WAN_STRIKING,
        WAN_MAGIC_MISSILE,
    ]);

    for (const [seed, shopIndex, expectedTypes] of cases) {
        initializeDirectThemeroomNewGame(seed);
        assert.equal(dispatch_themeroom(
            definitionById('twin-businesses'),
        ), true, `seed ${seed}`);
        fill_special_room(game.level.rooms[0]);

        const actualTypes = [];
        for (let obj = game.subrooms[shopIndex].resident.minvent;
            obj;
            obj = obj.nobj) {
            if (fallthroughTypes.has(obj.otyp)) actualTypes.push(obj.otyp);
        }
        assert.deepEqual(
            actualTypes.sort((left, right) => left - right),
            [...expectedTypes].sort((left, right) => left - right),
            `seed ${seed}, shop ${shopIndex}`,
        );
    }
});

test('Twin shop stocking reaches both 90/10 secondary object classes', () => {
    initializeDirectThemeroomNewGame(11);
    assert.equal(dispatch_themeroom(
        definitionById('twin-businesses'),
    ), true);
    fill_special_room(game.level.rooms[0]);

    const shops = game.subrooms.slice(0, game.nsubroom);
    assert.deepEqual(shops.map((room) => room.rtype), [ARMORSHOP, WEAPONSHOP]);
    const stock = shops.map((room) => {
        const entries = [];
        for (let x = room.lx; x <= room.hx; ++x) {
            for (let y = room.ly; y <= room.hy; ++y) {
                const object = game.level.objects[x][y];
                if (object) entries.push([x, y, object.oclass]);
            }
        }
        return entries;
    });
    assert.deepEqual(stock, [
        [
            [20, 2, ARMOR_CLASS], [20, 3, ARMOR_CLASS],
            [20, 4, ARMOR_CLASS], [21, 2, ARMOR_CLASS],
            [21, 3, ARMOR_CLASS], [21, 4, WEAPON_CLASS],
        ],
        [
            [26, 5, WEAPON_CLASS], [26, 6, WEAPON_CLASS],
            [27, 5, WEAPON_CLASS], [27, 6, ARMOR_CLASS],
            [28, 5, WEAPON_CLASS], [28, 6, ARMOR_CLASS],
        ],
    ]);
});

test('shopkeeper inventory accepts a generated duplicate potion merge', () => {
    initializeDirectThemeroomNewGame(5);
    assert.equal(dispatch_themeroom(
        definitionById('twin-businesses'),
    ), true);
    fill_special_room(game.level.rooms[0]);

    const extraHealingStacks = [];
    for (let obj = game.subrooms[0].resident.minvent; obj; obj = obj.nobj) {
        if (obj.otyp === POT_EXTRA_HEALING) extraHealingStacks.push(obj.quan);
    }
    // C mongets() returns null when mpickobj() merges the new object.
    assert.deepEqual(extraHealingStacks, [2]);
});

test('Twin businesses marks the exterior of a locked shop', () => {
    initializeDirectThemeroomNewGame(2);
    assert.equal(dispatch_themeroom(
        definitionById('twin-businesses'),
    ), true);
    fill_special_room(game.level.rooms[0]);

    const lockedShop = game.subrooms[0];
    const door = game.level.doors[lockedShop.fdoor];
    assert.deepEqual(door, { x: 33, y: 5 });
    assert.equal(game.level.at(door.x, door.y).typ, DOOR);
    assert.equal(game.level.at(door.x, door.y).doormask, D_LOCKED);
    const notice = engr_at(33, 6, game);
    assert.equal(notice.engr_type, DUST);
    assert.equal(notice.engr_txt[0], 'Closed for inventory');

    const openShop = game.subrooms[1];
    const openDoor = game.level.doors[openShop.fdoor];
    assert.deepEqual(openDoor, { x: 39, y: 3 });
    assert.equal(game.level.at(openDoor.x, openDoor.y).typ, DOOR);
    assert.equal(game.level.at(openDoor.x, openDoor.y).doormask, D_ISOPEN);
});

test('themed alignment shuffle is retained independently per branch', () => {
    const state = { u: { uz: { dnum: 2 } } };
    const calls = [];
    const first = initialize_themeroom_branch(state, (bound) => {
        calls.push(bound);
        return 0;
    });
    // Choosing index zero for the length-three and length-two Fisher-Yates
    // steps transforms [law, neutral, chaos] into [neutral, chaos, law].
    assert.deepEqual(calls, [3, 2]);
    assert.deepEqual(first, ['neutral', 'chaos', 'law']);
    assert.equal(state.themeroom_align[2], first);

    const again = initialize_themeroom_branch(state, () => {
        throw new Error('an initialized branch must not reshuffle');
    });
    assert.equal(again, first);

    state.u.uz.dnum = 3;
    const second = initialize_themeroom_branch(state, (bound) => bound - 1);
    assert.deepEqual(second, ['law', 'neutral', 'chaos']);
    assert.notEqual(second, first);
    assert.equal(state.themeroom_align[2], first);
    assert.equal(state.themeroom_align[3], second);
});
