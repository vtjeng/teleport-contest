// Focused tests for the source-owned helpers which carry a positive decimal
// level teleport from dungeon topology resolution to random hero placement.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AIR,
    ACH_SHOP,
    ARROW_TRAP,
    CORR,
    DEAF,
    LAST_PROP,
    LEVITATION,
    LR_BRANCH,
    LR_DOWNTELE,
    LR_TELE,
    LR_UPTELE,
    MAGIC_PORTAL,
    OBJ_FLOOR,
    OBJ_INVENT,
    ROOMOFFSET,
    ROOM,
    SHOPBASE,
    STONE,
    VIBRATING_SQUARE,
    undestroyable_trap,
} from '../js/const.js';
import {
    In_W_tower,
    On_W_tower_level,
    get_level,
    lev_by_name,
    single_level_branch,
    u_on_newpos,
    u_on_rndspot,
} from '../js/dungeon.js';
import {
    finish_random_arrival_effects,
    goto_level,
    place_random_arrival,
} from '../js/do.js';
import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { inv_weight, weight_cap } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import {
    UnsupportedRegionPlacementError,
    bad_location,
    is_exclusion_zone,
    place_lregion,
} from '../js/mkmaze.js';
import { PM_DWARF, monst_globals_init } from '../js/monsters.js';
import { m_at } from '../js/monst.js';
import { mksobj_at } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { APPLE, CORPSE, ELVEN_DAGGER, TIN } from '../js/objects.js';
import { pickup } from '../js/pickup.js';
import { com_pager } from '../js/questpgr.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { roles } from '../js/roles.js';
import { costly_spot, inside_shop, u_entered_shop } from '../js/shk.js';
import { SHTYPES } from '../js/shtypes_data.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    loadLevelTeleportArrivalRecipe,
    verifyLevelTeleportArrival,
} from './run-level-teleport-arrival.mjs';

test('the arrival matrix is a clean audited replay recipe', () => {
    const recipe = loadLevelTeleportArrivalRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [
            7621004,
            7621001,
            7661000,
            7661011,
            7661130,
            7661513,
            8040709,
            7650048,
            7650182,
            7650574,
            7650033,
            7650278,
            7650103,
            9450654,
            9449443,
            9449967,
            9449779,
            7650800,
            9461088,
            9461387,
            9470202,
            9470211,
            9490235,
            9495425,
            7640011,
            7640059,
            7633019,
            7633019,
            7641005,
            7660607,
            7660416,
            7643705,
            7645000,
            7621009,
        ],
    );
    assert.deepEqual(
        recipe.segments
            .filter(({ seed }) => seed === 7633019)
            .map(({ nethackrc }) => /\bdeaf\b/u.test(nethackrc))
            .sort(),
        [false, true],
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /pettype:none/u);
        assert.match(segment.nethackrc, /playmode:debug/u);
        assert.equal(segment.datetime, '20310417113000');
        const acceptedMoveShapes = [
            /^\.#levelchange\n30\n {29}\x165\n\.$/u,
            /^\.\x16(?:1|2|5|14)\n *[.h]$/u,
        ];
        assert.equal(
            acceptedMoveShapes.filter((shape) => shape.test(segment.moves)).length,
            1,
            `seed ${segment.seed} must use exactly one audited move shape`,
        );
    }
});

test('the arrival recipe reaches its exact destination and trailing command',
    async () => {
        for (const segment of loadLevelTeleportArrivalRecipe().segments) {
            await verifyLevelTeleportArrival(segment);
        }
    });

function placementState() {
    return {
        level: new GameMap(),
        flags: {},
        iflags: {},
        urace: { mnum: -1 },
        u: {
            ux: 1,
            uy: 1,
            ux0: 1,
            uy0: 1,
            uz: { dnum: 0, dlevel: 2 },
            uz0: { dnum: 0, dlevel: 1 },
            umonnum: 0,
            umonster: 0,
            uprops: Array.from(
                { length: LAST_PROP + 1 },
                () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
            ),
        },
        dndest: {},
        updest: {},
        wiz1_level: { dnum: 9, dlevel: 1 },
        wiz2_level: { dnum: 9, dlevel: 2 },
        wiz3_level: { dnum: 9, dlevel: 3 },
        exclusion_zones: null,
    };
}

test('bad_location admits exactly room, air, and maze corridors', () => {
    const state = placementState();
    const location = state.level.at(10, 5);

    location.typ = ROOM;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), false);
    location.typ = AIR;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), false);
    location.typ = CORR;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), true);
    state.level.flags.is_maze_lev = true;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), false);
    location.typ = STONE;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), true);

    location.typ = ROOM;
    assert.equal(bad_location(10, 5, 9, 4, 11, 6, state), true);
    state.level.traps.push({ tx: 10, ty: 5, ttyp: ARROW_TRAP });
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), true);
});

