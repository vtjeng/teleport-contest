import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BURN,
    BURN_OBJECT,
    CONFLICT,
    COULD_SEE,
    CORR,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    DUST,
    DOOR,
    FOUNTAIN,
    HEADSTONE,
    IN_SIGHT,
    I_SPECIAL,
    LADDER,
    LAVAPOOL,
    LS_OBJECT,
    MMOVE_NOTHING,
    MON_FLOOR,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NORMAL_SPEED,
    OBJ_FLOOR,
    OBJ_MINVENT,
    PIT,
    POOL,
    ROOM,
    STAIRS,
    STONE,
    TIMER_OBJECT,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    W_SADDLE,
    W_WEP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { new_light_source } from '../js/light.js';
import { runSegment } from '../js/jsmain.js';
import {
    AT_BREA,
    AT_GAZE,
    AT_SPIT,
    PM_DISPLACER_BEAST,
    PM_FOG_CLOUD,
    PM_GIANT_RAT,
    PM_GNOME,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_ORC_SHAMAN,
    PM_PONY,
    PM_PURPLE_WORM,
    PM_ROCK_MOLE,
    PM_SHRIEKER,
    S_HUMAN,
} from '../js/monsters.js';
import {
    hasOnlyInertStartingSaddle,
    preflightSimpleMonsterActions,
    runSimpleMonsterAction,
    UnsupportedSimpleMonsterActionError,
} from '../js/unported_monster_actions.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import {
    DAGGER,
    FOOD_RATION,
    ORCISH_HELM,
    POT_HEALING,
    POT_SPEED,
    ROCK,
    SADDLE,
    TRIPE_RATION,
    WAX_CANDLE,
} from '../js/objects.js';
import { create_region } from '../js/region.js';
import { start_timer } from '../js/timeout.js';
import { completeSecondTurnSnapshot } from './second-turn-snapshot.mjs';
import { UnsupportedObjectNameError } from '../js/objnam.js';

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

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
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

function floorObject(x, y, id = 9101, otyp = ROCK) {
    const type = game.objects[otyp];
    return {
        cobj: null,
        nobj: null,
        nexthere: null,
        o_id: id,
        oclass: type.oc_class,
        ox: x,
        oy: y,
        otyp,
        owt: type.oc_weight,
        quan: 1,
        spe: 0,
        where: 1,
    };
}

function monsterObject(otyp, id = 9201) {
    return {
        ...floorObject(0, 0, id, otyp),
        ox: 0,
        oy: 0,
        where: OBJ_MINVENT,
    };
}

