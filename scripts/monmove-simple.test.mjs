import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COULD_SEE,
    FOUNTAIN,
    MON_FLOOR,
    NORMAL_SPEED,
    PIT,
    ROOM,
    STONE,
    W_NONDIGGABLE,
    W_NONPASSWALL,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_DISPLACER_BEAST,
    PM_GIANT_RAT,
    PM_PURPLE_WORM,
    PM_SHRIEKER,
} from '../js/monsters.js';
import {
    preflightSimpleMonsterActions,
    UnsupportedSimpleMonsterActionError,
} from '../js/monmove_simple.js';
import { newMonster } from '../js/monst.js';
import { create_region } from '../js/region.js';
import { getRngLog } from '../js/rng.js';

const DATETIME = '20260725120000';

function rngSnapshot() {
    return {
        a: game.coreCtx.a,
        b: game.coreCtx.b,
        c: game.coreCtx.c,
        n: game.coreCtx.n,
        m: [...game.coreCtx.m],
        r: [...game.coreCtx.r],
    };
}

function monsterSnapshot() {
    const monsters = [];
    for (let monster = game.level.monlist;
        monster;
        monster = monster.nmon) {
        const copy = {
            ...monster,
            data: monster.data?.pmidx ?? null,
            minvent: linkedObjects(monster.minvent, 'nobj'),
        };
        delete copy.nmon;
        monsters.push(structuredClone(copy));
    }
    return monsters;
}

function preflightSnapshot() {
    return {
        gg: { ...game.gg },
        monsters: monsterSnapshot(),
        rng: rngSnapshot(),
        hero: {
            movement: game.u.umovement,
            x: game.u.ux,
            y: game.u.uy,
        },
    };
}

function linkedObjects(head, link) {
    const objects = [];
    for (let object = head; object; object = object[link]) {
        const copy = { ...object };
        delete copy[link];
        delete copy.nexthere;
        delete copy.cobj;
        objects.push(structuredClone(copy));
    }
    return objects;
}

function completePreflightSnapshot(replay) {
    return {
        context: structuredClone(game.context),
        display: {
            cursor: [
                game.nhDisplay.cursorCol,
                game.nhDisplay.cursorRow,
                game.nhDisplay.cursorVisible,
            ],
            grid: structuredClone(game.nhDisplay.grid),
            messages: [...game.nhDisplay.messages],
            pending: game._pending_message,
            topMessage: game.nhDisplay.topMessage,
            toplines: game.nhDisplay.toplines,
        },
        gg: structuredClone(game.gg),
        hero: structuredClone(game.u),
        input: {
            queue: [
                ...(game.nhDisplay.terminal._inputQueue ?? []),
            ],
            waiting: game.nhDisplay.isWaitingForInput,
        },
        monsters: monsterSnapshot(),
        output: {
            animations: structuredClone(
                replay.getAnimationFramesByStep(),
            ),
            cursors: structuredClone(replay.getCursors()),
            rngSlices: structuredClone(replay.getRngSlices()),
            screens: [...replay.getScreens()],
        },
        rng: {
            context: rngSnapshot(),
            log: [...getRngLog()],
        },
        world: {
            locations: structuredClone(game.level.locations),
            monsterGrid: game.level.monsters.map(
                (column) => column.map(
                    (monster) => monster?.m_id ?? 0,
                ),
            ),
            objectGrid: game.level.objects.map(
                (column) => column.map(
                    (object) => object?.o_id ?? 0,
                ),
            ),
            objects: linkedObjects(game.level.objlist, 'nobj'),
            regions: structuredClone(game.level.regions),
            traps: structuredClone(game.level.traps),
            vision: game.viz_array.map((row) => [...row]),
        },
    };
}

function clearCoordinateGrid(grid) {
    for (const column of grid) column.fill(null);
}

function ordinaryMonster(pmidx, x, y, overrides = {}) {
    const species = game.mons[pmidx];
    return newMonster({
        data: species,
        m_id: 9001,
        mnum: pmidx,
        movement: NORMAL_SPEED,
        m_lev: Math.max(1, species.mlevel),
        mx: x,
        my: y,
        mux: game.u.ux,
        muy: game.u.uy,
        mhp: 5,
        mhpmax: 5,
        mcanmove: true,
        mcansee: true,
        ...overrides,
    });
}