test('teleport exclusion zones apply in C source order and direction', () => {
    const state = placementState();
    state.exclusion_zones = {
        zonetype: LR_DOWNTELE,
        lx: 20, ly: 4, hx: 25, hy: 8,
        next: {
            zonetype: LR_TELE,
            lx: 10, ly: 3, hx: 15, hy: 7,
            next: null,
        },
    };

    assert.equal(is_exclusion_zone(LR_DOWNTELE, 20, 4, state), true);
    assert.equal(is_exclusion_zone(LR_UPTELE, 20, 4, state), false);
    assert.equal(is_exclusion_zone(LR_DOWNTELE, 12, 5, state), true);
    assert.equal(is_exclusion_zone(LR_UPTELE, 12, 5, state), true);
    assert.equal(is_exclusion_zone(LR_BRANCH, 12, 5, state), false);
    assert.equal(is_exclusion_zone(LR_DOWNTELE, 16, 5, state), false);
});

test('u_on_rndspot retries trap and monster squares in exact PRNG order', () => {
    const state = placementState();
    // ISAAC seed 1 produces <7,14>, <36,7>, <79,4> for the first three
    // rn1(79,1)/rn1(21,0) pairs. Make them respectively trap, monster, clear.
    const candidates = [[7, 14], [36, 7], [79, 4]];
    for (const [x, y] of candidates) state.level.at(x, y).typ = ROOM;
    const trap = { tx: 7, ty: 14, ttyp: ARROW_TRAP };
    const monster = { mx: 36, my: 7, mhp: 1 };
    state.level.traps.push(trap);
    state.level.monsters[36][7] = monster;

    initRng(1);
    enableRngLog();
    u_on_rndspot(0, state);

    assert.deepEqual([state.u.ux, state.u.uy], [79, 4]);
    assert.deepEqual(getRngLog(), [
        'rn2(79)=6', 'rn2(21)=14',
        'rn2(79)=35', 'rn2(21)=7',
        'rn2(79)=78', 'rn2(21)=4',
    ]);
    assert.equal(state.level.traps[0], trap);
    assert.equal(state.level.monsters[36][7], monster);
});

test('a one-dimensional arrival region is not treated as a one-shot square',
    () => {
        const state = placementState();
        state.level.at(7, 14).typ = ROOM;
        state.level.at(7, 15).typ = ROOM;
        const trap = { tx: 7, ty: 14, ttyp: ARROW_TRAP };
        state.level.traps.push(trap);

        initRng(1);
        place_lregion(7, 14, 7, 15, 0, 0, 0, 0,
                      LR_DOWNTELE, null, state);

        assert.deepEqual([state.u.ux, state.u.uy], [7, 15]);
        assert.equal(state.level.traps[0], trap);
    });

test('the deterministic placement sweep includes both upper bounds', () => {
    const state = placementState();
    // Leave exactly the last square usable. Seed 1 does not choose it during
    // the 200 random attempts, so mkmaze.c's deterministic sweep must reach it.
    state.level.at(79, 20).typ = ROOM;

    initRng(1);
    place_lregion(1, 0, 79, 20, 0, 0, 0, 0,
                  LR_DOWNTELE, null, state);

    assert.deepEqual([state.u.ux, state.u.uy], [79, 20]);
});

test('unbounded branch placement is refused only for a level with rooms',
    () => {
        const state = placementState();
        state.level.nroom = 0;
        assert.throws(
            () => place_lregion(0, 0, 0, 0, 0, 0, 0, 0,
                                LR_BRANCH, null, state),
            (error) => !(error instanceof UnsupportedRegionPlacementError)
                && error.message === `Couldn't place lregion type ${LR_BRANCH}!`,
        );
    });

test('numeric topology resolution is pure and stays in the current dungeon',
    () => {
        const state = {
            u: { uz: { dnum: 0, dlevel: 1 } },
            dungeons: [{
                depth_start: 1,
                num_dunlevs: 10,
                ledger_start: 0,
            }],
            branches: [],
            specialLevels: [],
            valley_level: { dnum: 1, dlevel: 1 },
            medusa_level: { dnum: 0, dlevel: 8 },
        };
        assert.equal(lev_by_name('5', state), 0);
        assert.equal(Object.hasOwn(state, 'svl'), false);

        const destination = { dnum: -1, dlevel: -1 };
        get_level(destination, 5, state);
        assert.deepEqual(destination, { dnum: 0, dlevel: 5 });
        get_level(destination, 99, state);
        assert.deepEqual(destination, { dnum: 0, dlevel: 10 });
        get_level(destination, 0, state);
        assert.deepEqual(destination, { dnum: 0, dlevel: 1 });

        const branchState = {
            u: { uz: { dnum: 1, dlevel: 1 } },
            dungeons: [
                { depth_start: 1, num_dunlevs: 4, ledger_start: 0 },
                { depth_start: 5, num_dunlevs: 3, ledger_start: 4 },
            ],
            branches: [{
                end1: { dnum: 0, dlevel: 4 },
                end2: { dnum: 1, dlevel: 1 },
            }],
        };
        get_level(destination, 1, branchState);
        assert.deepEqual(destination, { dnum: 0, dlevel: 1 });
    });