function installCurrentSquareEngraving(target, overrides = {}) {
    const text = 'Elbereth';
    game.head_engr = {
        engr_alloc: text.length * 3 + 3,
        engr_szeach: text.length + 1,
        engr_time: game.moves,
        engr_txt: [text, text, text],
        engr_type: DUST,
        engr_x: target.monsterX,
        engr_y: target.heroY,
        eread: false,
        erevealed: false,
        guardobjects: false,
        nowipeout: false,
        nxt_engr: null,
        ...overrides,
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

async function prepareStartingPetAction(pmidx) {
    const target = await prepareSelectedAction({ pmidx });
    const { monster } = target;
    monster.data = game.mons[pmidx];
    monster.mnum = pmidx;
    monster.m_lev = Math.max(1, monster.data.mlevel);
    monster.mhp = monster.mhpmax = 8;
    monster.mpeaceful = true;
    monster.mtame = 10;
    monster.mextra = {
        edog: {
            apport: 10,
            dropdist: 10000,
            droptime: 0,
            hungrytime: 1000,
            mhpmax_penalty: 0,
            ogoal: { x: 0, y: 0 },
            whistletime: 0,
        },
    };
    game.context.startingpet_mid = monster.m_id;
    game.context.startingpet_typ = pmidx;
    return target;
}

function installObject(target, object) {
    game.level.objects[object.ox][object.oy] = object;
    game.level.objlist = object;
    target.object = object;
}

function installPetDefender(target) {
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
    game.level.monsters[target.destinationX][target.heroY] = defender;
}

test('complete retry snapshot includes every audited scheduler root',
    async () => {
        const target = await prepareSelectedAction();
        const snapshot = completeSecondTurnSnapshot(game, target.replay);

        assert.equal(
            snapshot.command.commandDispatchCount,
            game._commandDispatchCount,
        );
        assert.equal(snapshot.turn.moves, game.moves);
        assert.equal(snapshot.turn.heroSeq, game.hero_seq ?? null);
        assert.equal(
            snapshot.scheduler.somebodyCanMove,
            game.somebody_can_move ?? null,
        );
        assert.equal(
            snapshot.scheduler.visionFullRecalc,
            game.vision_full_recalc ?? null,
        );
        assert.equal(
            snapshot.scheduler.purgeMonsters,
            game.iflags.purge_monsters ?? null,
        );
        assert.deepEqual(snapshot.track, game.track);
        assert.deepEqual(
            snapshot.world.vision,
            game.viz_array.map((row) => [...row]),
        );
    });

test('complete retry snapshot detects each deferred output owner',
    async () => {
        const cases = [
            {
                name: 'command count',
                mutate: ({ state }) => {
                    state.commandCount = 7;
                },
            },
            {
                name: 'last command count',
                mutate: ({ state }) => {
                    state.lastCommandCount = 9;
                },
            },
            {
                name: 'did nothing output flag',
                mutate: ({ state }) => {
                    state.did_nothing_flag = !state.did_nothing_flag;
                },
            },
            {
                name: 'status display owner',
                mutate: ({ state }) => {
                    state.disp.botl = !state.disp.botl;
                },
            },
            {
                name: 'complete interface flags',
                mutate: ({ state }) => {
                    state.iflags.menu_requested =
                        !state.iflags.menu_requested;
                },
            },
            {
                name: 'program state',
                mutate: ({ state }) => {
                    state.program_state.gameover =
                        !state.program_state.gameover;
                },
            },
            {
                name: 'burden message state',
                mutate: ({ state }) => {
                    state.go.oldcap += 1;
                },
            },
            {
                name: 'capacity cache',
                mutate: ({ state }) => {
                    state.gw.wc += 1;
                },
            },
            // The five owners below are the globals planningState() clones.
            // Without them the snapshot cannot see a planned round that left
            // a timer, a light source, or a birth count behind, which is
            // exactly what the stop tests use it to prove.
            {
                name: 'timer queue',
                mutate: ({ state }) => {
                    state.gt.timer_base = {
                        func_index: 0,
                        kind: TIMER_OBJECT,
                        timeout: (state.moves ?? 0) + 50,
                        timer_id: (state.svt?.timer_id ?? 0) + 1,
                        arg: { o_id: 8801 },
                        next: state.gt.timer_base,
                    };
                },
            },
            {
                name: 'next timer identifier',
                mutate: ({ state }) => {
                    state.svt.timer_id += 1;
                },
            },
            {
                name: 'monster vitals',
                mutate: ({ state }) => {
                    state.mvitals[PM_GNOME].born += 1;
                },
            },
            {
                name: 'light source list',
                mutate: ({ state }) => {
                    state.gl.light_base = {
                        x: state.u.ux,
                        y: state.u.uy,
                        range: 2,
                        type: LS_OBJECT,
                        flags: 0,
                        id: { o_id: 8802 },
                        next: state.gl.light_base,
                    };
                },
            },
            {
                name: 'game option flags',
                mutate: ({ state }) => {
                    state.flags.mention_walls = !state.flags.mention_walls;
                },
            },
            {
                name: 'display RNG',
                mutate: ({ state }) => {
                    state.displayCtx.a += 1n;
                },
            },
            {
                name: 'glyph notice queue',
                mutate: ({ state }) => {
                    state._glyphUpdateNotices = [{ message: 'pending' }];
                },
            },
            {
                name: 'glyph frame tracker',
                mutate: ({ state }) => {
                    state._glyphNoticeFrameTracker = {
                        pending: new Map([[17, { gnew: 1 }]]),
                    };
                },
            },
            {
                name: 'glyph notice emission',
                mutate: ({ state }) => {
                    state._emittingGlyphUpdateNotices = true;
                },
            },
            {
                name: 'pending animation frame',
                mutate: ({ replay }) => {
                    replay._pendingAnimFrames.push({
                        cursor: [3, 4, 1],
                        screen: 'pending',
                    });
                },
            },
            {
                name: 'RNG capture index',
                mutate: ({ replay }) => {
                    replay._lastRngIdx += 1;
                },
            },
        ];

        for (const owner of cases) {
            const target = await prepareSelectedAction();
            const before = completeSecondTurnSnapshot(game, target.replay);
            owner.mutate({ replay: target.replay, state: game });
            assert.notDeepEqual(
                completeSecondTurnSnapshot(game, target.replay),
                before,
                owner.name,
            );
        }
    });

test('multi-round planning isolates every monster-generation global',
    async () => {
        const target = await prepareSelectedAction();
        const tailMonster = ordinaryMonster(
            PM_GNOME,
            target.monsterX,
            target.heroY + 1,
            {
                m_id: target.monster.m_id + 1,
                movement: 0,
            },
        );
        game.level.at(tailMonster.mx, tailMonster.my).typ = ROOM;
        target.monster.nmon = tailMonster;
        game.level.monsters[tailMonster.mx][tailMonster.my] = tailMonster;
        const lightObject = { o_id: 9801 };
        const tailLight = {
            flags: 0,
            id: tailMonster,
            next: null,
            range: 1,
            type: 1,
            x: tailMonster.mx,
            y: tailMonster.my,
        };
        const objectLight = {
            flags: 0,
            id: lightObject,
            next: tailLight,
            range: 1,
            type: 0,
            x: 4,
            y: 5,
        };
        const liveLight = {
            flags: 0,
            id: target.monster,
            next: objectLight,
            range: 1,
            type: 1,
            x: target.monster.mx,
            y: target.monster.my,
        };
        game.gl.light_base = liveLight;
        const liveVitals = structuredClone(game.mvitals);
        const liveFlags = structuredClone(game.flags);
        let reachedRound = false;

        await preflightSimpleMonsterActions(game, {
            advanceRound(planned) {
                reachedRound = true;
                assert.notStrictEqual(planned.mvitals, game.mvitals);
                assert.strictEqual(planned.svm.mvitals, planned.mvitals);
                assert.notStrictEqual(planned.flags, game.flags);
                assert.notStrictEqual(planned.gl, game.gl);
                const plannedHead = planned.gl.light_base;
                const plannedObject = plannedHead.next;
                const plannedTail = plannedObject.next;
                assert.notStrictEqual(plannedHead, liveLight);
                assert.notStrictEqual(plannedObject, objectLight);
                assert.notStrictEqual(plannedTail, tailLight);
                assert.strictEqual(
                    plannedHead.id,
                    planned.level.monlist,
                );
                assert.strictEqual(plannedObject.id, lightObject);
                assert.strictEqual(
                    plannedTail.id,
                    planned.level.monlist.nmon,
                );
                assert.strictEqual(plannedTail.next, null);
                plannedObject.range = 99;
                plannedTail.x = 77;
                planned.mvitals[PM_GNOME].born =
                    (planned.mvitals[PM_GNOME].born ?? 0) + 1;
                planned.flags.made_fruit = !planned.flags.made_fruit;
                planned.gl.light_base = {
                    flags: 0,
                    id: planned.level.monlist,
                    next: planned.gl.light_base,
                    range: 1,
                    type: 1,
                    x: 1,
                    y: 1,
                };
                return true;
            },
        });

        assert.equal(reachedRound, true);
        assert.deepEqual(game.mvitals, liveVitals);
        assert.strictEqual(game.svm.mvitals, game.mvitals);
        assert.deepEqual(game.flags, liveFlags);
        assert.strictEqual(game.gl.light_base, liveLight);
        assert.strictEqual(game.gl.light_base.id, target.monster);
        assert.strictEqual(game.gl.light_base.next, objectLight);
        assert.equal(objectLight.range, 1);
        assert.strictEqual(objectLight.next, tailLight);
        assert.equal(tailLight.x, tailMonster.mx);
        assert.strictEqual(tailLight.id, tailMonster);

        await assert.rejects(
            preflightSimpleMonsterActions(game, {
                advanceRound(planned) {
                    planned.mvitals[PM_GNOME].born =
                        (planned.mvitals[PM_GNOME].born ?? 0) + 1;
                    planned.flags.made_fruit = true;
                    planned.gl.light_base = null;
                    throw new UnsupportedSimpleMonsterActionError(
                        'a later planned generation result',
                    );
                },
            }),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'a later planned generation result'
            ),
        );
        assert.deepEqual(game.mvitals, liveVitals);
        assert.deepEqual(game.flags, liveFlags);
        assert.strictEqual(game.gl.light_base, liveLight);
    });

// mon.c movemon() sets vision_full_recalc whenever a light source is present,
// and movemon_singlemon() rebuilds viz_array for the next ration-spending
// monster. The scan after an allocation crosses that same tail, so a guard
// that only covers a repeat of the inner scan leaves the burdened path this
// preflight exists for planning against an index the live pass replaces.
test('a scan after a planned allocation refuses the light-source rebuild',
    async () => {
        const target = await prepareSelectedAction();
        game.gl.light_base = {
            flags: 0,
            id: { o_id: 9802 },
            next: null,
            range: 1,
            type: LS_OBJECT,
            x: target.monsterX,
            y: target.heroY,
        };
        game.u.umovement = 0;
        const before = completeSecondTurnSnapshot(game, target.replay);

        let rounds = 0;
        await assert.rejects(
            preflightSimpleMonsterActions(game, {
                advanceRound(planned) {
                    // The second call ends the plan, so a build that never
                    // refuses resolves instead of looping forever.
                    if (++rounds > 1) return true;
                    for (let monster = planned.level.monlist;
                        monster;
                        monster = monster.nmon) {
                        monster.movement = NORMAL_SPEED;
                    }
                    return false;
                },
            }),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason
                    === 'monster light-source vision recalculation'
            ),
        );
        assert.equal(rounds, 1);
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
        );
    });

