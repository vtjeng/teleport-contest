import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BURN,
    COULD_SEE,
    CORR,
    D_CLOSED,
    DUST,
    DOOR,
    FOUNTAIN,
    HEADSTONE,
    IN_SIGHT,
    LAVAPOOL,
    MMOVE_NOTHING,
    MON_FLOOR,
    NEED_WEAPON,
    NORMAL_SPEED,
    OBJ_MINVENT,
    PIT,
    POOL,
    ROOM,
    STONE,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    W_SADDLE,
    W_WEP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_DISPLACER_BEAST,
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
import {
    DAGGER,
    POT_HEALING,
    POT_SPEED,
    ROCK,
    SADDLE,
    TRIPE_RATION,
} from '../js/objects.js';
import { create_region } from '../js/region.js';
import { completeSecondTurnSnapshot } from './second-turn-snapshot.mjs';

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

test('simple movement admits only a doorless doorway', async () => {
    const doorway = await prepareSelectedAction();
    const location = game.level.at(
        doorway.destinationX,
        doorway.heroY,
    );
    location.typ = DOOR;
    location.flags = location.doormask = 0;
    const before = preflightSnapshot();

    await preflightSimpleMonsterActions(game);
    assert.deepEqual(preflightSnapshot(), before);
    await runSimpleMonsterAction(doorway.monster, { state: game });
    assert.deepEqual(
        [doorway.monster.mx, doorway.monster.my],
        [doorway.destinationX, doorway.heroY],
    );

    const closedDoor = await prepareSelectedAction({ pmidx: PM_GNOME });
    const closedLocation = game.level.at(
        closedDoor.destinationX,
        closedDoor.heroY,
    );
    closedLocation.typ = DOOR;
    closedLocation.flags = closedLocation.doormask = D_CLOSED;
    const closedBefore = completeSecondTurnSnapshot(
        game,
        closedDoor.replay,
    );

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            preflightSimpleMonsterActions(game),
            (error) => (
                error instanceof UnsupportedSimpleMonsterActionError
                && error.reason === 'door or special terrain movement'
            ),
        );
        assert.deepEqual(
            completeSecondTurnSnapshot(game, closedDoor.replay),
            closedBefore,
            `closed door, attempt ${attempt + 1}`,
        );
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
            moves: ' .',
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
                name: 'post-move object pickup',
                reason: 'ordinary monster item interaction',
                prepare: async () => {
                    const target = await prepareSelectedAction({
                        pmidx: PM_GNOME,
                    });
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
                name: 'pony pickup',
                reason: 'pet object pickup',
                prepare: async () => {
                    const target = await prepareStartingPetAction(PM_PONY);
                    target.monster.mextra.edog.apport = 20;
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