test('single-level and Wizard tower predicates read their source-owned state',
    () => {
        const state = placementState();
        state.knox_level = { dnum: 4, dlevel: 1 };
        assert.equal(single_level_branch({ dnum: 4, dlevel: 1 }, state), true);
        assert.equal(single_level_branch({ dnum: 0, dlevel: 1 }, state), false);

        assert.equal(On_W_tower_level({ dnum: 9, dlevel: 2 }, state), true);
        assert.equal(On_W_tower_level({ dnum: 0, dlevel: 2 }, state), false);
        state.dndest = { nlx: 30, nly: 4, nhx: 40, nhy: 12 };
        assert.equal(In_W_tower(35, 8, { dnum: 9, dlevel: 2 }, state), true);
        assert.equal(In_W_tower(20, 8, { dnum: 9, dlevel: 2 }, state), false);
        assert.equal(In_W_tower(35, 8, { dnum: 0, dlevel: 2 }, state), false);
    });

test('ordinary tower-level arrivals do not use the tower-preservation region',
    () => {
        const state = placementState();
        state.u.uz = { dnum: 9, dlevel: 2 };
        state.dndest = {
            lx: 10, ly: 5, hx: 10, hy: 5,
            nlx: 30, nly: 7, nhx: 30, nhy: 7,
        };
        state.level.at(10, 5).typ = ROOM;
        state.level.at(30, 7).typ = ROOM;

        initRng(1);
        u_on_rndspot(0, state);
        assert.deepEqual([state.u.ux, state.u.uy], [10, 5]);
    });

test('undestroyable_trap names exactly the two trap.h exceptions', () => {
    assert.equal(undestroyable_trap(MAGIC_PORTAL), true);
    assert.equal(undestroyable_trap(VIBRATING_SQUARE), true);
    assert.equal(undestroyable_trap(ARROW_TRAP), false);
});

test('a random-arrival earth-sense collector preserves the exact notice',
    () => {
        const state = placementState();
        state.urace.mnum = PM_DWARF;
        state.level.at(10, 8).typ = ROOM;
        state.level.buriedobjlist = {
            ox: 9, oy: 8,
            nobj: { ox: 10, oy: 8, nobj: null },
        };
        const lines = [];
        u_on_newpos(10, 8, state, {
            earthSenseMessage: (line) => lines.push(line),
        });
        assert.deepEqual(lines, ['You sense something below your feet.']);
        assert.deepEqual([state.u.ux, state.u.uy], [10, 8]);
    });

test('random arrival prints earth sense before switching terrain', async () => {
    const state = placementState();
    state.urace.mnum = PM_DWARF;
    state.dndest = { lx: 10, ly: 8, hx: 10, hy: 8 };
    state.level.at(10, 8).typ = ROOM;
    state.level.buriedobjlist = { ox: 10, oy: 8, nobj: null };
    const lines = [];
    const events = [];

    u_on_rndspot(0, state, {
        earthSenseMessage: (line) => {
            events.push('collect');
            lines.push(line);
        },
        deferSwitchTerrain: true,
    });
    await finish_random_arrival_effects(lines, state, {
        message: async (line) => {
            events.push(`message:${line}`);
            await Promise.resolve();
            events.push('message:done');
        },
        switchTerrain: () => events.push('switch_terrain'),
    });

    assert.deepEqual(events, [
        'collect',
        'message:You sense something below your feet.',
        'message:done',
        'switch_terrain',
    ]);

    const integrationEvents = [];
    await place_random_arrival(0, state, {
        place: (_upflag, _state, options) => {
            integrationEvents.push(`defer:${options.deferSwitchTerrain}`);
            options.earthSenseMessage('earth');
        },
        message: async (line) => integrationEvents.push(`message:${line}`),
        switchTerrain: () => integrationEvents.push('switch_terrain'),
    });
    assert.deepEqual(integrationEvents, [
        'defer:true',
        'message:earth',
        'switch_terrain',
    ]);
});

test('random arrival switches terrain unless its caller defers the effect',
    () => {
        const state = placementState();
        // A one-square region makes <10,8> the selected ROOM without a draw.
        state.dndest = { lx: 10, ly: 8, hx: 10, hy: 8 };
        state.level.at(10, 8).typ = ROOM;
        // A blocked levitation property makes switch_terrain() observable: its
        // currently unported unblocking arm throws after u_on_newpos() lands.
        state.u.uprops[LEVITATION].blocked = 1;

        assert.throws(
            () => u_on_rndspot(0, state),
            /unblocking levitation or flight/u,
        );
        assert.deepEqual([state.u.ux, state.u.uy], [10, 8]);
    });

test('random arrival deferral suppresses switch_terrain after placement', () => {
    const state = placementState();
    state.dndest = { lx: 10, ly: 8, hx: 10, hy: 8 };
    state.level.at(10, 8).typ = ROOM;
    state.u.uprops[LEVITATION].blocked = 1;

    assert.doesNotThrow(() => u_on_rndspot(0, state, {
        deferSwitchTerrain: true,
    }));
    assert.deepEqual([state.u.ux, state.u.uy], [10, 8]);
});