test('fog upkeep is planned below and at its movement ration atomically',
    async () => {
        for (const movement of [0, NORMAL_SPEED]) {
            const target = await prepareSelectedAction({
                pmidx: PM_FOG_CLOUD,
            });
            target.monster.movement = movement;
            game.level.regions = [];
            const before = completeSecondTurnSnapshot(game, target.replay);
            const beforeRandom = rngSnapshot();

            // mon.c runs m_everyturn_effect() before the movement-ration test,
            // so both rations reach the fog cloud's gas-cloud upkeep. Planning
            // cannot reproduce region.c's block_point() side effect on a
            // cloned state, so it stops there either way rather than admitting
            // a scan whose later monsters would diverge live.
            for (let attempt = 0; attempt < 2; ++attempt) {
                await assert.rejects(
                    preflightSimpleMonsterActions(game),
                    (error) => (
                        error instanceof UnsupportedSimpleMonsterActionError
                        && error.reason === 'monster region creation'
                    ),
                );
                assert.deepEqual(
                    completeSecondTurnSnapshot(game, target.replay),
                    before,
                    `movement ${movement}, attempt ${attempt}`,
                );
                assert.deepEqual(rngSnapshot(), beforeRandom);
                assert.deepEqual(game.level.regions, []);
            }
        }
    });

test('simple preflight stops before current-square liquid and engraving effects',
    async () => {
        const cases = [
            {
                name: 'pool',
                reason: 'monster liquid effects',
                setup: (target) => {
                    game.level.at(target.monsterX, target.heroY).typ = POOL;
                },
            },
            {
                name: 'lava',
                reason: 'monster liquid effects',
                setup: (target) => {
                    game.level.at(target.monsterX, target.heroY).typ
                        = LAVAPOOL;
                },
            },
            {
                name: 'dust engraving',
                reason: 'monster engraving wear',
                setup: installCurrentSquareEngraving,
            },
        ];

        for (const actionCase of cases) {
            const target = await prepareSelectedAction();
            actionCase.setup(target);
            const before = completeSecondTurnSnapshot(game, target.replay);

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
                    completeSecondTurnSnapshot(game, target.replay),
                    before,
                    `${actionCase.name}, attempt ${attempt + 1}`,
                );
            }
        }
    });

test('simple preflight admits engravings that source wipe leaves intact',
    async () => {
        const cases = [
            {
                name: 'headstone',
                engraving: { engr_type: HEADSTONE },
            },
            {
                name: 'protected engraving',
                engraving: { nowipeout: true },
            },
            {
                name: 'burned room engraving',
                engraving: { engr_type: BURN },
            },
        ];

        for (const actionCase of cases) {
            const target = await prepareSelectedAction();
            installCurrentSquareEngraving(target, actionCase.engraving);
            const before = completeSecondTurnSnapshot(game, target.replay);

            for (let attempt = 0; attempt < 2; ++attempt) {
                await preflightSimpleMonsterActions(game);
                assert.deepEqual(
                    completeSecondTurnSnapshot(game, target.replay),
                    before,
                    `${actionCase.name}, attempt ${attempt + 1}`,
                );
            }
        }
    });

