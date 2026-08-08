import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    ARROW_TRAP,
    BLINDED,
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
    DART_TRAP,
    GRAVE,
    HEADSTONE,
    ICE,
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
    SINK,
    STAIRS,
    STONE,
    THRONE,
    TIMER_OBJECT,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    W_WEP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { new_light_source } from '../js/light.js';
import { runSegment } from '../js/jsmain.js';
import {
    AT_BREA,
    AT_GAZE,
    AT_SPIT,
    AT_WEAP,
    PM_CAVE_SPIDER,
    PM_DISPLACER_BEAST,
    PM_FOG_CLOUD,
    PM_GIANT_RAT,
    PM_GNOME,
    PM_GREMLIN,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_ORC_SHAMAN,
    PM_PONY,
    PM_PURPLE_WORM,
    PM_ROCK_MOLE,
    PM_RUST_MONSTER,
    PM_SHRIEKER,
    S_HUMAN,
} from '../js/monsters.js';
import {
    preflightSimpleMonsterActions,
    runSimpleMonsterAction,
    unportedMinliquidReason,
    UnsupportedSimpleMonsterActionError,
} from '../js/unported_monster_actions.js';
import { newMonster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { ART_STING } from '../js/artifacts.js';
import {
    DAGGER,
    ELVEN_DAGGER,
    FOOD_RATION,
    ORCISH_HELM,
    POT_HEALING,
    POT_SPEED,
    ROCK,
    TRIPE_RATION,
    WAX_CANDLE,
} from '../js/objects.js';
import { create_region } from '../js/region.js';
import {
    clear_path,
    recalc_block_point,
    vision_recalc,
} from '../js/vision.js';
import { start_timer } from '../js/timeout.js';
import { completeSecondTurnSnapshot } from './second-turn-snapshot.mjs';
import { freezeLiveState } from './planning-isolation-test-support.mjs';
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
    // decl.c's go.occupation, which monmove.c dochugw() reads for every
    // monster the scan moves. Cleared so the scan below is the idle-hero
    // case; the line used to name a bare game.occupation that nothing
    // assigns.
    (game.go ??= {}).occupation = null;
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

// C ref: mon.c minliquid_core():987. The split reads `infountain` beside
// `inpool`, and only for `mons[PM_GREMLIN]`: a gremlin standing on a fountain
// draws rn2(3) there that no other species draws. The scan cannot answer that
// draw, so it stops on the square; every other species crosses the same
// fountain as ordinary terrain.
test('simple preflight stops a gremlin standing on a fountain', async () => {
    const gremlin = await prepareSelectedAction({ pmidx: PM_GREMLIN });
    game.level.at(gremlin.monsterX, gremlin.heroY).typ = FOUNTAIN;
    const before = completeSecondTurnSnapshot(game, gremlin.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'a gremlin splitting in a fountain'
            ),
            `attempt ${attempt + 1}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, gremlin.replay),
            before,
            `attempt ${attempt + 1}`,
        );
    }

    // PM_GIANT_RAT is prepareSelectedAction()'s default species; it reads the
    // square through `inpool` and `inlava` alone, so the identical fountain
    // leaves the scan running.
    const rat = await prepareSelectedAction();
    game.level.at(rat.monsterX, rat.heroY).typ = FOUNTAIN;
    const ratBefore = preflightSnapshot();
    await preflightSimpleMonsterActions(game);
    assert.deepEqual(preflightSnapshot(), ratBefore);
});

// unportedMinliquidReason() also answers js/allmain.js elapsedTurnMinLiquid().
// Its water and lava arm has no case in this file: assertSimpleScanState()
// refuses both squares, with a different reason, before the scan reaches
// minLiquid, and the live turn runs only on a monster that scan admitted.
// mcalcdistress() does reach the arm, for an immobile monster that ended up in
// liquid, but through js/allmain.js rather than through this module. A direct
// call is what covers the arm either way.
test('minliquid refusal reads the square before the species', async () => {
    const LIQUID = 'an immobile monster in liquid';
    const GREMLIN_SPLIT = 'a gremlin splitting in a fountain';
    const cases = [
        // mon.c:1068 drowns a monster in a pool; nothing here ports it.
        { terrain: POOL, pmidx: PM_GIANT_RAT, reason: LIQUID },
        // mon.c:1010 burns a monster in lava; nothing here ports it either.
        { terrain: LAVAPOOL, pmidx: PM_GIANT_RAT, reason: LIQUID },
        // mon.c:987's `(inpool || infountain)` claims a gremlin on both, and
        // the arm above claims the pool first. Either way the caller refuses.
        { terrain: POOL, pmidx: PM_GREMLIN, reason: LIQUID },
        { terrain: FOUNTAIN, pmidx: PM_GREMLIN, reason: GREMLIN_SPLIT },
        // `infountain` reaches no other species, and no arm reads a gremlin's
        // dry floor, so both of these are squares C walks straight past.
        { terrain: FOUNTAIN, pmidx: PM_GIANT_RAT, reason: null },
        { terrain: ROOM, pmidx: PM_GREMLIN, reason: null },
    ];

    const target = await prepareSelectedAction();
    const square = game.level.at(target.monsterX, target.heroY);
    for (const minliquidCase of cases) {
        square.typ = minliquidCase.terrain;
        target.monster.data = game.mons[minliquidCase.pmidx];
        assert.equal(
            unportedMinliquidReason(target.monster, game),
            minliquidCase.reason,
            `terrain ${minliquidCase.terrain}, species `
                + `${minliquidCase.pmidx}`,
        );
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
// mon.c mfndpos() and teleport.c goodpos() admit any ACCESSIBLE(typ) square
// with no furniture branch, and monmove.c postmov() has none either, so all
// seven of rm.h:138's types are ordinary destinations for a monster. ICE,
// rm.h:88's next type after ALTAR, is the case just outside the range.
test('simple movement admits every furniture square but not ice', async () => {
    for (const [label, terrain] of [
        ['stairs', STAIRS],
        ['ladder', LADDER],
        ['fountain', FOUNTAIN],
        ['throne', THRONE],
        ['sink', SINK],
        ['grave', GRAVE],
        ['altar', ALTAR],
    ]) {
        const admitted = await prepareSelectedAction();
        const location = game.level.at(
            admitted.destinationX,
            admitted.heroY,
        );
        location.typ = terrain;
        const before = preflightSnapshot();

        await preflightSimpleMonsterActions(game);
        assert.deepEqual(preflightSnapshot(), before, label);
        await runSimpleMonsterAction(admitted.monster, { state: game });
        assert.deepEqual(
            [admitted.monster.mx, admitted.monster.my],
            [admitted.destinationX, admitted.heroY],
            label,
        );
    }

    const ice = await prepareSelectedAction();
    game.level.at(ice.destinationX, ice.heroY).typ = ICE;
    const iceBefore = completeSecondTurnSnapshot(game, ice.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'door or special terrain movement'
            ),
            `ice attempt ${attempt + 1}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, ice.replay),
            iceBefore,
            `ice attempt ${attempt + 1}`,
        );
    }
});