test('random-arrival planning never applies live placement effects',
    async () => {
        const state = placementState();
        initRng(9450611);
        state.dndest = { lx: 10, ly: 8, hx: 10, hy: 8 };
        state.level.at(10, 8).typ = ROOM;
        // A live switch_terrain() would reject this property state. The
        // caller-supplied completion proves only the committed placement gets
        // as far as the deferred switch seam.
        state.u.uprops[LEVITATION].blocked = 1;
        const events = [];

        await place_random_arrival(0, state, {
            switchTerrain: () => events.push('switch'),
        });

        assert.deepEqual([state.u.ux, state.u.uy], [10, 8]);
        assert.deepEqual(events, ['switch']);
    });

test('random arrival refuses a helpless hero before RNG or placement',
    async () => {
        const state = placementState();
        initRng(9450610);
        enableRngLog();
        state.multi = -1;
        state.dndest = { lx: 10, ly: 8, hx: 10, hy: 8 };
        state.level.at(10, 8).typ = ROOM;
        const before = {
            position: [state.u.ux, state.u.uy],
            rng: structuredClone(game.coreCtx),
            log: [...getRngLog()],
        };

        await assert.rejects(
            () => place_random_arrival(0, state),
            /pickup\(\) while helpless/u,
        );

        assert.deepEqual([state.u.ux, state.u.uy], before.position);
        assert.deepEqual(game.coreCtx, before.rng);
        assert.deepEqual(getRngLog(), before.log);
    });

test('random shop-boundary arrival refuses before relocating the hero',
    async () => {
        const state = placementState();
        initRng(9450612);
        enableRngLog();
        // A one-square destination makes <10,8> the first and only candidate;
        // room zero is represented by ROOMOFFSET in map room-number storage.
        const destination = { x: 10, y: 8 };
        state.dndest = {
            lx: destination.x,
            ly: destination.y,
            hx: destination.x,
            hy: destination.y,
        };
        state.level.rooms[0] = { rtype: SHOPBASE };
        Object.assign(state.level.at(destination.x, destination.y), {
            typ: ROOM,
            roomno: ROOMOFFSET,
            edge: true,
        });
        state.u.uundetected = true;
        state.u.usteed = { mx: state.u.ux, my: state.u.uy };
        const before = {
            hero: structuredClone(state.u),
            rng: structuredClone(game.coreCtx),
            log: [...getRngLog()],
            lastSeen: state.level.lastseentyp,
            terrainType: state.iflags.terrain_typ,
        };

        await assert.rejects(
            () => place_random_arrival(0, state),
            /outside the shop interior/u,
        );

        assert.deepEqual(state.u, before.hero);
        assert.deepEqual(game.coreCtx, before.rng);
        assert.deepEqual(getRngLog(), before.log);
        assert.equal(state.level.lastseentyp, before.lastSeen);
        assert.equal(state.iflags.terrain_typ, before.terrainType);
    });

test('multi-square shop arrival refuses without committing planned RNG',
    async () => {
        const state = placementState();
        initRng(9450613);
        enableRngLog();
        state.dndest = { lx: 10, ly: 8, hx: 11, hy: 8 };
        state.level.rooms[0] = { rtype: SHOPBASE };
        for (const x of [10, 11]) {
            Object.assign(state.level.at(x, 8), {
                typ: ROOM,
                roomno: ROOMOFFSET,
                edge: true,
            });
        }
        const before = {
            position: [state.u.ux, state.u.uy],
            rng: structuredClone(game.coreCtx),
            log: [...getRngLog()],
        };

        await assert.rejects(
            () => place_random_arrival(0, state),
            /outside the shop interior/u,
        );

        assert.deepEqual([state.u.ux, state.u.uy], before.position);
        assert.deepEqual(game.coreCtx, before.rng);
        assert.deepEqual(getRngLog(), before.log);
    });

test('multi-square dry run and replay select the same heterogeneous square',
    async () => {
        const makeState = (excludedX) => {
            const state = placementState();
            state.dndest = { lx: 10, ly: 8, hx: 11, hy: 8 };
            state.level.rooms[0] = { rtype: SHOPBASE };
            for (const x of [10, 11]) {
                Object.assign(state.level.at(x, 8), {
                    typ: ROOM,
                    roomno: x === excludedX ? ROOMOFFSET : 0,
                    edge: x === excludedX,
                });
            }
            return state;
        };

        const refused = makeState(10);
        initRng(9450613);
        enableRngLog();
        const refusedBefore = {
            position: [refused.u.ux, refused.u.uy],
            rng: structuredClone(game.coreCtx),
            log: [...getRngLog()],
        };
        await assert.rejects(
            () => place_random_arrival(0, refused),
            /outside the shop interior/u,
        );
        assert.deepEqual([refused.u.ux, refused.u.uy],
            refusedBefore.position);
        assert.deepEqual(game.coreCtx, refusedBefore.rng);
        assert.deepEqual(getRngLog(), refusedBefore.log);

        const admitted = makeState(11);
        initRng(9450613);
        enableRngLog();
        const admittedRng = structuredClone(game.coreCtx);
        await place_random_arrival(0, admitted);
        assert.deepEqual([admitted.u.ux, admitted.u.uy], [10, 8]);
        assert.notDeepEqual(game.coreCtx, admittedRng);
        assert.ok(getRngLog().length > 0);
    });