// mon.c mfndpos() and teleport.c goodpos() admit STAIRS as ordinary
// accessible terrain and monmove.c postmov() has no stair branch, so an
// ordinary monster steps onto a staircase with no extra effect. LADDER shares
// that C treatment but no recorded case reaches it, so it stays refused.
test('simple movement admits a staircase but not a ladder', async () => {
    const staircase = await prepareSelectedAction();
    const location = game.level.at(
        staircase.destinationX,
        staircase.heroY,
    );
    location.typ = STAIRS;
    const before = preflightSnapshot();

    await preflightSimpleMonsterActions(game);
    assert.deepEqual(preflightSnapshot(), before);
    await runSimpleMonsterAction(staircase.monster, { state: game });
    assert.deepEqual(
        [staircase.monster.mx, staircase.monster.my],
        [staircase.destinationX, staircase.heroY],
    );

    const ladder = await prepareSelectedAction();
    game.level.at(ladder.destinationX, ladder.heroY).typ = LADDER;
    const ladderBefore = completeSecondTurnSnapshot(game, ladder.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'door or special terrain movement'
            ),
            `ladder attempt ${attempt + 1}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, ladder.replay),
            ladderBefore,
            `ladder attempt ${attempt + 1}`,
        );
    }
});

test('simple movement admits only a doorless doorway', async () => {
    const doorway = await prepareSelectedAction();
    const location = game.level.at(
        doorway.destinationX,
        doorway.heroY,
    );
    location.typ = DOOR;
    location.flags = D_NODOOR;
    delete location.doormask;
    const before = preflightSnapshot();

    await preflightSimpleMonsterActions(game);
    assert.deepEqual(preflightSnapshot(), before);
    await runSimpleMonsterAction(doorway.monster, { state: game });
    assert.deepEqual(
        [doorway.monster.mx, doorway.monster.my],
        [doorway.destinationX, doorway.heroY],
    );

    for (const representation of ['flags', 'doormask']) {
        for (const mask of [
            D_BROKEN,
            D_ISOPEN,
            D_CLOSED,
            D_LOCKED,
            D_ISOPEN | D_TRAPPED,
            D_CLOSED | D_TRAPPED,
        ]) {
            const activeDoor = await prepareSelectedAction({
                pmidx: PM_GNOME,
            });
            const activeLocation = game.level.at(
                activeDoor.destinationX,
                activeDoor.heroY,
            );
            activeLocation.typ = DOOR;
            activeLocation.flags = 0;
            activeLocation.doormask = 0;
            activeLocation[representation] = mask;
            const activeBefore = completeSecondTurnSnapshot(
                game,
                activeDoor.replay,
            );

            for (let attempt = 0; attempt < 2; ++attempt) {
                if (mask === D_LOCKED) {
                    // This gnome has no unlocking tool, so mfndpos() does not
                    // select the locked square and no excluded action is due.
                    await preflightSimpleMonsterActions(game);
                } else {
                    await assert.rejects(
                        preflightSimpleMonsterActions(game),
                        (error) => (
                            error
                                instanceof UnsupportedSimpleMonsterActionError
                            && error.reason
                                === 'door or special terrain movement'
                        ),
                        `${representation} mask ${mask}, `
                            + `attempt ${attempt + 1}`,
                    );
                }
                assert.deepEqual(
                    completeSecondTurnSnapshot(game, activeDoor.replay),
                    activeBefore,
                    `${representation} mask ${mask}, attempt ${attempt + 1}`,
                );
            }
        }
    }
});

test('simple preflight recognizes only the starting pony worn saddle', () => {
    const monsterId = 7301; // A distinct live id couples saddle and pet state.
    const nonSaddleType = SADDLE - 1; // A valid unequal catalog index.
    const makeSubject = () => {
        const saddle = {
            leashmon: monsterId,
            nobj: null,
            otyp: SADDLE,
            owornmask: W_SADDLE,
        };
        const monster = {
            data: { mflags1: 0, pmidx: PM_PONY },
            m_id: monsterId,
            minvent: saddle,
            misc_worn_check: W_SADDLE,
            mw: null,
        };
        const state = {
            context: { startingpet_mid: monsterId },
        };
        return { monster, saddle, state };
    };

    const admitted = makeSubject();
    assert.equal(
        hasOnlyInertStartingSaddle(admitted.monster, admitted.state),
        true,
    );

    const rejected = [
        ({ monster }) => { monster.data.pmidx = PM_LITTLE_DOG; },
        ({ state }) => { state.context.startingpet_mid = monsterId + 1; },
        ({ monster }) => { monster.misc_worn_check = 0; },
        ({ saddle }) => { saddle.otyp = nonSaddleType; },
        ({ saddle }) => { saddle.owornmask = 0; },
        ({ saddle }) => { saddle.leashmon = monsterId + 1; },
        ({ saddle }) => {
            saddle.nobj = {
                nobj: null,
                otyp: nonSaddleType,
                owornmask: 0,
            };
        },
    ];
    for (const mutate of rejected) {
        const subject = makeSubject();
        mutate(subject);
        assert.equal(
            hasOnlyInertStartingSaddle(subject.monster, subject.state),
            false,
        );
    }
});

test('simple preflight plans a starting-dog action without live mutation',
    async () => {
        await runSegment({
            seed: 2026072201,
            datetime: DATETIME,
            nethackrc: 'OPTIONS=name:Pet2026072201,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:dog',
            moves: '.',
        });
        const before = preflightSnapshot();

        await preflightSimpleMonsterActions(game);

        assert.deepEqual(preflightSnapshot(), before);
    });

test('simple preflight retries a lost-sight pet goal scan without mutation',
    async () => {
        const target = await prepareStartingPetAction(PM_KITTEN);
        const { monster } = target;
        game.viz_array[monster.my][monster.mx] &= ~COULD_SEE;
        game.track = { utcnt: 0, utpnt: 0, utrack: [] };
        monster.mextra.edog.ogoal = { x: 0, y: 0 };
        const before = completeSecondTurnSnapshot(game, target.replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await preflightSimpleMonsterActions(game);
            assert.deepEqual(
                completeSecondTurnSnapshot(game, target.replay),
                before,
                `attempt ${attempt + 1}`,
            );
        }
    });

test('simple wake output completes before sleep state and action progress',
    async () => {
        const target = await prepareSelectedAction();
        target.monster.data = {
            ...target.monster.data,
            // Human-class monsters wake without the ordinary one-in-seven
            // draw, isolating the message boundary from later action RNG.
            mlet: S_HUMAN,
        };
        target.monster.msleeping = true;
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        const output = deferred();
        const beforeRng = rngSnapshot();
        let rendered;
        let settled = false;
        const pending = runSimpleMonsterAction(target.monster, {
            state: game,
            message: (text) => {
                rendered = text;
                return output.promise;
            },
        });
        pending.then(() => { settled = true; });

        await Promise.resolve();
        await Promise.resolve();
        assert.equal(rendered, 'The giant rat wakes up!');
        assert.equal(target.monster.msleeping, true);
        assert.deepEqual(
            [target.monster.mx, target.monster.my],
            [target.monsterX, target.heroY],
        );
        assert.deepEqual(rngSnapshot(), beforeRng);
        assert.equal(settled, false);

        output.resolve();
        await pending;
        assert.equal(target.monster.msleeping, false);
        assert.equal(settled, true);
    });

test('simple postmov plans notice state and awaits live notice before redraw',
    async () => {
        const target = await prepareSelectedAction();
        game.a11y.mon_notices = true;
        game.a11y.mon_notices_blocked = 0;
        game.viz_array[target.heroY][target.destinationX] |= IN_SIGHT;
        target.monster.mspotted = false;

        await preflightSimpleMonsterActions(game);
        assert.equal(
            target.monster.mspotted,
            false,
            'clone-only planning cannot change live notice state',
        );

        const output = deferred();
        const events = [];
        const pending = runSimpleMonsterAction(target.monster, {
            state: game,
            message: (text) => {
                events.push(`message:${text}`);
                return output.promise;
            },
            redraw: (x, y) => events.push(`redraw:${x},${y}`),
        });
        // Region admission and postmov each cross an async boundary before
        // the notice; eight microtasks leave headroom without using a timer.
        for (let turn = 0; turn < 8 && !events.length; ++turn)
            await Promise.resolve();

        assert.deepEqual(events, ['message:You see a giant rat.']);
        assert.equal(target.monster.mspotted, true);
        assert.deepEqual(
            [target.monster.mx, target.monster.my],
            [target.destinationX, target.heroY],
        );

        output.resolve();
        await pending;
        assert.deepEqual(events, [
            'message:You see a giant rat.',
            `redraw:${target.monsterX},${target.heroY}`,
            `redraw:${target.destinationX},${target.heroY}`,
        ]);
    });

test('simple movement output precedes track update and redraw', async () => {
    const target = await prepareSelectedAction();
    game.a11y.mon_movement = true;
    game.viz_array[target.heroY][target.destinationX] |= IN_SIGHT;
    target.monster.mspotted = true;

    const output = deferred();
    const events = [];
    const pending = runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => {
            events.push(`message:${text}`);
            assert.deepEqual(target.monster.mtrack[0], { x: 0, y: 0 });
            return output.promise;
        },
        redraw: (x, y) => events.push(`redraw:${x},${y}`),
    });
    for (let turn = 0; turn < 8 && !events.length; ++turn)
        await Promise.resolve();

    assert.deepEqual(events, ['message:The giant rat moves closer.']);
    assert.deepEqual(target.monster.mtrack[0], { x: 0, y: 0 });

    output.resolve();
    await pending;
    assert.deepEqual(target.monster.mtrack[0], {
        x: target.monsterX,
        y: target.heroY,
    });
    assert.deepEqual(events, [
        'message:The giant rat moves closer.',
        `redraw:${target.monsterX},${target.heroY}`,
        `redraw:${target.destinationX},${target.heroY}`,
    ]);
});

test('simple no-move notice completes before the adapter returns', async () => {
    const target = await prepareStartingPetAction(PM_LITTLE_DOG);
    // dogmove.c:dog_move() explicitly returns MMOVE_NOTHING when the pet and
    // hero share a square. That isolates the unchanged-coordinate postmov()
    // branch while retaining the complete runSimpleMonsterAction() adapter.
    game.level.monsters[target.monsterX][target.heroY] = null;
    target.monster.mx = game.u.ux;
    target.monster.my = game.u.uy;
    target.monster.mux = game.u.ux;
    target.monster.muy = game.u.uy;
    game.level.monsters[game.u.ux][game.u.uy] = target.monster;
    game.viz_array[game.u.uy][game.u.ux] |= IN_SIGHT;
    game.a11y.mon_notices = true;
    game.a11y.mon_notices_blocked = 0;
    target.monster.mspotted = false;

    const output = deferred();
    const events = [];
    let settled = false;
    const pending = runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => {
            events.push(`message:${text}`);
            return output.promise;
        },
        redraw: (x, y) => events.push(`redraw:${x},${y}`),
    });
    pending.then(() => { settled = true; });
    for (let turn = 0; turn < 8 && !events.length; ++turn)
        await Promise.resolve();

    assert.deepEqual(events, ['message:You see your little dog.']);
    assert.equal(target.monster.mspotted, true);
    assert.equal(settled, false);

    output.resolve();
    await pending;
    assert.deepEqual(events, ['message:You see your little dog.']);
    assert.equal(settled, true);
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
        const before = completeSecondTurnSnapshot(game, target.replay);

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
                completeSecondTurnSnapshot(game, target.replay),
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
                name: 'pre-move item use',
                reason: 'monster item use',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    target.monster.data = {
                        ...game.mons[PM_ORC_SHAMAN],
                        mattk: [],
                    };
                    target.monster.mnum = PM_ORC_SHAMAN;
                    target.monster.minvent = monsterObject(
                        POT_SPEED,
                    );
                    return target;
                },
            },
            {
                name: 'pre-move wield',
                reason: 'monster wield action',
                prepare: async () => {
                    const target = await prepareSelectedAction({
                        adjacentHero: true,
                        pmidx: PM_GNOME,
                    });
                    target.monster.minvent = monsterObject(DAGGER);
                    target.monster.weapon_check = NEED_WEAPON;
                    return target;
                },
            },
            {
                name: 'post-move ranged weapon',
                reason: 'monster ranged weapon action',
                prepare: async () => {
                    const target = await prepareSelectedAction({
                        pmidx: PM_GNOME,
                    });
                    const dagger = monsterObject(DAGGER);
                    dagger.owornmask = W_WEP;
                    target.monster.minvent = dagger;
                    target.monster.mw = dagger;
                    target.monster.weapon_check = NEED_WEAPON;
                    return target;
                },
            },
            {
                name: 'item search',
                reason: 'ordinary monster item interaction',
                prepare: async () => {
                    const target = await prepareSelectedAction({
                        pmidx: PM_ROCK_MOLE,
                    });
                    // A blind hostile sets approach=0, so m_move() enters
                    // m_search_items() regardless of line-of-fire geometry.
                    target.monster.mcansee = false;
                    game.viz_array[target.heroY][target.monsterX]
                        &= ~COULD_SEE;
                    installObject(
                        target,
                        floorObject(
                            target.destinationX,
                            target.heroY,
                            9101,
                            DAGGER,
                        ),
                    );
                    return target;
                },
            },
            {
                name: 'own-square item search',
                reason: 'ordinary monster item interaction',
                prepare: async () => {
                    const target = await prepareSelectedAction({
                        pmidx: PM_ROCK_MOLE,
                    });
                    // A blind hostile searches items, and finding this metal
                    // object on its own square completes m_search_items()
                    // before candidate movement.
                    target.monster.mcansee = false;
                    game.viz_array[target.heroY][target.monsterX]
                        &= ~COULD_SEE;
                    installObject(
                        target,
                        floorObject(
                            target.monsterX,
                            target.heroY,
                            9101,
                            DAGGER,
                        ),
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
            const before = completeSecondTurnSnapshot(game, target.replay);
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
                    completeSecondTurnSnapshot(game, target.replay),
                    before,
                    `${actionCase.name}, attempt ${attempt + 1}`,
                );
            }
        }
    });

test('simple preflight admits source-inert monster inventory', async () => {
    const target = await prepareSelectedAction();
    target.monster.data = {
        ...game.mons[PM_ORC_SHAMAN],
        mattk: [],
    };
    target.monster.mnum = PM_ORC_SHAMAN;
    target.monster.minvent = monsterObject(
        POT_HEALING,
    );
    const before = completeSecondTurnSnapshot(game, target.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await preflightSimpleMonsterActions(game);
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
            `inert inventory, attempt ${attempt + 1}`,
        );
    }
});

test('simple preflight admits inert AT_WEAP capability and inventory',
    async () => {
        const target = await prepareSelectedAction({ pmidx: PM_GNOME });
        target.monster.minvent = monsterObject(POT_HEALING);
        const before = completeSecondTurnSnapshot(game, target.replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await preflightSimpleMonsterActions(game);
            assert.deepEqual(
                completeSecondTurnSnapshot(game, target.replay),
                before,
                `inert AT_WEAP inventory, attempt ${attempt + 1}`,
            );
        }
    });

test('simple preflight ignores an unselected rock during item search',
    async () => {
        const target = await prepareSelectedAction({
            pmidx: PM_ROCK_MOLE,
        });
        target.monster.mcansee = false;
        game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
        installObject(
            target,
            floorObject(target.monsterX, target.heroY),
        );
        const before = completeSecondTurnSnapshot(game, target.replay);

        await preflightSimpleMonsterActions(game);

        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
        );
    });

test('simple monster movement continues through an ignored object',
    async () => {
        const target = await prepareSelectedAction();
        const rock = floorObject(target.destinationX, target.heroY);
        installObject(target, rock);
        const before = completeSecondTurnSnapshot(game, target.replay);

        await preflightSimpleMonsterActions(game);
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
        );

        const result = await runSimpleMonsterAction(target.monster, {
            state: game,
        });
        // dochug() converts a successful m_move() result to zero so the
        // caller may continue the monster's remaining action dispatch.
        assert.equal(result, MMOVE_NOTHING);
        assert.deepEqual(
            [target.monster.mx, target.monster.my],
            [target.destinationX, target.heroY],
        );
        assert.equal(
            game.level.objects[target.destinationX][target.heroY],
            rock,
        );
    });

test('simple ordinary monster and starting pet can land in a corridor',
    async () => {
        const cases = [
            {
                name: 'ordinary monster',
                prepare: () => prepareSelectedAction(),
            },
            {
                name: 'starting pet',
                prepare: () => prepareStartingPetAction(PM_LITTLE_DOG),
            },
        ];

        for (const movementCase of cases) {
            const target = await movementCase.prepare();
            game.level.at(target.destinationX, target.heroY).typ = CORR;
            const before = completeSecondTurnSnapshot(game, target.replay);

            await preflightSimpleMonsterActions(game);
            assert.deepEqual(
                completeSecondTurnSnapshot(game, target.replay),
                before,
                movementCase.name,
            );

            const result = await runSimpleMonsterAction(target.monster, {
                state: game,
            });
            assert.equal(result, MMOVE_NOTHING, movementCase.name);
            assert.deepEqual(
                [target.monster.mx, target.monster.my],
                [target.destinationX, target.heroY],
                movementCase.name,
            );
            assert.equal(
                game.level.at(target.destinationX, target.heroY).typ,
                CORR,
                movementCase.name,
            );
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
            moves: '.',
        });
        const before = preflightSnapshot();

        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'trap activation',
        );

        assert.deepEqual(preflightSnapshot(), before);
    });

test('simple preflight stops before unowned pet target scoring', async () => {
    const replay = await runSegment({
        // This fresh-derived Knight layout lines the pony up with a distant
        // monster after one clear diagonal walk.
        seed: 2026072220,
        datetime: DATETIME,
        nethackrc: 'OPTIONS=name:PonyWalkWait,role:Knight,race:human,'
            + 'gender:male,align:lawful,!legacy,!tutorial,!splash_screen',
        moves: ' u.',
    });
    assert.equal(game.context.startingpet_typ, PM_PONY);
    assert.equal(game.moves, 2);
    const before = completeSecondTurnSnapshot(game, replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'pet ranged targeting',
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, replay),
            before,
        );
    }
});

test('simple preflight keeps starting-pet owner seams retryable',
    async () => {
        const cases = [
            {
                name: 'dog combat evaluation',
                reason: 'pet combat evaluation',
                prepare: async () => {
                    const target = await prepareStartingPetAction(
                        PM_LITTLE_DOG,
                    );
                    installPetDefender(target);
                    return target;
                },
            },
            {
                // mon_allowflags() gives tame pets ALLOW_M, so an occupied
                // square reaches combat evaluation before mfndpos() can
                // classify it as ALLOW_MDISP. Keep that source precedence
                // explicit instead of fabricating an unreachable pet
                // displacement callback.
                name: 'pony occupied-square displacement precedence',
                reason: 'pet combat evaluation',
                prepare: async () => {
                    const target = await prepareStartingPetAction(PM_PONY);
                    installPetDefender(target);
                    return target;
                },
            },
            {
                name: 'kitten eating',
                reason: 'pet eating',
                prepare: async () => {
                    const target = await prepareStartingPetAction(PM_KITTEN);
                    installObject(
                        target,
                        floorObject(
                            target.monsterX,
                            target.heroY,
                            9101,
                            TRIPE_RATION,
                        ),
                    );
                    return target;
                },
            },
            {
                name: 'kitten moving onto adjacent food',
                reason: 'pet eating',
                prepare: async () => {
                    const target = await prepareStartingPetAction(PM_KITTEN);
                    installObject(
                        target,
                        floorObject(
                            target.destinationX,
                            target.heroY,
                            9101,
                            TRIPE_RATION,
                        ),
                    );
                    return target;
                },
            },
            {
                name: 'dog cursed-object feedback',
                reason: 'pet cursed-object feedback',
                prepare: async () => {
                    const target = await prepareStartingPetAction(
                        PM_LITTLE_DOG,
                    );
                    const object = floorObject(
                        target.destinationX,
                        target.heroY,
                        9101,
                        ROCK,
                    );
                    object.cursed = true;
                    installObject(target, object);
                    game.viz_array[target.heroY][target.monsterX]
                        |= IN_SIGHT;
                    game.viz_array[target.heroY][target.destinationX]
                        |= IN_SIGHT;
                    return target;
                },
            },
            {
                name: 'kitten non-inert inventory',
                reason: 'pet inventory',
                prepare: async () => {
                    const target = await prepareStartingPetAction(PM_KITTEN);
                    target.monster.minvent = floorObject(
                        0,
                        0,
                        9101,
                        DAGGER,
                    );
                    target.monster.minvent.where = OBJ_MINVENT;
                    return target;
                },
            },
        ];

        for (const actionCase of cases) {
            const target = await actionCase.prepare();
            const before = completeSecondTurnSnapshot(game, target.replay);
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
                    completeSecondTurnSnapshot(game, target.replay),
                    before,
                    `${actionCase.name}, attempt ${attempt + 1}`,
                );
            }
        }
    });

test('a planned pet pickup leaves the live object graph untouched',
    async () => {
        // The planning scan runs dog_invent()'s carry arm for real, and it
        // splits stacks, unlinks floor objects and rewrites monster
        // inventories. Every one of those has to land on the clone.
        const target = await prepareStartingPetAction(PM_PONY);
        target.monster.mextra.edog.apport = 20;
        const dagger = floorObject(
            target.monsterX,
            target.heroY,
            9101,
            DAGGER,
        );
        installObject(target, dagger);
        // A second pile ahead of the dagger in the level list: removing the
        // dagger has to find its predecessor among the cloned objects.
        const rock = floorObject(target.destinationX, target.heroY, 9102);
        game.level.objects[rock.ox][rock.oy] = rock;
        rock.nobj = dagger;
        game.level.objlist = rock;
        // A lit square, so the carry arm names the dagger and prints.
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        // Naming the dagger runs xname() -> observe_object() ->
        // discover_object(), which writes objects[otyp].oc_encountered and
        // svd.disco[], and find_artifact() writes artiexist[].found.
        // completeSecondTurnSnapshot() covers none of those three, so the
        // planning pass leaked into the live ledger without any oracle
        // noticing. Reset the type first, or an already-encountered dagger
        // makes the write a no-op and the assertion vacuous.
        // distant_name() only reaches doname() -> xname() -> observe_object()
        // on its near branch; objnam.c:355 computes neardist from
        // u.xray_range, so without this the far branch formats a bare type
        // name, writes no discovery, and the assertion below is vacuous.
        game.u.xray_range = 3;
        game.objects[DAGGER].oc_encountered = 0;
        const discoveryBefore = JSON.stringify({
            encountered: game.objects.map((entry) => entry.oc_encountered ?? 0),
            disco: game.svd?.disco ?? [],
            artifacts: (game.artiexist ?? []).map((entry) => entry.found ?? 0),
        });
        // The artifact third of that oracle is vacuous against a plain dagger:
        // find_artifact() never runs, so planningState()'s artiexist clone can
        // be deleted with this test green. Seed one entry so a shared clone
        // would be observable if the naming path ever reached it.
        if (game.artiexist?.length) game.artiexist[0].found = 0;
        const before = completeSecondTurnSnapshot(game, target.replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await preflightSimpleMonsterActions(game);
            assert.equal(
                JSON.stringify({
                    encountered: game.objects
                        .map((entry) => entry.oc_encountered ?? 0),
                    disco: game.svd?.disco ?? [],
                    artifacts: (game.artiexist ?? [])
                        .map((entry) => entry.found ?? 0),
                }),
                discoveryBefore,
                `discovery ledger, attempt ${attempt + 1}`,
            );
            assert.deepEqual(
                completeSecondTurnSnapshot(game, target.replay),
                before,
                `attempt ${attempt + 1}`,
            );
            assert.equal(
                game.level.objects[target.monsterX][target.heroY],
                dagger,
                `attempt ${attempt + 1}`,
            );
            assert.equal(dagger.where, OBJ_FLOOR);
            assert.equal(target.monster.minvent, null);
        }
    });

test('a planned monster pickup leaves a live carried stack untouched',
    async () => {
        // mpickstuff() hands the floor stack to mpickobj() -> add_to_minv(),
        // whose merge loop adds the quantity to a matching stack the monster
        // already carries and frees the floor object. That write lands on an
        // object the level list never reaches, so the planning clone has to
        // root itself at every monster's minvent as well as at objlist.
        // A gnome is M2_COLLECT but not M2_GREEDY, so food is a class it
        // takes and gold is not.
        const target = await prepareSelectedAction({ pmidx: PM_GNOME });
        // Both stacks go through newObject(), because mergable() compares
        // every flag it finds and the clone is built with newObject()'s
        // defaults: a sparse literal would differ from its own copy and the
        // merge this test is about would never happen.
        const carried = newObject({
            ...monsterObject(FOOD_RATION, 9201),
            quan: 6, // Any stack the floor pile can merge into.
        });
        carried.ocarry = target.monster;
        target.monster.minvent = carried;
        const pile = newObject({
            ...floorObject(
                target.destinationX,
                target.heroY,
                9101,
                FOOD_RATION,
            ),
            // Distinct from the carried quantity, so a merge shows.
            quan: 4,
        });
        installObject(target, pile);
        const before = completeSecondTurnSnapshot(game, target.replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await preflightSimpleMonsterActions(game);
            assert.deepEqual(
                completeSecondTurnSnapshot(game, target.replay),
                before,
                `attempt ${attempt + 1}`,
            );
            assert.equal(target.monster.minvent, carried);
            assert.equal(carried.quan, 6, `attempt ${attempt + 1}`);
            assert.equal(carried.ocarry, target.monster);
            assert.equal(
                game.level.objects[target.destinationX][target.heroY],
                pile,
            );
            assert.equal(pile.quan, 4, `attempt ${attempt + 1}`);
            assert.equal(pile.where, OBJ_FLOOR);
        }

        // Everything the plan rehearsed then happens for real, which is what
        // keeps the assertions above from passing on a monster that never
        // reached mpickstuff() at all.
        target.monster.weapon_check = NEED_HTH_WEAPON;
        await runSimpleMonsterAction(target.monster, {
            state: game,
            message: async () => {},
            redraw: () => {},
        });
        assert.equal(target.monster.minvent, carried);
        assert.equal(carried.quan, 10);
        assert.equal(
            game.level.objects[target.destinationX][target.heroY],
            null,
        );
        assert.equal(game.level.objlist, null);
        // C ref: monmove.c:1680 turns a successful pickup into MMOVE_DONE, and
        // dochug() reaches its post-move ranged attack only on MMOVE_MOVED.
        // That arm would reset an empty-handed gnome to NEED_WEAPON.
        assert.equal(target.monster.weapon_check, NEED_HTH_WEAPON);
    });

test('a flagged monster is scanned and only a real change stops it',
    async () => {
        // C ref: mon.c movemon_singlemon():1268-1281. check_gear_next_turn()
        // sets I_SPECIAL after every pickup, so the bit alone cannot be a
        // boundary: C reruns m_dowear() and, when nothing is worth putting on,
        // carries straight into the monster's ordinary move.
        for (const wearable of [false, true]) {
            const target = await prepareSelectedAction({ pmidx: PM_GNOME });
            target.monster.misc_worn_check |= I_SPECIAL;
            // The arm is entered only for a peaceful or tame monster or one
            // that believes the hero is more than three squares away; the
            // fixture places the remembered hero exactly at 3.
            target.monster.mux = target.monster.mx + 4;
            target.monster.muy = target.monster.my;
            if (wearable) {
                // newObject() again: ocarry shares obj.v with nexthere, and a
                // plain literal would keep them as two unrelated fields.
                const helm = newObject(monsterObject(ORCISH_HELM, 9201));
                helm.ocarry = target.monster;
                target.monster.minvent = helm;
            }
            const before = completeSecondTurnSnapshot(game, target.replay);

            for (let attempt = 0; attempt < 2; ++attempt) {
                if (wearable) {
                    await assert.rejects(
                        preflightSimpleMonsterActions(game),
                        (error) => (
                            error instanceof UnsupportedSimpleMonsterActionError
                            && error.reason === 'monster equipment changes'
                        ),
                        `wearable, attempt ${attempt + 1}`,
                    );
                } else {
                    await preflightSimpleMonsterActions(game);
                }
                assert.deepEqual(
                    completeSecondTurnSnapshot(game, target.replay),
                    before,
                    `wearable=${wearable}, attempt ${attempt + 1}`,
                );
            }
        }
    });

test('the planning clone gives each monster its own pack and weapon',
    async () => {
        // Cloning inventories is only half the job: a monster also points at
        // its wielded object through MON_WEP(), and every carried object
        // points back at its carrier through ocarry. Both live in obj.v's
        // union, so both have to be remapped or the clone would name live
        // objects from cloned monsters and vice versa.
        const target = await prepareSelectedAction({ pmidx: PM_GNOME });
        const dagger = newObject({
            ...monsterObject(DAGGER, 9201),
            owornmask: W_WEP,
        });
        dagger.ocarry = target.monster;
        target.monster.minvent = dagger;
        target.monster.mw = dagger;
        // Below its ration, so the scan returns before acting and the round
        // reaches the upkeep hook that hands the cloned state back.
        target.monster.movement = 0;
        game.u.umovement = 0;
        let planned = null;

        await preflightSimpleMonsterActions(game, {
            advanceRound(state) {
                planned = state;
                return true;
            },
        });

        const clone = planned.level.monlist;
        assert.notEqual(clone, target.monster);
        assert.notEqual(clone.minvent, dagger);
        assert.equal(clone.minvent.o_id, dagger.o_id);
        assert.equal(clone.mw, clone.minvent);
        assert.equal(clone.minvent.ocarry, clone);
        // The live monster keeps its own pointers into live objects.
        assert.equal(target.monster.minvent, dagger);
        assert.equal(target.monster.mw, dagger);
        assert.equal(dagger.ocarry, target.monster);
    });

test('an in-range monster with a ranged attack stops the scan', async () => {
    // C ref: monmove.c:965-975 with mhitu.c mattacku(). A monster that only
    // believes it is near the hero still reaches mattacku(), where the range2
    // arms are AT_BREA's breamu(), AT_SPIT's spitmu() and AT_GAZE's gazemu().
    // None is ported, and dochug()'s gate used to admit an adjacent attacker
    // only, so these three passed through in silence.
    for (const [name, aatyp] of [
        ['breath', AT_BREA],
        ['spit', AT_SPIT],
        ['gaze', AT_GAZE],
    ]) {
        const target = await prepareSelectedAction();
        // The fixture leaves exactly one legal step. Closing it makes
        // mfndpos() find no candidate, so m_move() returns MMOVE_NOMOVES and
        // dochug() reaches its standard-attack gate with the monster still
        // three squares from the hero: in range, and not adjacent.
        const step = game.level.at(target.destinationX, target.heroY);
        step.typ = STONE;
        step.flags = step.doormask = 0;
        target.monster.data = {
            ...target.monster.data,
            mattk: [{ aatyp, adtyp: 0, damn: 1, damd: 2 }],
        };
        const before = completeSecondTurnSnapshot(game, target.replay);

        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'monster ranged attack on the hero'
            ),
            name,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
            name,
        );
    }
});

test('the planning clone keeps the object catalog answering its aliases',
    async () => {
        // objects[] entries carry eight aliases that share a backing field and
        // are defined non-enumerable, so a spread copy answers undefined for
        // every one. m_dowear() reads oc_armcat and a_ac from the planning
        // state and select_hwep() reads oc_skill and oc_bimanual, so a
        // stripped copy sends the dry run down a different branch from the
        // live pass it is meant to rehearse.
        const target = await prepareSelectedAction();
        target.monster.movement = 0;
        game.u.umovement = 0;
        let planned = null;

        await preflightSimpleMonsterActions(game, {
            advanceRound(state) {
                planned = state;
                return true;
            },
        });

        assert.notEqual(planned.objects, game.objects);
        const aliases = [
            'oc_armcat', 'a_ac', 'oc_bimanual', 'oc_skill',
            'oc_bulky', 'oc_hitbon', 'a_can', 'oc_level',
        ];
        for (const alias of aliases) {
            assert.equal(
                planned.objects[ORCISH_HELM][alias],
                game.objects[ORCISH_HELM][alias],
                alias,
            );
            assert.notEqual(
                planned.objects[ORCISH_HELM][alias],
                undefined,
                alias,
            );
        }
        // Still a copy: the discovery ledger the clone writes stays there.
        planned.objects[ORCISH_HELM].oc_encountered = 1;
        assert.equal(game.objects[ORCISH_HELM].oc_encountered, 0);
    });

test('planning brackets only the monster scan with context.mon_moving',
    async () => {
        const target = await prepareSelectedAction();
        // Below its ration, so the scan reaches m_everyturn_effect() and
        // returns without acting, leaving the round free to reach upkeep.
        target.monster.movement = 0;
        game.u.umovement = 0;
        let rounds = 0;

        await preflightSimpleMonsterActions(game, {
            advanceRound(planned) {
                ++rounds;
                // allmain.c clears context.mon_moving after the monster loop
                // and before the once-per-turn block, and the live loop does
                // the same in its finally. The plan must agree, or a planned
                // round would take mon_moving-gated branches the live round
                // does not.
                assert.equal(planned.context.mon_moving, false);
                return true;
            },
        });
        assert.equal(rounds, 1);
        // The live state owns its own flag and must be untouched.
        assert.notEqual(game.context.mon_moving, true);
    });

test('planning rescans while a monster outruns the hero', async () => {
    const target = await prepareSelectedAction();
    // Two rations for the monster, none for the hero: mon.c sets
    // somebody_can_move on the first scan because movement is still at least
    // NORMAL_SPEED after the debit, so the inner loop must run a second scan
    // before any once-per-turn upkeep is considered.
    target.monster.movement = NORMAL_SPEED * 2;
    game.u.umovement = 0;
    let rounds = 0;

    await preflightSimpleMonsterActions(game, {
        advanceRound(planned) {
            ++rounds;
            // Both rations are spent by the time upkeep is reached.
            assert.ok(planned.level.monlist.movement < NORMAL_SPEED);
            return true;
        },
    });
    assert.equal(rounds, 1);
    // The live monster keeps both rations: the scan ran only on the clone.
    assert.equal(target.monster.movement, NORMAL_SPEED * 2);
});

test('planning refuses an active conflict before the scan begins',
    async () => {
        const target = await prepareSelectedAction();
        // This pins where conflict is refused, not which visibility owner the
        // conflict arm would use: assertSimpleScanState() rejects an active
        // CONFLICT before movemon_singlemon() is entered, so that arm and its
        // canSeeSquare injection are unreachable from the planning pass.
        game.level.regions = [];
        // assertSimpleScanState refuses conflict before movemon_singlemon is
        // reached, so the plan stops without touching live state or the PRNG.
        game.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0 };
        const before = completeSecondTurnSnapshot(game, target.replay);
        const beforeRandom = rngSnapshot();
        try {
            for (let attempt = 0; attempt < 2; ++attempt) {
                await assert.rejects(
                    preflightSimpleMonsterActions(game),
                    (error) => (
                        error instanceof UnsupportedSimpleMonsterActionError
                        && error.reason === 'conflict combat'
                    ),
                    `attempt ${attempt}`,
                );
                assert.deepEqual(
                    completeSecondTurnSnapshot(game, target.replay),
                    before,
                    `attempt ${attempt}`,
                );
                assert.deepEqual(rngSnapshot(), beforeRandom);
            }
        } finally {
            game.u.uprops[CONFLICT] = { intrinsic: 0, extrinsic: 0 };
        }
    });

// Audit rows 5, 13, and 14: planningState() clones the timer queue head and
// the timer_id counter so a monster generated during a dry run cannot leave an
// orphan timer behind, but the isolation test above never reaches
// finishElapsedTurn, so nothing exercised that clone. A planning round that
// starts a timer must leave the live queue and counter untouched, on every
// retry.
test('planning rounds cannot reach the live timer queue', async () => {
    const target = await prepareSelectedAction();
    target.monster.movement = 0;
    game.u.umovement = 0;
    game.level.regions = [];

    const liveTimerBase = game.gt.timer_base;
    const liveTimerId = game.svt.timer_id;
    const beforeRandom = rngSnapshot();
    const before = completeSecondTurnSnapshot(game, target.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game, {
                advanceRound(planned) {
                    // What makemon() -> m_initinv() -> begin_burn() does for a
                    // gnome carrying a lit candle, without needing that draw.
                    start_timer(
                        50,
                        TIMER_OBJECT,
                        BURN_OBJECT,
                        { age: 200 },
                        planned,
                    );
                    assert.notStrictEqual(
                        planned.gt.timer_base,
                        liveTimerBase,
                    );
                    assert.equal(planned.svt.timer_id, liveTimerId + 1);
                    throw new UnsupportedSimpleMonsterActionError(
                        'after a planned timer',
                    );
                },
            }),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'after a planned timer'
            ),
            `attempt ${attempt}`,
        );
        assert.strictEqual(
            game.gt.timer_base,
            liveTimerBase,
            `attempt ${attempt}`,
        );
        assert.equal(game.svt.timer_id, liveTimerId, `attempt ${attempt}`);
        assert.deepEqual(rngSnapshot(), beforeRandom, `attempt ${attempt}`);
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
            `attempt ${attempt}`,
        );
    }
});

// planningState() remaps both list heads through the monster map and the
// object map. Only the monster half was covered: a light source or a burn
// timer keyed on a live floor object kept pointing at that object inside the
// clone, so a planned round would read and write live state through it.
test('the planning clone remaps a light source and a timer onto the copy',
    async () => {
        const target = await prepareSelectedAction();
        target.monster.movement = 0;
        game.u.umovement = 0;
        game.level.regions = [];

        // light.c keys an object light source on the object itself, and
        // timeout.c's BURN_OBJECT timer holds the same object as its argument,
        // so one lit candle on the floor exercises both maps at once.
        const candle = floorObject(
            target.monsterX,
            target.heroY,
            9403, // A live object id distinct from every other fixture's.
            WAX_CANDLE,
        );
        candle.lamplit = true;
        installObject(target, candle);
        // Range 1 is the smallest new_light_source() accepts for an object.
        new_light_source(candle.ox, candle.oy, 1, LS_OBJECT, candle, game);
        // 50 turns is the same arbitrary timeout the queue-isolation test
        // above uses; nothing here reads it.
        start_timer(50, TIMER_OBJECT, BURN_OBJECT, candle, game);

        await assert.rejects(
            preflightSimpleMonsterActions(game, {
                advanceRound(planned) {
                    const copy = planned.level.objects[candle.ox][candle.oy];
                    assert.notStrictEqual(copy, candle);
                    assert.strictEqual(planned.gl.light_base.id, copy);
                    assert.strictEqual(planned.gt.timer_base.arg, copy);
                    throw new UnsupportedSimpleMonsterActionError(
                        'after the clone check',
                    );
                },
            }),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'after the clone check'
            ),
        );
    });

// The pickup arm calls distant_name(), splitobj() and mpickobj() from inside
// the monster scan, so refusal classes that never used to reach the elapsed
// turn now can. This pins the first half of that: the class the naming path
// actually raises. The second half -- that js/allmain.js converts it into a
// turn boundary rather than letting js/jsmain.js rethrow it and discard the
// segment -- is not pinned here, because advanceElapsedTurn() is not exported
// and driving moveloop_core() from this fixture does not reach the arm.
// ROADMAP.md records that gap.
test('a planned pickup raises the naming class the turn must convert',
    async () => {
        const target = await prepareStartingPetAction(PM_PONY);
        target.monster.mextra.edog.apport = 20;
        const dagger = floorObject(
            target.monsterX,
            target.heroY,
            9301,
            DAGGER,
        );
        installObject(target, dagger);
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        // distant_name()'s near branch is the one that formats through
        // doname(); the far branch never reaches preflightObjectName().
        game.u.xray_range = 3;
        // objnam.c's shop price suffix is unported. Any guarded branch of
        // preflightObjectName() would serve; this is the cheapest to set.
        dagger.unpaid = true;

        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => error instanceof UnsupportedObjectNameError,
        );
    });