// C ref: monmove.c postmov()'s door block (1520-1622). A monster that ends its
// move on a doorless, broken or open doorway reaches no arm of that block, so
// the move completes with the doormask, the map and the message window
// untouched. Of the masks that do reach an arm, only D_CLOSED under can_open
// is ported; the test below this one owns that one.
test('simple movement admits an inert doorway and no other mask', async () => {
    for (const representation of ['flags', 'doormask']) {
        for (const mask of [D_NODOOR, D_BROKEN, D_ISOPEN]) {
            const doorway = await prepareSelectedAction();
            const location = game.level.at(
                doorway.destinationX,
                doorway.heroY,
            );
            location.typ = DOOR;
            location.flags = 0;
            location.doormask = 0;
            location[representation] = mask;
            const label = `${representation} mask ${mask}`;
            const before = preflightSnapshot();

            await preflightSimpleMonsterActions(game);
            assert.deepEqual(preflightSnapshot(), before, label);
            await runSimpleMonsterAction(doorway.monster, { state: game });
            assert.deepEqual(
                [doorway.monster.mx, doorway.monster.my],
                [doorway.destinationX, doorway.heroY],
                label,
            );
            assert.equal(location.typ, DOOR, label);
            assert.equal(location[representation], mask, label);
        }

        for (const mask of [
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

// Install a closed door on the square the selected monster will step onto and
// bring js/vision.js's transparency index into step with it, as every other
// writer of a doormask does.
async function prepareClosedDoorArrival() {
    const target = await prepareSelectedAction({ pmidx: PM_GNOME });
    const location = game.level.at(target.destinationX, target.heroY);
    location.typ = DOOR;
    location.flags = D_CLOSED;
    location.doormask = D_CLOSED;
    recalc_block_point(target.destinationX, target.heroY, game);
    return { ...target, location };
}

// clear_path() skips both endpoints, so straddling the door reports whether
// the transparency index still calls that one square opaque.
function doorLetsLightThrough(target) {
    return clear_path(
        target.destinationX - 1,
        target.heroY,
        target.destinationX + 1,
        target.heroY,
    );
}

// A live-vision snapshot the cloned scan must not disturb. viz_array is a
// buffer the scan could swap as well as overwrite, so this pins the object as
// well as its contents, and seenv is the per-square memory vision_recalc()
// accumulates.
function visionSnapshot() {
    return {
        buffer: game.viz_array,
        active: game.active_buf,
        rows: game.viz_array.map((row) => [...row]),
        seenv: game.level.locations.map(
            (column) => column.map((cell) => [cell.seenv ?? 0, cell.waslit ?? 0]),
        ),
        cell: game.level.at(8, 10),
    };
}

// C ref: monmove.c postmov():1576-1592 through UnblockDoor at 1526-1536. The
// gnome has hands, so mon_allowflags() gives it OPENDOOR and mfndpos() offers
// it the closed square. The hero stands three squares away with a clear line,
// so this is the arm that names the monster.
test('simple movement opens a closed door and names the opener', async () => {
    const target = await prepareClosedDoorArrival();
    assert.equal(doorLetsLightThrough(target), 0);
    const before = preflightSnapshot();
    const vision = visionSnapshot();

    // The cloned scan opens the door on its own terrain grid and its own
    // COULD_SEE buffers, and returns the shared transparency index it borrowed.
    await preflightSimpleMonsterActions(game);
    assert.deepEqual(preflightSnapshot(), before);
    assert.deepEqual(visionSnapshot(), vision);
    assert.equal(target.location.flags, D_CLOSED);
    assert.equal(doorLetsLightThrough(target), 0);

    const messages = [];
    await runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => { messages.push(text); },
    });
    assert.deepEqual(
        [target.monster.mx, target.monster.my],
        [target.destinationX, target.heroY],
    );
    assert.equal(target.location.flags, D_ISOPEN);
    assert.equal(target.location.doormask, D_ISOPEN);
    assert.equal(doorLetsLightThrough(target), 1);
    assert.deepEqual(messages, ['The gnome opens a door.']);
});

// The same opening with the hero blind. vision_recalc()'s Blind branch grants
// no IN_SIGHT square, so canseeit stays false and the door is heard instead.
test('simple movement reports a door a blind hero only hears', async () => {
    const target = await prepareClosedDoorArrival();
    game.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    const vision = visionSnapshot();

    await preflightSimpleMonsterActions(game);
    assert.deepEqual(visionSnapshot(), vision);

    const messages = [];
    await runSimpleMonsterAction(target.monster, {
        state: game,
        message: (text) => { messages.push(text); },
    });
    assert.equal(target.location.flags, D_ISOPEN);
    assert.deepEqual(messages, ['You hear a door open.']);
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
                // ICE, the first type past IS_FURNITURE()'s range, stands for
                // terrain the destination check still refuses.
                name: 'special terrain',
                reason: 'door or special terrain movement',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    game.level.at(
                        target.destinationX,
                        target.heroY,
                    ).typ = ICE;
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
                    // A rust monster is metallivorous without tunneling: a
                    // tunneler's move reaches mdig_tunnel() first, which the
                    // port refuses before this arm.
                    const target = await prepareSelectedAction({
                        pmidx: PM_RUST_MONSTER,
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
                    // A blind hostile searches items, and finding this metal
                    // object on its own square completes m_search_items()
                    // before candidate movement. The monster never moves, so
                    // MMOVE_DONE skips postmov()'s dig arm and this rock
                    // mole's tunneling stays out of the way.
                    const target = await prepareSelectedAction({
                        pmidx: PM_ROCK_MOLE,
                    });
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
                // An arrow trap, because trapeffect_selector() dispatches PIT
                // to a ported arm now and only the types still listed in
                // UNPORTED_TRAP_EFFECTS reach this reason.
                name: 'trap activation',
                reason: 'trap activation',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    game.level.traps.push({
                        tx: target.destinationX,
                        ty: target.heroY,
                        ttyp: ARROW_TRAP,
                        tseen: false,
                    });
                    return target;
                },
            },
            {
                // trap.c:3827-3835. The pit is ported, so the refusal moves to
                // mintrap()'s tail, which maybe_unhide_at() owns. Twenty hit
                // points put the rat out of reach of trapeffect_pit()'s
                // rnd(6), so the victim always survives to reach it.
                name: 'a pit that spares its victim',
                reason: 'a monster trapped under an object',
                prepare: async () => {
                    const target = await prepareSelectedAction();
                    target.monster.mhp = target.monster.mhpmax = 20;
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
            {
                // dig.c mdig_tunnel() draws rnd(12) before deciding that
                // ordinary floor holds nothing to dig, so a tunneler's plain
                // move already spends a call this port cannot make.
                name: 'tunneling monster',
                reason: 'monster tunneling',
                prepare: () => prepareSelectedAction({
                    pmidx: PM_ROCK_MOLE,
                }),
            },
            {
                // monmove.c:1271-1273 maybe_spin_web() reaches its rn2(1000)
                // only for a webmaker that also passes four narrower guards.
                // The port refuses on webmaker() alone rather than port them.
                name: 'web-spinning monster',
                reason: 'monster web spinning',
                prepare: () => prepareSelectedAction({
                    pmidx: PM_CAVE_SPIDER,
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

test('simple preflight refuses each turn-preamble state on its own',
    async () => {
        // allmain.c moveloop_core() runs `if (svc.context.bypasses)
        // clear_bypasses();` at 193 and resolves a deferred level transition
        // before the monster loop; neither is ported, so a scan entered with
        // either one pending must refuse. Each is set alone, so a guard that
        // demanded both would admit these two turns.
        //
        // The guard used to carry a third term reading game.occupation, a
        // field nothing in js/ assigns. C gates nothing here on go.occupation
        // -- allmain.c names it only at 332, 485-506 and 684-689, all later in
        // the turn -- so dropping it stops nothing that C stops; monmove.c
        // dochugw() owns the per-monster occupation test instead.
        for (const pending of [
            () => { game.context.bypasses = true; },
            () => { game.u.utotype = 1; },
        ]) {
            await prepareSelectedAction();
            pending();
            await assert.rejects(
                preflightSimpleMonsterActions(game),
                (error) => (
                    error instanceof UnsupportedSimpleMonsterActionError
                    && error.reason
                        === 'deferred monster cleanup or level transition'
                ),
            );
            game.context.bypasses = false;
            game.u.utotype = 0;
        }

        // With neither pending the same scan runs to completion, which is what
        // makes the two refusals above attributable to the states they set.
        const clean = await prepareSelectedAction();
        const before = completeSecondTurnSnapshot(game, clean.replay);
        await preflightSimpleMonsterActions(game);
        assert.deepEqual(
            completeSecondTurnSnapshot(game, clean.replay),
            before,
        );
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
        // js/monmove.js:2229 drops a rock before mon_would_take_item() runs,
        // which is monmove.c:1413-1414. The skip therefore never consults the
        // species, so this case shows only that a rock selects nothing and
        // draws nothing. That the same fixture does reach a wanted object is
        // what 'simple item search refuses an artifact it cannot touch' below
        // asserts, with the same gnome and the same blinding.
        const target = await prepareSelectedAction({
            pmidx: PM_GNOME,
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

// C ref: mon.c can_touch_safely():1971 asks artifact.c touch_artifact() about
// every item a monster considers, and that function can blast the toucher for
// d(4,10) and print. m_move()'s env answers it with a refusal, which the two
// cases below reach by the two routes the running game has: a hostile
// monster's m_search_items(), and a pet's dog_invent() and dog_goal() under
// movePet(). Neither route used to supply the operation at all, so both raised
// a bare TypeError, which escapes runSegment() and discards the segment's
// matching prefix instead of ending the segment on it.
test('simple item search refuses an artifact it cannot touch', async () => {
    // A gnome is M2_COLLECT, so mon_would_take_item() claims a weapon and
    // m_search_items() asks can_carry() -> can_touch_safely() about it. Sting
    // is artilist.h:138, the elven dagger; only obj->oartifact reaches the
    // refusal, so any artifact of a wanted class would do.
    const target = await prepareSelectedAction({ pmidx: PM_GNOME });
    // A blind monster off the hero's line runs the item search; the sighted
    // fixture keeps approach == 1 and skips it.
    target.monster.mcansee = false;
    game.viz_array[target.heroY][target.monsterX] &= ~COULD_SEE;
    const sting = floorObject(
        target.monsterX,
        target.heroY,
        9101,
        ELVEN_DAGGER,
    );
    sting.oartifact = ART_STING;
    installObject(target, sting);
    const before = completeSecondTurnSnapshot(game, target.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'monster artifact item selection'
            ),
            `attempt ${attempt + 1}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
            `attempt ${attempt + 1}`,
        );
    }
});

test('a pet fetching an artifact refuses instead of crashing', async () => {
    // The same fixture as the planned-pickup case below, with the dagger made
    // an artifact: dog_invent() reads the pet's own square, finds no food in
    // a weapon, and asks can_carry() -> can_touch_safely() whether to fetch.
    const target = await prepareStartingPetAction(PM_PONY);
    target.monster.mextra.edog.apport = 20;
    const sting = floorObject(
        target.monsterX,
        target.heroY,
        9101,
        ELVEN_DAGGER,
    );
    sting.oartifact = ART_STING;
    installObject(target, sting);
    const before = completeSecondTurnSnapshot(game, target.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'monster artifact item selection'
            ),
            `attempt ${attempt + 1}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
            `attempt ${attempt + 1}`,
        );
        assert.equal(
            game.level.objects[target.monsterX][target.heroY],
            sting,
            `attempt ${attempt + 1}`,
        );
        assert.equal(target.monster.minvent, null, `attempt ${attempt + 1}`);
    }
});

// C ref: dogmove.c:466-470. dog_invent()'s carry arm hands an AT_WEAP pet
// straight to weapon.c mon_wield_item() once mpickobj() has taken the object,
// and moveSimplePet()'s wieldPickedItem injection answers that call with a
// refusal. Without the injection dog_invent() raises a bare TypeError from
// inventoryOperation(), which escapes runSegment() and discards the segment's
// matching prefix instead of ending the segment on its last matching screen --
// the same failure the artifact pair above covers for can_touch_safely().
//
// The arm needs a fabricated pet. assertSimpleActionState() admits a tame
// monster only when its species is one of the three starting pets, and none of
// those three has AT_WEAP: include/monsters.h:228-234 and :381-388 give the
// little dog and the kitten a lone AT_BITE, and :1002-1009 gives the pony
// AT_KICK and AT_BITE. So this fixture puts an AT_WEAP attack in the pony's
// first free mattk slot, which is where a permonst entry with three attacks
// carries it, and leaves the kick and the bite in place.
test('a pet picking a weapon up refuses instead of crashing', async () => {
    const target = await prepareStartingPetAction(PM_PONY);
    target.monster.mextra.edog.apport = 20;
    const attacks = [...target.monster.data.mattk];
    // ATTK(AT_WEAP, AD_PHYS, 1, 6): AD_PHYS is 0 and the damage is never
    // rolled here, so only aatyp selects the arm.
    attacks[2] = { aatyp: AT_WEAP, adtyp: 0, damn: 1, damd: 6 };
    target.monster.data = { ...target.monster.data, mattk: attacks };
    // C ref: dogmove.c:467. NEED_WEAPON is the second half of the gate, and
    // monst.js starts a monster at NO_WEAPON_WANTED.
    target.monster.weapon_check = NEED_WEAPON;
    const dagger = floorObject(
        target.monsterX,
        target.heroY,
        9101,
        DAGGER,
    );
    installObject(target, dagger);
    const before = completeSecondTurnSnapshot(game, target.replay);

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'pet weapon selection'
            ),
            `attempt ${attempt + 1}`,
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
            `attempt ${attempt + 1}`,
        );
        // The refusal lands after mpickobj() has run on the clone, so the live
        // dagger stays on the floor and the live pony's pack stays empty.
        assert.equal(
            game.level.objects[target.monsterX][target.heroY],
            dagger,
            `attempt ${attempt + 1}`,
        );
        assert.equal(target.monster.minvent, null, `attempt ${attempt + 1}`);
        // C sets NEED_HTH_WEAPON immediately before the call, on the clone.
        // A live pony still asking for a weapon proves the write was isolated
        // and that the refusal did not come from some earlier gate.
        assert.equal(
            target.monster.weapon_check,
            NEED_WEAPON,
            `attempt ${attempt + 1}`,
        );
    }
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

test('a starting pony targets at range and later refusal stays retryable',
    async () => {
    const target = await prepareStartingPetAction(PM_PONY);
    const { monster: pony } = target;
    const defender = ordinaryMonster(
        PM_GIANT_RAT,
        target.monsterX,
        target.heroY - 2,
        { m_id: 9002, movement: 0 },
    );
    const laterAttacker = ordinaryMonster(
        PM_GIANT_RAT,
        game.u.ux,
        game.u.uy - 1,
        { m_id: 9003 },
    );
    pony.nmon = defender;
    defender.nmon = laterAttacker;
    game.level.monsters[defender.mx][defender.my] = defender;
    game.level.monsters[laterAttacker.mx][laterAttacker.my] = laterAttacker;
    for (let y = defender.my; y <= pony.my; ++y)
        game.level.at(pony.mx, y).typ = ROOM;
    game.level.at(laterAttacker.mx, laterAttacker.my).typ = ROOM;
    game.viz_array[pony.my][pony.mx] |= IN_SIGHT;
    game.viz_array[defender.my][defender.mx] |= IN_SIGHT;

    // Distinct sentinels make each omitted planning clone observable. The
    // pony writes all four owners during its distant miss; the later ordinary
    // monster then refuses while adjacent to the hero.
    (game.gb ??= {}).bhitpos = { x: 1, y: 2 };
    (game.gn ??= {}).notonhead = true;
    (game.gs ??= {}).skipdrin = true;
    (game.gv ??= {}).vis = false;
    const before = completeSecondTurnSnapshot(game, target.replay);
    const combatBefore = structuredClone({
        gb: game.gb,
        gn: game.gn,
        gs: game.gs,
        gv: game.gv,
    });

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'monster attack on the hero',
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, target.replay),
            before,
        );
        assert.deepEqual({
            gb: game.gb,
            gn: game.gn,
            gs: game.gs,
            gv: game.gv,
        }, combatBefore);
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
        // The artifact third of that oracle is vacuous and cannot be armed
        // from here. find_artifact() (js/artifacts.js:452-462) is the only
        // writer of artiexist[].found, it is reached only through xname() on
        // an object whose oartifact is set, and giving this fixture a real
        // artifact makes the pet path refuse first: can_carry() reaches
        // can_touch_safely(), which m_move()'s env answers with a refusal.
        // The pet case in the artifact pair earlier in this file is that
        // fixture, with the dagger given an oartifact.
        // So no admitted planning round reaches find_artifact() today, and
        // planningState()'s artiexist clone is unexercised: replacing it with
        // the live array leaves this whole file green. It is kept anyway,
        // because the arm beside it leaked exactly this way, and the choice is
        // recorded rather than left to look pinned.
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

// The transparency-index restore in preflightSimpleMonsterActions()'s finally
// calls recalc_block_point(), and rebuildVisionPoint() sets vision_full_recalc
// whenever the change touches the hero's current vision. That is the normal
// case for a door in a lit room, and it made the dry run leave a flag set that
// the live scan then consumes as a vision_recalc(0) C never performs.
//
// prepareClosedDoorArrival() cannot show it: its viz_array entry at the door is
// 0, so rebuildVisionPoint() takes the other branch. This case puts the door
// inside the hero's vision first, which is what the leak needs.
test('a planned door opening leaves vision_full_recalc as it found it',
    async () => {
        const target = await prepareClosedDoorArrival();
        // Clear the square between hero and door, then recompute so the live
        // vision genuinely covers the door.
        for (let x = target.heroX + 1; x < target.destinationX; ++x) {
            const between = game.level.at(x, target.heroY);
            between.typ = ROOM;
            between.flags = 0;
            recalc_block_point(x, target.heroY, game);
        }
        vision_recalc(0);
        assert.notEqual(
            game.viz_array[target.heroY][target.destinationX] & COULD_SEE,
            0,
            'the fixture must put the door inside the hero vision',
        );

        game.vision_full_recalc = 0;
        await preflightSimpleMonsterActions(game);

        assert.equal(game.vision_full_recalc, 0);
    });

// The cases below share one detector rather than one assertion each.
// freezeLiveState() deep-freezes everything the dry run can reach in the live
// game, so a field planningState() forgot to copy throws a TypeError at the
// line that writes it. They exist because the field list has no source of
// truth to check against: nine recorded defects were all found by symptom,
// after the fact, and two of them were introduced by the fix for a previous
// one. See scripts/planning-isolation-test-support.mjs for its three
// exclusions and the one thing it cannot see at all. Each case asserts a floor
// on the objects frozen, so a walk that reached almost nothing cannot pass as a
// clean run, and each calls guard.assertNoLeak() afterwards, which covers the
// typed-array grids -- state.viz_array among them -- that cannot be frozen.
//
// Each case ends with the game frozen for good, so none may run a live pass
// afterwards.

// Every case calls this. freezeLiveState() reports what it reached, and a
// walk that reached almost nothing would let every case below pass without
// testing anything -- a failure that looks exactly like success.
function assertDetectorReachedTheGraph(guard) {
    assert.ok(guard.frozen > 1000, `froze only ${guard.frozen} objects`);
    assert.ok(guard.views > 0, `snapshotted only ${guard.views} typed arrays`);
}

test('a planned ordinary move writes nothing to frozen live state',
    async () => {
        const target = await prepareSelectedAction();
        const guard = freezeLiveState(game);
        assertDetectorReachedTheGraph(guard);

        await preflightSimpleMonsterActions(game);

        guard.assertNoLeak(assert);
        assert.equal(target.monster.mx, target.monsterX);
    });

test('a planned door opening writes nothing to frozen live state',
    async () => {
        // The widest of the three: postmov()'s UnblockDoor arm runs
        // vision_recalc() against the planned map, and the scan's finally
        // re-derives the borrowed transparency index from the live one. The
        // live root is left writable precisely so that restore can write its
        // three fields; everything it reaches below the root is frozen.
        const target = await prepareClosedDoorArrival();
        const guard = freezeLiveState(game);
        assertDetectorReachedTheGraph(guard);

        await preflightSimpleMonsterActions(game);

        guard.assertNoLeak(assert);
        assert.equal(target.location.doormask, D_CLOSED);
        assert.equal(doorLetsLightThrough(target), 0);
    });

test('a planned pet pickup writes nothing to frozen live state',
    async () => {
        // dog_invent()'s carry arm splits stacks, unlinks floor objects,
        // rewrites monster inventories and names the object, which reaches
        // discover_object(). It is the path that produced the discovery-ledger
        // defect and the dropped catalog aliases, so it is the one most worth
        // freezing. The fixture matches the untouched-graph test above,
        // including xray_range, which is what puts distant_name() on the near
        // branch that names and therefore discovers; without it the carry arm
        // formats a bare type name and the case proves nothing.
        const target = await prepareStartingPetAction(PM_PONY);
        target.monster.mextra.edog.apport = 20;
        const dagger = floorObject(
            target.monsterX,
            target.heroY,
            9101,
            DAGGER,
        );
        installObject(target, dagger);
        const rock = floorObject(target.destinationX, target.heroY, 9102);
        game.level.objects[rock.ox][rock.oy] = rock;
        rock.nobj = dagger;
        game.level.objlist = rock;
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        game.u.xray_range = 3;
        game.objects[DAGGER].oc_encountered = 0;
        const discoBefore = JSON.stringify(game.svd.disco);
        const guard = freezeLiveState(game);
        assertDetectorReachedTheGraph(guard);

        await preflightSimpleMonsterActions(game);

        guard.assertNoLeak(assert);

        // The freeze is the detector; these pin that the case still reaches
        // the arm, so a fixture that stops refusing early cannot pass quietly.
        assert.equal(game.objects[DAGGER].oc_encountered, 0);
        assert.equal(JSON.stringify(game.svd.disco), discoBefore);
        assert.equal(dagger.where, OBJ_FLOOR);
        assert.equal(game.level.objlist, rock);
    });

test('a planned dart trap writes nothing to frozen live state', async () => {
    // The only admitted path that creates an object inside the dry run.
    // trap.c trapeffect_dart_trap() writes the trap's `once` bit, mksobj()
    // reads and advances context.ident through next_ident(), and a missed
    // dart is linked into the floor grid and the level object list. None of
    // those is reached by the pickup cases above, which move objects that
    // already exist.
    const target = await prepareSelectedAction();
    game.level.traps = [{
        tx: target.destinationX,
        ty: target.heroY,
        ttyp: DART_TRAP,
        tseen: false,
        once: false,
        madeby_u: false,
        tnote: 0,
        vl: {},
        launch: { x: -1, y: -1 },
        dst: { dnum: -1, dlevel: -1 },
        teledest: { x: 0, y: 0 },
        conjoined: 0,
    }];
    const identBefore = game.context.ident;
    const guard = freezeLiveState(game);
    assertDetectorReachedTheGraph(guard);

    await preflightSimpleMonsterActions(game);

    guard.assertNoLeak(assert);
    // The freeze is the detector; these pin that the case still reaches the
    // arm, so a fixture that stops refusing early cannot pass quietly.
    assert.equal(game.level.traps[0].once, false);
    assert.equal(game.context.ident, identBefore);
    assert.equal(game.level.objlist, null);
    assert.equal(game.level.objects[target.destinationX][target.heroY], null);
});

test('a planned distant pet pickup writes nothing to frozen live state',
    async () => {
        // The same carry arm on distant_name()'s far branch, which is the
        // only reader of gd. objnam.c computes neardist from u.xray_range, so
        // the case above -- which sets it, to reach discover_object() --
        // returns before the counter is touched; the two branches cannot be
        // armed at once. gd.distantname is raised around the name and lowered
        // in a finally, so a shared gd is balanced and shows nothing by
        // inspection. It leaks only once gd exists, which it does from the
        // first live distant_name() onwards: absent in a fresh game, present
        // in a played one. Seeding it is what makes that state reachable here.
        const target = await prepareStartingPetAction(PM_PONY);
        target.monster.mextra.edog.apport = 20;
        const dagger = floorObject(
            target.monsterX,
            target.heroY,
            9101,
            DAGGER,
        );
        installObject(target, dagger);
        game.viz_array[target.heroY][target.monsterX] |= IN_SIGHT;
        game.gd = { distantname: 0 };
        const guard = freezeLiveState(game);
        assertDetectorReachedTheGraph(guard);

        await preflightSimpleMonsterActions(game);

        guard.assertNoLeak(assert);
        assert.equal(game.gd.distantname, 0);
        assert.equal(dagger.where, OBJ_FLOOR);
    });