test('random arrival preflights the complete ordinary pickup transaction',
    async () => {
        await runSegment({
            seed: 7632401,
            datetime: '20310417113000',
            nethackrc: [
                'OPTIONS=name:ArrivalPickup,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,autopickup,playmode:debug',
                '',
            ].join('\n'),
            moves: '',
        });
        let destination = null;
        for (let x = 1; x < 80 && !destination; ++x) {
            for (let y = 0; y < 21; ++y) {
                if (game.level.at(x, y)?.typ === ROOM
                    && !game.level.objects[x]?.[y]
                    && !m_at(x, y, game)) {
                    destination = { x, y };
                    break;
                }
            }
        }
        assert.ok(destination);
        const corpse = mksobj_at(
            CORPSE,
            destination.x,
            destination.y,
            false,
            false,
            objectGenerationEnv({ state: game }),
        );
        game.dndest = {
            lx: destination.x,
            ly: destination.y,
            hx: destination.x,
            hy: destination.y,
        };
        enableRngLog();
        const before = {
            hero: structuredClone(game.u),
            rng: structuredClone(game.coreCtx),
            log: [...getRngLog()],
            object: {
                where: corpse.where,
                nobj: corpse.nobj,
                nexthere: corpse.nexthere,
                dknown: corpse.dknown,
            },
            floor: game.level.objects[destination.x][destination.y],
            list: game.level.objlist,
            toplines: game._ttyToplines,
            grid: structuredClone(game.nhDisplay.grid),
            cursor: [
                game.nhDisplay.cursorCol,
                game.nhDisplay.cursorRow,
                game.nhDisplay.cursorVisible,
            ],
        };

        await assert.rejects(
            () => place_random_arrival(0, game),
            /special artifact, corpse, or scare scroll/u,
        );

        assert.deepEqual(game.u, before.hero);
        assert.deepEqual(game.coreCtx, before.rng);
        assert.deepEqual(getRngLog(), before.log);
        assert.deepEqual({
            where: corpse.where,
            nobj: corpse.nobj,
            nexthere: corpse.nexthere,
            dknown: corpse.dknown,
        }, before.object);
        assert.equal(game.level.objects[destination.x][destination.y],
            before.floor);
        assert.equal(game.level.objlist, before.list);
        assert.equal(game._ttyToplines, before.toplines);
        assert.deepEqual(game.nhDisplay.grid, before.grid);
        assert.deepEqual([
            game.nhDisplay.cursorCol,
            game.nhDisplay.cursorRow,
            game.nhDisplay.cursorVisible,
        ], before.cursor);

        // With autopickup disabled, the same corpse belongs to look_here()
        // rather than pickup_object(). Both source terms independently select
        // that description-only arm.
        game.flags.pickup = false;
        await place_random_arrival(0, game);
        assert.deepEqual([game.u.ux, game.u.uy], [
            destination.x,
            destination.y,
        ]);
    });

test('rejected overweight random arrival preserves the live weight cache',
    async () => {
        await runSegment({
            seed: 7632401,
            datetime: '20310417113000',
            nethackrc: [
                'OPTIONS=name:ArrivalWeight,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,autopickup,playmode:debug',
                '',
            ].join('\n'),
            moves: '',
        });
        let destination = null;
        for (let x = 1; x < 80 && !destination; ++x) {
            for (let y = 0; y < 21; ++y) {
                if (game.level.at(x, y)?.typ === ROOM
                    && !game.level.objects[x]?.[y]
                    && !m_at(x, y, game)) {
                    destination = { x, y };
                    break;
                }
            }
        }
        assert.ok(destination);
        const apple = mksobj_at(
            APPLE,
            destination.x,
            destination.y,
            false,
            false,
            objectGenerationEnv({ state: game }),
        );
        apple.owt = 2 * weight_cap(game) - inv_weight(game);
        game.dndest = {
            lx: destination.x,
            ly: destination.y,
            hx: destination.x,
            hy: destination.y,
        };
        game.gw.wc = 123456;
        enableRngLog();
        const before = {
            position: [game.u.ux, game.u.uy],
            gw: structuredClone(game.gw),
            rng: structuredClone(game.coreCtx),
            log: [...getRngLog()],
            floor: game.level.objects[destination.x][destination.y],
            object: { where: apple.where, dknown: apple.dknown },
        };

        await assert.rejects(
            () => place_random_arrival(0, game),
            /partial or failed lift/u,
        );

        assert.deepEqual([game.u.ux, game.u.uy], before.position);
        assert.deepEqual(game.gw, before.gw);
        assert.deepEqual(game.coreCtx, before.rng);
        assert.deepEqual(getRngLog(), before.log);
        assert.equal(game.level.objects[destination.x][destination.y],
            before.floor);
        assert.deepEqual(
            { where: apple.where, dknown: apple.dknown },
            before.object,
        );
    });