function floorObject(x, y, id = 9101) {
    return {
        cobj: null,
        nobj: null,
        nexthere: null,
        o_id: id,
        ox: x,
        oy: y,
        where: 1,
    };
}

async function prepareSelectedAction({
    adjacentHero = false,
    pmidx = PM_GIANT_RAT,
} = {}) {
    const replay = await runSegment({
        // This arbitrary seed supplies initialized catalogs, map, vision,
        // display, and input state; each case replaces the selected action.
        seed: 2026072503,
        datetime: DATETIME,
        nethackrc: 'OPTIONS=name:AtomicMonster,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none',
        moves: '',
    });
    const heroX = 10;
    const heroY = 10;
    const monsterX = adjacentHero ? heroX - 1 : heroX - 3;
    const destinationX = monsterX + 1;

    game.u.ux = game.u.ux0 = heroX;
    game.u.uy = game.u.uy0 = heroY;
    game.u.uinwater = false;
    game.u.ustuck = null;
    game.u.usteed = null;
    game.u.utotype = 0;
    game.moves = 2;
    game.context.bypasses = false;
    game.occupation = null;
    game.head_engr = null;

    clearCoordinateGrid(game.level.monsters);
    clearCoordinateGrid(game.level.objects);
    game.level.monlist = null;
    game.level.objlist = null;
    game.level.buriedobjlist = null;
    game.level.traps = [];
    game.level.regions = [];
    game.level.flags.has_temple = false;
    game.level.flags.shortsighted = false;

    for (let x = monsterX - 1; x <= monsterX + 1; ++x) {
        for (let y = heroY - 1; y <= heroY + 1; ++y) {
            const location = game.level.at(x, y);
            location.typ = STONE;
            location.flags = location.doormask = 0;
            location.wall_info = W_NONDIGGABLE | W_NONPASSWALL;
        }
    }
    // The source square and straight route to the remembered hero are clear.
    // Only destinationX is a legal neighboring candidate.
    for (let x = monsterX; x <= heroX; ++x) {
        const location = game.level.at(x, heroY);
        location.typ = ROOM;
        location.flags = location.doormask = 0;
        location.wall_info = 0;
    }

    const monster = ordinaryMonster(pmidx, monsterX, heroY);
    game.level.monlist = monster;
    game.level.monsters[monsterX][heroY] = monster;
    // COULD_SEE makes the aligned ordinary monster keep approach=1 and
    // suppress item search unless a case clears this bit explicitly.
    game.viz_array[heroY][monsterX] |= COULD_SEE;
    return {
        destinationX,
        heroY,
        monster,
        monsterX,
        replay,
    };
}

function installObject(target, object) {
    game.level.objects[object.ox][object.oy] = object;
    game.level.objlist = object;
    target.object = object;
}

test('simple preflight plans a starting-dog action without live mutation',
    async () => {
        await runSegment({
            seed: 2026072201,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:Pet2026072201,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:dog',
            moves: ' .',
        });
        const before = preflightSnapshot();

        await preflightSimpleMonsterActions(game);

        assert.deepEqual(preflightSnapshot(), before);
    });

test('simple preflight preserves parked-guard source ordering', async () => {
    for (const due of [true, false]) {
        const target = await prepareSelectedAction();
        clearCoordinateGrid(game.level.monsters);
        target.monster.isgd = true;
        target.monster.mx = 0;
        target.monster.my = 0;
        // moves=2 makes mlstmv=1 due and mlstmv=2 already handled.
        target.monster.mlstmv = due ? 1 : 2;
        target.monster.movement = NORMAL_SPEED - 1;
        const before = completePreflightSnapshot(target.replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            if (due) {
                await assert.rejects(
                    preflightSimpleMonsterActions(game),
                    (error) => (
                        error instanceof UnsupportedSimpleMonsterActionError
                        && error.reason === 'parked guard handling'
                    ),
                );
            } else {
                await preflightSimpleMonsterActions(game);
            }
            assert.deepEqual(
                completePreflightSnapshot(target.replay),
                before,
                `${due ? 'due' : 'inert'} guard, attempt ${attempt + 1}`,
            );
        }
    }
});

