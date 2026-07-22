import assert from 'node:assert/strict';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import {
    AGGRAVATE_MONSTER, COLNO, CROSSWALL, DOOR, D_LOCKED, D_TRAPPED,
    FILL_NONE, FILL_NORMAL, HWALL, ICE, LAVAPOOL, MKTRAP_MAZEFLAG,
    MAXNROFROOMS, OROOM, POOL, ROOM, ROOMOFFSET, ROWNO, STATUE_TRAP, STONE,
    SDOOR, THEMEROOM, TLCORNER, VWALL, W_ANY, W_RANDOM,
} from '../js/const.js';
import { depth, level_difficulty } from '../js/dungeon.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import {
    add_doors_to_room,
    build_room,
    create_door,
    create_room_door,
    dispatch_themeroom,
    initialize_themeroom_branch,
    lspo_map,
    mklev,
    select_themeroom,
    themerooms_generate,
    UnsupportedThemeroomActionError,
} from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init, STATUE } from '../js/objects.js';
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

function buildDoorTestRooms() {
    const parentPlacement = [3, 2, 3, 1];
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
    }, null, (bound) => {
        assert.equal(bound, 100); // the room descriptor's chance check
        return 0;
    }, (bound) => {
        // Sector (3,2), then center/top alignment, places an 11x9 parent at
        // (35,5)..(45,13) with ample stone outside its four walls.
        const value = parentPlacement.shift();
        assert.ok(value != null, `unexpected parent rnd(${bound})`);
        return value;
    });
    assert.equal(parentPlacement.length, 0);

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
    }, parent, (bound) => {
        assert.equal(bound, 100); // the nested descriptor's chance check
        return 0;
    }, (bound) => assert.fail(`unexpected child rnd(${bound})`));
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
    newgame_pre_mklev(game);
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
    const reservoirDrawCount = 30;
    let reservoirCalls = 0;
    const random = (bound) => {
        calls.push(bound);
        if (reservoirCalls++ < reservoirDrawCount) return bound === 1034 ? 0 : bound - 1;
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

    assert.equal(await themerooms_generate(1, random, randomOneBased), true);
    assert.deepEqual(calls.slice(reservoirDrawCount), [68, 10, 100, 77]);
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

test('live generic room generation keeps the injected RNG streams', async () => {
    resetThemeroomLevel();
    const reservoirDrawCount = 30;
    let reservoirCalls = 0;
    const events = [];
    const scripted = [
        [100, 0], // build_room's default 100% chance
        [77, 1], // litstate_rnd keeps the room lit
        [1, 0], // select the sole initial free rectangle
        [12, 0], // width two
        [4, 0], // height two
        [70, 0], // leftmost valid x coordinate
        [13, 0], // upper-half y avoids the relocation-only rn1 branch
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < reservoirDrawCount) return bound - 1;
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
    assert.deepEqual(events.slice(reservoirDrawCount), [
        'rn2(100)', 'rnd(2)', 'rn2(77)', 'rn2(1)',
        'rn2(12)', 'rn2(4)', 'rn2(70)', 'rn2(13)',
    ]);
    assert.equal(game.level.nroom, 1);
});

test('live generic themed rooms invoke their synchronous fill callback', async () => {
    resetThemeroomLevel();
    const reservoirDrawCount = 30;
    let reservoirCalls = 0;
    const events = [];
    const scripted = [
        [100, 0], // build_room's default 100% chance
        [77, 1], // litstate_rnd keeps the room lit
        [1, 0], // select the sole initial free rectangle
        [12, 0], // width two
        [4, 0], // height two
        [70, 0], // leftmost valid x coordinate
        [13, 0], // upper-half y avoids the relocation-only rn1 branch
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < reservoirDrawCount) {
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
    assert.deepEqual(events.slice(reservoirDrawCount), [
        'rn2(100)', 'rnd(2)', 'rn2(77)', 'rn2(1)',
        'rn2(12)', 'rn2(4)', 'rn2(70)', 'rn2(13)',
    ]);
    assert.equal(game.level.nroom, 1);
});

test('live generic fill dispatch executes selected Statuary', async () => {
    resetThemeroomLevel();
    const reservoirDrawCount = 30;
    let reservoirCalls = 0;
    const events = [];
    let fillBound = 0;
    const scripted = [
        [100, 0], // ordinary fallback build_room chance
        [77, 1], // litstate_rnd keeps the room lit
        [1, 0], // select the sole initial free rectangle
        [12, 0], // width two
        [4, 0], // height two
        [70, 0], // leftmost valid x coordinate
        [13, 0], // upper-half y
    ];
    const bodyDraws = [
        [5, 0], [5, 0], [5, 0], [5, 0], [5, 0],
        [3, 0],
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        if (reservoirCalls++ < reservoirDrawCount) {
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
    assert.deepEqual(events.slice(reservoirDrawCount), [
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
    const reservoirDrawCount = 30;
    let reservoirCalls = 0;
    let fillBound = 0;
    const marker = new Error('supported fill marker');
    const scripted = [
        [100, 0], // build_room's default 100% chance
        [77, 1], // litstate_rnd keeps the room lit
        [1, 0], // select the sole initial free rectangle
        [12, 0], // width two
        [4, 0], // height two
        [70, 0], // leftmost valid x coordinate
        [13, 0], // upper-half y
    ];
    const random = (bound) => {
        if (reservoirCalls++ < reservoirDrawCount) {
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
    const scriptedRn2 = [
        [100, 0], // build_room's default 100% chance
        [77, 1], // litstate_rnd keeps the room lit
        [1, 0], // select the sole initial free rectangle
        [12, 0], // width two
        [4, 3], // height five, forcing the lower-half relocation predicate
        [70, 0], // leftmost valid x coordinate
        [10, 9], // initial y coordinate lies below the map midpoint
        [3, 0], // rn1(3, 2) expands to rn2(3) + 2
    ];
    const events = [];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        const next = scriptedRn2.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };
    const randomOneBased = (bound) => {
        events.push(`rnd(${bound})`);
        assert.equal(bound, 2); // rnd(1 + abs(depth)) at depth one
        return 2;
    };
    assert.equal(dispatch_themeroom(
        definitionById('default'),
        random,
        randomOneBased,
        { difficulty: 1 },
    ), true);
    assert.equal(scriptedRn2.length, 0);
    assert.deepEqual(events, [
        'rn2(100)', 'rnd(2)', 'rn2(77)', 'rn2(1)',
        'rn2(12)', 'rn2(4)', 'rn2(70)', 'rn2(10)', 'rn2(3)',
    ]);
    assert.equal(game.level.rooms[0].ly, 2);
});

test('build_room places a partially specified top-level room in source order', () => {
    resetThemeroomLevel();
    const events = [];
    const coreDraws = [[100, 0], [77, 76]];
    const oneBasedDraws = [
        [2, 2], // litstate_rnd
        [5, 3], [5, 2], // random position sectors
        [3, 3], [3, 1], // centered horizontally, top-aligned vertically
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
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
    }, null, random, randomOneBased);

    assert.equal(coreDraws.length, 0);
    assert.equal(oneBasedDraws.length, 0);
    assert.deepEqual(events, [
        'rn2(100)', 'rnd(2)', 'rn2(77)',
        'rnd(5)', 'rnd(5)', 'rnd(3)', 'rnd(3)',
    ]);
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
    const parentOneBased = [3, 2, 3, 1];
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
    }, null, (bound) => {
        assert.equal(bound, 100);
        return 0;
    }, (bound) => {
        const value = parentOneBased.shift();
        assert.ok(value != null, `unexpected parent rnd(${bound})`);
        return value;
    });
    assert.equal(parentOneBased.length, 0);

    const events = [];
    const coreDraws = [[100, 0], [77, 76]];
    const oneBasedDraws = [
        [8, 4], [6, 3], // width and height
        [7, 1], [6, 5], // left and bottom-edge-adjusted positions
        [2, 2], // litstate_rnd
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
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
    }, parent, random, randomOneBased);

    assert.equal(coreDraws.length, 0);
    assert.equal(oneBasedDraws.length, 0);
    assert.deepEqual(events, [
        'rn2(100)',
        'rnd(8)', 'rnd(6)', 'rnd(7)', 'rnd(6)',
        'rnd(2)', 'rn2(77)',
    ]);
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

test('random room doors preserve source draws, state, and nested registration', () => {
    resetThemeroomLevel();
    const { parent, child } = buildDoorTestRooms();
    const events = [];
    const draws = [
        [5, 4], // lspo_door's discarded rnddoor state
        [3, 0], // create an actual door instead of an empty doorway
        [5, 1], // skip open
        [6, 0], // choose locked
        [25, 0], // trap the non-open door
        [4, 0], // north wall
        [3, 1], // center of the three-cell wall
    ];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        const next = draws.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };

    assert.equal(create_room_door(
        { state: 'random', wall: 'all' },
        child,
        random,
    ), true);
    assert.equal(draws.length, 0);
    assert.deepEqual(events, [
        'rn2(5)', 'rn2(3)', 'rn2(5)', 'rn2(6)', 'rn2(25)',
        'rn2(4)', 'rn2(3)',
    ]);

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

test('explicit secret room doors retry walls and truncate the parser-only bit', () => {
    resetThemeroomLevel();
    const { child } = buildDoorTestRooms();
    const draws = [
        [4, 0], // north is excluded by wall="east"
        [4, 3], // retry on the east wall
    ];
    const events = [];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        const next = draws.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };

    assert.equal(create_room_door(
        { state: 'secret', wall: 'east', pos: 1 },
        child,
        random,
    ), true);
    assert.equal(draws.length, 0);
    assert.deepEqual(events, ['rn2(4)', 'rn2(4)']);

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
    const draws = [
        [2, 1], // secret door
        [5, 0], // locked secret door
        [20, 1], // not trapped
        [4, 3], // east wall
    ];
    const events = [];
    const random = (bound) => {
        events.push(`rn2(${bound})`);
        const next = draws.shift();
        assert.ok(next, `unexpected rn2(${bound})`);
        assert.equal(bound, next[0]);
        return next[1];
    };

    assert.equal(create_door(descriptor, child, random), true);
    assert.equal(draws.length, 0);
    assert.deepEqual(events, ['rn2(2)', 'rn2(5)', 'rn2(20)', 'rn2(4)']);
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

test('unimplemented direct and Water vault handlers fail before mutation', () => {
    for (const id of ['fake-delphi', 'water-surrounded-vault']) {
        resetThemeroomLevel();
        let randomCalls = 0;
        assert.throws(
            () => dispatch_themeroom(
                definitionById(id),
                () => { ++randomCalls; return 0; },
                (bound) => bound,
                { difficulty: 1 },
            ),
            UnsupportedThemeroomActionError,
        );
        assert.equal(randomCalls, 0, id);
        assert.equal(game.level.nroom, 0, id);
        assert.equal(game.level.at(10, 10).typ, STONE, id);
    }
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