test('random shop arrival preflights owned stock pricing', async () => {
    await runSegment({
        seed: 7621001,
        datetime: '20310417113000',
        nethackrc: [
            'OPTIONS=name:ArrivalShop,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!acoustics,autopickup,playmode:debug',
            '',
        ].join('\n'),
        moves: '.\x165\n.',
    });
    const room = game.level.rooms.find(
        (candidate) => candidate?.rtype >= SHOPBASE,
    );
    assert.ok(room?.resident);
    let destination = null;
    for (let x = room.lx; x <= room.hx && !destination; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            if (!game.level.at(x, y).edge
                && !game.level.objects[x]?.[y]
                && !m_at(x, y, game)) {
                destination = { x, y };
                break;
            }
        }
    }
    assert.ok(destination);
    const tin = mksobj_at(
        TIN,
        destination.x,
        destination.y,
        false,
        false,
        objectGenerationEnv({ state: game }),
    );
    // mksobj_at() prepends, so this supported object is visited before the
    // unsupported tin. A dry preflight must not discover or quote it before
    // the later member refuses the whole arrival.
    const eligible = mksobj_at(
        APPLE,
        destination.x,
        destination.y,
        false,
        false,
        objectGenerationEnv({ state: game }),
    );
    game.dndest = {
        lx: destination.x,
        ly: destination.y,
        hx: destination.x,
        hy: destination.y,
    };
    const extension = room.resident.mextra.eshk;
    const quoteSnapshot = () => [...new Set([eligible.otyp, tin.otyp])]
        .sort((left, right) => left - right)
        .map((otyp) => {
            const type = game.objects[otyp];
            return [
                otyp,
                type.oc_buy_minseen,
                type.oc_buy_maxseen,
                type.oc_sell_minseen,
                type.oc_sell_maxseen,
            ];
        });
    enableRngLog();
    const before = {
        hero: structuredClone(game.u),
        rng: structuredClone(game.coreCtx),
        log: [...getRngLog()],
        achievement: [...game.u.uachieved],
        shop: structuredClone({
            visitct: extension.visitct,
            customer: extension.customer,
            bill_p: extension.bill_p,
            following: extension.following,
        }),
        objects: [eligible, tin].map((object) => ({
            dknown: object.dknown,
            where: object.where,
            nobj: object.nobj,
            nexthere: object.nexthere,
        })),
        floor: game.level.objects[destination.x][destination.y],
        list: game.level.objlist,
        quotes: quoteSnapshot(),
        toplines: game._ttyToplines,
        grid: structuredClone(game.nhDisplay.grid),
        cursor: [
            game.nhDisplay.cursorCol,
            game.nhDisplay.cursorRow,
            game.nhDisplay.cursorVisible,
        ],
    };

    await assert.rejects(
        () => place_random_arrival(0, game),
        /corpse, tin, or egg pricing adjustment/u,
    );

    assert.deepEqual(game.u, before.hero);
    assert.deepEqual(game.coreCtx, before.rng);
    assert.deepEqual(getRngLog(), before.log);
    assert.deepEqual(game.u.uachieved, before.achievement);
    assert.deepEqual({
        visitct: extension.visitct,
        customer: extension.customer,
        bill_p: extension.bill_p,
        following: extension.following,
    }, before.shop);
    assert.deepEqual([eligible, tin].map((object) => ({
        dknown: object.dknown,
        where: object.where,
        nobj: object.nobj,
        nexthere: object.nexthere,
    })), before.objects);
    assert.equal(game.level.objects[destination.x][destination.y],
        before.floor);
    assert.equal(game.level.objlist, before.list);
    assert.deepEqual(quoteSnapshot(), before.quotes);
    assert.equal(game._ttyToplines, before.toplines);
    assert.deepEqual(game.nhDisplay.grid, before.grid);
    assert.deepEqual([
        game.nhDisplay.cursorCol,
        game.nhDisplay.cursorRow,
        game.nhDisplay.cursorVisible,
    ], before.cursor);

    // A supported owned object must pass with the destination shop projected
    // as current. Treating this as new-level room clearing loses u.ushops and
    // turns valid pricing into an ownership refusal.
    let admitted = null;
    for (let x = room.lx; x <= room.hx && !admitted; ++x) {
        for (let y = room.ly; y <= room.hy; ++y) {
            if (!game.level.at(x, y).edge
                && !game.level.objects[x]?.[y]
                && !m_at(x, y, game)) {
                admitted = { x, y };
                break;
            }
        }
    }
    assert.ok(admitted);
    mksobj_at(
        APPLE,
        admitted.x,
        admitted.y,
        false,
        false,
        objectGenerationEnv({ state: game }),
    );
    game.dndest = {
        lx: admitted.x,
        ly: admitted.y,
        hx: admitted.x,
        hy: admitted.y,
    };
    await place_random_arrival(0, game);
    assert.deepEqual([game.u.ux, game.u.uy], [admitted.x, admitted.y]);
});

test('the Quest portal pager spends its private shuffle before exact lines',
    async () => {
        const state = { urole: roles.find((role) => role.filecode === 'Wiz') };
        monst_globals_init(state);
        const events = [];
        await com_pager('quest_portal', state, {
            random: (bound) => {
                events.push(`rng:${bound}`);
                return 0;
            },
            message: async (line) => events.push(`msg:${line}`),
        });
        assert.deepEqual(events, [
            'rng:3',
            'rng:2',
            'msg:You receive a faint telepathic message from Neferet the Green:',
            'msg:Your help is urgently needed at the Lonely Tower!',
            'msg:Look for a ...ic transporter.',
            "msg:You couldn't quite make out that last message.",
        ]);
    });