test('simple preflight rejects every selected excluded action atomically',
    async () => {
        const cases = [
            {
                name: 'hero attack',
                reason: 'monster attack on the hero',
                prepare: () => prepareSelectedAction({
                    adjacentHero: true,
                }),
            },
            {
                name: 'monster aggression',
                reason: 'ordinary monster aggression',
                prepare: async () => {
                    const target = await prepareSelectedAction({
                        pmidx: PM_PURPLE_WORM,
                    });
                    const defender = ordinaryMonster(
                        PM_SHRIEKER,
                        target.destinationX,
                        target.heroY,
                        {
                            m_id: 9002,
                            movement: 0,
                        },
                    );
                    target.monster.nmon = defender;
                    game.level.monsters[target.destinationX][target.heroY]
                        = defender;
                    return target;
                },
            },
            {
                name: 'monster displacement',
                reason: 'ordinary monster displacement',
                prepare: async () => {
                    const target = await prepareSelectedAction({
                        pmidx: PM_DISPLACER_BEAST,
                    });
                    const defender = ordinaryMonster(
                        PM_GIANT_RAT,
                        target.destinationX,
                        target.heroY,
                        {
                            m_id: 9002,
                            movement: 0,
                        },
                    );
                    target.monster.nmon = defender;
                    game.level.monsters[target.destinationX][target.heroY]
                        = defender;
                    return target;
                },
            },
            {
                name: 'floor object',
                reason: 'a floor object',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    installObject(
                        target,
                        floorObject(target.destinationX, target.heroY),
                    );
                    return target;
                },
            },
            {
                name: 'special terrain',
                reason: 'door or special terrain movement',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    game.level.at(
                        target.destinationX,
                        target.heroY,
                    ).typ = FOUNTAIN;
                    return target;
                },
            },
            {
                name: 'region transition',
                reason: 'a region transition',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    game.level.regions.push(create_region([{
                        lx: target.destinationX,
                        ly: target.heroY,
                        hx: target.destinationX,
                        hy: target.heroY,
                    }]));
                    return target;
                },
            },
            {
                name: 'item search',
                reason: 'ordinary monster item search',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    // A blind hostile sets approach=0, so m_move() enters
                    // m_search_items() regardless of line-of-fire geometry.
                    target.monster.mcansee = false;
                    game.viz_array[target.heroY][target.monsterX]
                        &= ~COULD_SEE;
                    installObject(
                        target,
                        floorObject(target.monsterX, target.heroY),
                    );
                    return target;
                },
            },
            {
                name: 'trap activation',
                reason: 'trap activation',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    game.level.traps.push({
                        tx: target.destinationX,
                        ty: target.heroY,
                        ttyp: PIT,
                        tseen: false,
                    });
                    return target;
                },
            },
            {
                name: 'special monster action',
                reason: 'a special monster action',
                prepare: () => prepareSelectedAction({
                    pmidx: PM_SHRIEKER,
                }),
            },
        ];

        for (const actionCase of cases) {
            const target = await actionCase.prepare();
            const before = completePreflightSnapshot(target.replay);
            for (let attempt = 0; attempt < 2; ++attempt) {
                await assert.rejects(
                    preflightSimpleMonsterActions(game),
                    (error) => (
                        error instanceof UnsupportedSimpleMonsterActionError
                        && error.reason === actionCase.reason
                    ),
                    `${actionCase.name}, attempt ${attempt + 1}`,
                );
                assert.deepEqual(
                    completePreflightSnapshot(target.replay),
                    before,
                    `${actionCase.name}, attempt ${attempt + 1}`,
                );
            }
        }
    });

test('simple preflight rejects a selected trap without live mutation',
    async () => {
        await runSegment({
            seed: 840003,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:BoundaryStop,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen',
            moves: ' .',
        });
        const before = preflightSnapshot();

        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'trap activation',
        );

        assert.deepEqual(preflightSnapshot(), before);
    });