test('Quest arrival sets qcalled before the pager shuffle', async () => {
    const segment = loadLevelTeleportArrivalRecipe().segments.find(
        ({ seed }) => seed === 7645000,
    );
    assert.ok(segment);
    await runSegment({ ...segment, moves: '.' });
    enableRngLog();

    const uevent = { ...game.u.uevent };
    let qcalled = uevent.qcalled ?? 0;
    let drawsAtAssignment = null;
    Object.defineProperty(uevent, 'qcalled', {
        configurable: true,
        enumerable: true,
        get: () => qcalled,
        set(value) {
            drawsAtAssignment = getRngLog().length;
            qcalled = value;
        },
    });
    game.u.uevent = uevent;
    for (const key of '    ') game.nhDisplay.pushKey(key.charCodeAt(0));

    await goto_level({ dnum: 0, dlevel: 14 }, false, false, false, game);

    assert.equal(qcalled, 1);
    assert.notEqual(drawsAtAssignment, null);
    assert.match(getRngLog()[drawsAtAssignment], /^rn2\(3\)=/u);
    assert.match(getRngLog()[drawsAtAssignment + 1], /^rn2\(2\)=/u);
});

test('ordinary arrival autopickup transfers both floor indexes to inventory',
    async () => {
        await runSegment({
            seed: 7632401,
            datetime: '20310417113000',
            nethackrc: [
                'OPTIONS=name:Pickup,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,autopickup,playmode:debug',
                '',
            ].join('\n'),
            moves: '',
        });
        const { ux, uy } = game.u;
        const apple = mksobj_at(
            APPLE,
            ux,
            uy,
            false,
            false,
            objectGenerationEnv({ state: game }),
        );
        // The segment stopped at its first command boundary with the welcome
        // line pending; C dismisses that before the pickup message can print.
        game.nhDisplay.pushKey(' '.charCodeAt(0));
        enableRngLog();

        assert.equal(await pickup(1, game), 1);
        assert.notEqual(game.level.objlist, apple);
        assert.notEqual(game.level.objects[ux][uy], apple);
        assert.equal(apple.where, OBJ_INVENT);
        let carriedApple = false;
        for (let obj = game.invent; obj; obj = obj.nobj) {
            if (obj === apple) carriedApple = true;
        }
        assert.equal(carriedApple, true);
        assert.equal(apple.pickup_prev, true);
        assert.equal(apple.dknown, true);
        assert.deepEqual(getRngLog(), []);
    });

test('ordinary shop arrival performs the peaceful first-visit greeting',
    async () => {
        await runSegment({
            seed: 7621001,
            datetime: '20310417113000',
            nethackrc: [
                'OPTIONS=name:Shop,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,playmode:debug',
                '',
            ].join('\n'),
            moves: '.\x165\n.',
        });
        const room = game.level.rooms.find(
            (candidate) => candidate?.rtype >= SHOPBASE,
        );
        assert.ok(room?.resident, 'the source-selected D:5 layout has a shop');
        const roomno = room.roomnoidx + ROOMOFFSET;
        let interior = null;
        for (let x = room.lx; x <= room.hx && !interior; x++) {
            for (let y = room.ly; y <= room.hy; y++) {
                if (!game.level.at(x, y).edge
                    && (x !== room.resident.mx || y !== room.resident.my)) {
                    interior = { x, y };
                    break;
                }
            }
        }
        assert.ok(interior);
        game.u.ux = interior.x;
        game.u.uy = interior.y;

        const originalRoomType = room.rtype;
        room.rtype = SHOPBASE;
        assert.equal(inside_shop(interior.x, interior.y, game), roomno);
        room.rtype = originalRoomType;

        const extension = room.resident.mextra.eshk;
        const owner = extension.shknam.endsWith('s')
            ? `${extension.shknam}'` : `${extension.shknam}'s`;
        const shopName = SHTYPES[room.rtype - SHOPBASE].name;
        const wizardRole = roles.find((role) => role.filecode === 'Wiz');
        const samuraiRole = roles.find((role) => role.filecode === 'Sam');
        assert.ok(wizardRole && samuraiRole);

        async function enterWith({ role, intrinsic = 0, extrinsic = 0,
            blocked = 0, roleplay = false, expected }) {
            extension.visitct = 0;
            extension.customer = '';
            extension.bill_p = null;
            extension.following = false;
            extension.surcharge = false;
            extension.robbed = 0;
            room.resident.mpeaceful = true;
            room.resident.mcanmove = true;
            room.resident.msleeping = false;
            game.urole = role;
            game.u.uprops[DEAF].intrinsic = intrinsic;
            game.u.uprops[DEAF].extrinsic = extrinsic;
            game.u.uprops[DEAF].blocked = blocked;
            game.u.uroleplay.deaf = roleplay;
            const lines = [];
            assert.equal(await u_entered_shop([roomno], game, {
                message: async (line) => {
                    assert.equal(game.u.uachieved.includes(ACH_SHOP), true);
                    assert.equal(extension.bill_p, extension.bill);
                    assert.equal(extension.customer, game.plname);
                    assert.equal(extension.visitct, 1);
                    assert.equal(extension.following, false);
                    assert.equal(room.resident.mpeaceful, true);
                    assert.equal(extension.surcharge, false);
                    lines.push(line);
                },
            }), true);
            assert.deepEqual(lines, [expected]);
        }

        await enterWith({
            role: wizardRole,
            expected: `"Hello, ${game.plname}!  Welcome to ${owner} ${shopName}!"`,
        });
        await enterWith({
            role: samuraiRole,
            expected: `"Irasshaimase, ${game.plname}!  Welcome to ${owner} ${shopName}!"`,
        });
        const deafGreeting = `You enter ${owner} ${shopName}!`;
        await enterWith({ role: wizardRole, intrinsic: 1, expected: deafGreeting });
        await enterWith({ role: wizardRole, extrinsic: 1, expected: deafGreeting });
        await enterWith({
            role: wizardRole,
            intrinsic: 1,
            blocked: 1,
            expected: deafGreeting,
        });
        await enterWith({ role: wizardRole, roleplay: true, expected: deafGreeting });

        // A shop boundary belongs to the room but is not strictly inside it.
        // The port does not yet own C's blocking dialogue, so refusal must
        // precede every achievement, billing, customer, visit, and UI write.
        game.level.at(interior.x, interior.y).edge = true;
        game.u.uachieved = game.u.uachieved.filter(
            (achievement) => achievement !== ACH_SHOP,
        );
        extension.visitct = 0;
        extension.customer = '';
        extension.bill_p = null;
        const edgeLines = [];
        await assert.rejects(
            () => u_entered_shop([roomno], game, {
                message: async (line) => edgeLines.push(line),
            }),
            /outside the shop interior/u,
        );
        assert.equal(game.u.uachieved.includes(ACH_SHOP), false);
        assert.equal(extension.bill_p, null);
        assert.equal(extension.customer, '');
        assert.equal(extension.visitct, 0);
        assert.deepEqual(edgeLines, []);
        game.level.at(interior.x, interior.y).edge = false;

        // pickup.c autopick() skips owned merchandise but accepts no_charge
        // objects. Put both on a square aligned with exactly one keeper
        // coordinate so costly_spot()'s source `x && y` exclusion is pinned.
        let aligned = null;
        for (let x = room.lx; x <= room.hx && !aligned; ++x) {
            for (let y = room.ly; y <= room.hy; ++y) {
                const sharesExactlyOne = (x === room.resident.mx)
                    !== (y === room.resident.my);
                if (!game.level.at(x, y).edge && sharesExactlyOne) {
                    aligned = { x, y };
                    break;
                }
            }
        }
        assert.ok(aligned);
        game.u.ux = aligned.x;
        game.u.uy = aligned.y;
        // This test relocates the hero without move_update(). Keep u.ushops
        // synchronized with the generated strict-interior square so the
        // post-pickup look_here() call sees the same state a real move would.
        game.u.ushops.fill(0);
        game.u.ushops[0] = roomno;
        game.u.uprops[DEAF].intrinsic = 0;
        game.u.uprops[DEAF].extrinsic = 0;
        game.u.uprops[DEAF].blocked = 0;
        game.u.uroleplay.deaf = false;
        game.flags.pickup = true;
        const owned = mksobj_at(
            APPLE, aligned.x, aligned.y, false, false,
            objectGenerationEnv({ state: game }),
        );
        const noCharge = mksobj_at(
            ELVEN_DAGGER, aligned.x, aligned.y, false, false,
            objectGenerationEnv({ state: game }),
        );
        noCharge.no_charge = true;
        const ownedLinks = { nobj: owned.nobj, nexthere: owned.nexthere };
        assert.equal(costly_spot(aligned.x, aligned.y, game), true);
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        game.nhDisplay.pushKey(' '.charCodeAt(0));

        assert.equal(await pickup(1, game), 1);
        assert.equal(noCharge.where, OBJ_INVENT);
        assert.equal(owned.where, OBJ_FLOOR);
        assert.equal(game.level.objects[aligned.x][aligned.y], owned);
        assert.equal(game.level.objlist, owned);
        assert.deepEqual({ nobj: owned.nobj, nexthere: owned.nexthere },
            ownedLinks);
    });

test('the first later room family remains a named live generation boundary',
    async () => {
        let boundary = null;
        await runSegment({
            seed: 7646010,
            datetime: '20310417113000',
            nethackrc: [
                'OPTIONS=name:Arrival,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,playmode:debug',
                '',
            ].join('\n'),
            moves: '.\x166\n.',
        }, { onBoundary: (error) => { boundary = error; } });

        assert.equal(boundary?.name, 'UnsupportedSpecialRoomError');
        assert.equal(boundary?.message, 'unsupported special room: do_mkroom(11)');
        assert.equal(game.u.uz.dlevel, 6);
        assert.equal(game._commandDispatchCount, 2);
    });
