import assert from 'node:assert/strict';
import test from 'node:test';

import {
    commandForKey,
    commandKeyCode,
    createCommandBindingModel,
    keyForCommand,
} from '../js/command_bindings.js';
import { moveloop_core } from '../js/allmain.js';
import {
    MAX_COMMAND_COUNT,
    parseCommand,
    resetCommandVars,
    rhack,
    UnsupportedHeroCommandBoundaryError,
} from '../js/cmd.js';
import {
    COLNO,
    CORR,
    CROSSWALL,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    DOOR,
    FAST,
    FOUNTAIN,
    HALLUC,
    HWALL,
    IN_SIGHT,
    INTRINSIC,
    M_AP_FURNITURE,
    MON_FLOOR,
    NORMAL_SPEED,
    PIT,
    ROOM,
    ROWNO,
    STONE,
    STONED,
    TDWALL,
    TLCORNER,
    TLWALL,
    TRCORNER,
    TRWALL,
    TUWALL,
    BLCORNER,
    BRCORNER,
    VWALL,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import {
    domove,
    monsterNearby,
    test_move,
    UnsupportedHeroMoveBoundaryError,
} from '../js/hack.js';
import { runSegment, segmentIterationLimit } from '../js/jsmain.js';
import { PM_FOG_CLOUD } from '../js/monsters.js';
import { BOULDER } from '../js/objects.js';
import { parseNethackrc } from '../js/options.js';
import { create_region } from '../js/region.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
} from '../js/rng.js';
import { CLR_GRAY } from '../js/terminal.js';
import { seenv_matrix } from '../js/vision.js';
import {
    clearTtyMessageWindow,
    ttyPline,
} from '../js/tty_message.js';

// This non-Friday-the-13th, non-moon-boundary afternoon keeps command tests
// free of calendar messages while still exercising fixed-datetime startup.
const COMMAND_DATETIME = '20310314150926';

function resetParserTestGame(keys) {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    game.flags = { rest_on_space: true };
    game.iflags = { num_pad: false, num_pad_mode: 0 };
    game.program_state = { in_moveloop: 1 };
    game.context = { move: 0 };
    game.disp = {};
    game.u = {};
    // Avoid invoking the status formatter: these tests isolate command input.
    game._renderedStatusLayouts = [];
    for (const key of keys) {
        game.nhDisplay.pushKey(
            typeof key === 'number' ? key : key.charCodeAt(0),
        );
    }
    return game;
}

function topLine(state) {
    return state.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
}

test('test_move describes remembered walls without time or PRNG work',
    async () => {
        const state = {
            flags: { mention_walls: true },
            level: new GameMap(),
        };
        // Interior coordinate (10,10) and eastward delta isolate the
        // destination lookup from map-edge refusal.
        const ux = 10;
        const uy = 10;
        const destination = state.level.at(ux + 1, uy);
        const messages = [];
        const env = {
            message: (message) => messages.push(message),
        };

        // Every ordinary wall geometry maps to a wall defsym; DBWALL is a
        // separate drawbridge branch and is intentionally not in this family.
        destination.seenv = 0xFF;
        for (const wall of [
            VWALL, HWALL, TLCORNER, TRCORNER, BLCORNER, BRCORNER,
            CROSSWALL, TUWALL, TDWALL, TLWALL, TRWALL,
        ]) {
            destination.typ = wall;
            assert.equal(
                await test_move(ux, uy, 1, 0, state, env),
                false,
            );
        }
        destination.typ = STONE;
        assert.equal(
            await test_move(ux, uy, 1, 0, state, env),
            false,
        );
        assert.deepEqual(messages, [
            ...Array(11).fill("It's a wall."),
            "It's solid stone.",
        ]);

        state.a11y = { accessiblemsg: true };
        state.iflags = {};
        state.u = { ux, uy, uprops: [] };
        destination.typ = VWALL;
        messages.length = 0;
        assert.equal(await test_move(ux, uy, 1, 0, state, env), false);
        assert.deepEqual(messages, ["(east): It's a wall."]);

        // mention_walls is the exact source output gate. The refusal itself
        // remains in force when the option is disabled.
        state.flags.mention_walls = false;
        destination.typ = VWALL;
        assert.equal(
            await test_move(ux, uy, 1, 0, state, {
                message: () => assert.fail('disabled wall message'),
            }),
            false,
        );

        // ROOM is outside this ported test_move() branch and remains legal.
        destination.typ = ROOM;
        assert.equal(await test_move(ux, uy, 1, 0, state), true);
    });

test('blind obstacle refusal records exact tactile viewing vectors',
    async () => {
        await runSegment({
            seed: 840002,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:BlindWall,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,blind,pettype:none',
            moves: '',
        });
        game.flags.mention_walls = false;
        for (const typ of [HWALL, STONE]) {
            for (let dy = -1; dy <= 1; ++dy) {
                for (let dx = -1; dx <= 1; ++dx) {
                    if (!dx && !dy) continue;
                    const x = game.u.ux + dx;
                    const y = game.u.uy + dy;
                    const destination = game.level.at(x, y);
                    destination.typ = typ;
                    destination.seenv = 0;
                    destination.remembered_glyph = null;

                    assert.equal(
                        await test_move(
                            game.u.ux,
                            game.u.uy,
                            dx,
                            dy,
                            game,
                            {
                                message: () => assert.fail(
                                    'mention_walls is disabled',
                                ),
                            },
                        ),
                        false,
                    );

                    assert.equal(
                        destination.seenv,
                        seenv_matrix[1 - dy][dx + 1],
                    );
                    assert.ok(destination.remembered_glyph);
                    assert.equal(
                        destination.disp_ch,
                        destination.remembered_glyph.ch,
                    );
                }
            }
        }

        const stone = game.level.at(game.u.ux + 1, game.u.uy);
        stone.typ = STONE;
        stone.seenv = 0;
        game.flags.mention_walls = true;
        game.a11y = { accessiblemsg: true };
        const messages = [];
        assert.equal(
            await test_move(game.u.ux, game.u.uy, 1, 0, game, {
                message: (text) => messages.push(text),
            }),
            false,
        );
        assert.deepEqual(messages, ["(east): It's solid stone."]);
    });

function heroMoveAdmissionSnapshot(replay) {
    return {
        context: structuredClone(game.context),
        cursor: replay.getCursors().map((cursor) => [...cursor]),
        display: structuredClone(game.nhDisplay.grid),
        domoveAttempting: game.domoveAttempting,
        hero: {
            umoved: game.u.umoved,
            ux: game.u.ux,
            ux0: game.u.ux0,
            uy: game.u.uy,
            uy0: game.u.uy0,
        },
        multi: game.multi,
        pendingMessage: game._pending_message,
        regions: game.level.regions.map((region) => region.hero_inside),
        rngContext: {
            a: game.coreCtx.a,
            b: game.coreCtx.b,
            c: game.coreCtx.c,
            m: [...game.coreCtx.m],
            n: game.coreCtx.n,
            r: [...game.coreCtx.r],
        },
        rngLog: [...getRngLog()],
        screens: [...replay.getScreens()],
    };
}

function heroCommandRetrySnapshot(replay, trimInputCaptures = 0) {
    const retained = (values) => values.slice(
        0,
        trimInputCaptures ? -trimInputCaptures : undefined,
    );
    return {
        context: structuredClone(game.context),
        display: {
            grid: structuredClone(game.nhDisplay.grid),
            messages: [...game.nhDisplay.messages],
            pending: game._pending_message,
            topMessage: game.nhDisplay.topMessage,
            toplin: game.nhDisplay.toplin,
            toplines: game.nhDisplay.toplines,
            ttyToplines: game._ttyToplines,
        },
        domoveAttempting: game.domoveAttempting,
        hero: structuredClone(game.u),
        iflags: structuredClone(game.iflags),
        input: {
            queue: [...(game.nhDisplay.terminal._inputQueue ?? [])],
            waiting: game.nhDisplay.isWaitingForInput,
        },
        multi: game.multi,
        output: {
            animations: structuredClone(retained(
                replay.getAnimationFramesByStep(),
            )),
            cursors: structuredClone(retained(replay.getCursors())),
            rngSlices: structuredClone(retained(replay.getRngSlices())),
            screens: retained(replay.getScreens()),
        },
        terminal: {
            cursor: [
                game.nhDisplay.cursorCol,
                game.nhDisplay.cursorRow,
                game.nhDisplay.cursorVisible,
            ],
            waitEpoch: game.nhDisplay.waitEpoch,
        },
        rng: {
            context: {
                a: game.coreCtx.a,
                b: game.coreCtx.b,
                c: game.coreCtx.c,
                m: [...game.coreCtx.m],
                n: game.coreCtx.n,
                r: [...game.coreCtx.r],
            },
            log: [...getRngLog()],
        },
        scheduler: {
            heroSeq: game.hero_seq ?? null,
            moves: game.moves,
            purgeMonsters: game.iflags.purge_monsters,
            somebodyCanMove: game.somebody_can_move,
            visionFullRecalc: game.vision_full_recalc,
        },
        world: {
            headEngraving: structuredClone(game.head_engr),
            locations: structuredClone(game.level.locations),
            monsterGrid: game.level.monsters.map(
                (column) => column.map((monster) => monster?.m_id ?? 0),
            ),
            objectGrid: game.level.objects.map(
                (column) => column.map((object) => object?.o_id ?? 0),
            ),
            regions: structuredClone(game.level.regions),
            traps: structuredClone(game.level.traps),
            vision: game.viz_array.map((row) => [...row]),
        },
    };
}

async function prepareHeroMoveAdmission() {
    const replay = await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MoveAdmission,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: '',
    });
    const x = game.u.ux + 1;
    const y = game.u.uy;
    const destination = game.level.at(x, y);
    destination.typ = ROOM;
    destination.flags = destination.doormask = 0;
    game.level.monsters[x][y] = null;
    game.level.monlist = null;
    game.level.objects[x][y] = null;
    game.level.traps = [];
    game.level.regions = [];
    game.head_engr = null;
    game.u.dx = 1;
    game.u.dy = 0;
    game.u.umoved = false;
    game.context.move = 1;
    game.domoveAttempting = 1;
    return { destination, replay, x, y };
}

test('simple hero movement rejects spot effects before mutation', async () => {
    const cases = [
        {
            name: 'automatic pickup',
            reason: 'automatic pickup',
            setup: ({ x, y }) => {
                game.flags.pickup = true;
                game.level.objects[x][y] = { o_id: 1, nexthere: null };
            },
        },
        {
            name: 'floor object pile',
            reason: 'floor object pile',
            setup: ({ x, y }) => {
                // Two linked objects exercise the pile path, not merely the
                // single-object floor-description branch.
                game.level.objects[x][y] = {
                    o_id: 1,
                    nexthere: { o_id: 2, nexthere: null },
                };
            },
        },
        {
            name: 'hidden pit',
            reason: 'trap activation',
            setup: ({ x, y }) => {
                // tseen=false models a legally enterable hidden trap.
                game.level.traps.push({
                    tx: x, ty: y, ttyp: PIT, tseen: false,
                });
            },
        },
        {
            name: 'fountain terrain',
            reason: 'door or special terrain movement',
            setup: ({ destination }) => {
                destination.typ = FOUNTAIN;
            },
        },
        {
            name: 'region entry',
            reason: 'region crossing',
            setup: ({ x, y }) => {
                // A one-cell region isolates the false -> true membership
                // transition at this destination.
                game.level.regions.push(create_region([
                    { lx: x, ly: y, hx: x, hy: y },
                ]));
            },
        },
        {
            name: 'floor engraving',
            reason: 'engraving interaction',
            setup: ({ x, y }) => {
                game.head_engr = {
                    engr_x: x,
                    engr_y: y,
                    engr_txt: ['Elbereth'],
                    nxt_engr: null,
                };
            },
        },
        {
            name: 'monster at destination',
            reason: 'hero combat or displacement',
            setup: ({ x, y }) => {
                game.level.monsters[x][y] = {
                    mx: x, my: y, mhp: 1,
                };
            },
        },
    ];

    for (const admissionCase of cases) {
        const target = await prepareHeroMoveAdmission();
        admissionCase.setup(target);
        const destinationObject = game.level.objects[target.x][target.y];
        const before = heroMoveAdmissionSnapshot(target.replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                domove(game),
                (error) => (
                    error instanceof UnsupportedHeroMoveBoundaryError
                    && error.reason === admissionCase.reason
                ),
                `${admissionCase.name}, attempt ${attempt + 1}`,
            );
            assert.deepEqual(
                heroMoveAdmissionSnapshot(target.replay),
                before,
                `${admissionCase.name}, attempt ${attempt + 1}`,
            );
            assert.equal(
                game.level.objects[target.x][target.y],
                destinationObject,
                admissionCase.name,
            );
        }
    }
});

test('live !safe_pet collision is a zero-PRNG retryable boundary',
    async () => {
        const replay = await runSegment({
            seed: 31009,
            datetime: '20300102030405',
            nethackrc: 'OPTIONS=name:UnsafePet,role:Tourist,race:human,'
                + 'gender:male,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,mention_walls,!safe_pet,!acoustics',
            moves: '',
        });
        let pet = game.level.monlist;
        while (pet && pet.m_id !== game.context.startingpet_mid)
            pet = pet.nmon;
        assert.ok(pet);
        assert.equal(game.flags.safe_dog, false);
        game.u.dx = pet.mx - game.u.ux;
        game.u.dy = pet.my - game.u.uy;
        assert.ok(Math.abs(game.u.dx) <= 1 && Math.abs(game.u.dy) <= 1);
        assert.notDeepEqual([game.u.dx, game.u.dy], [0, 0]);
        game.u.umoved = false;
        game.context.move = 1;
        game.domoveAttempting = 1;
        const before = heroMoveAdmissionSnapshot(replay);

        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                domove(game),
                (error) => (
                    error instanceof UnsupportedHeroMoveBoundaryError
                    && error.reason === 'hero combat or displacement'
                ),
            );
            assert.deepEqual(
                heroMoveAdmissionSnapshot(replay),
                before,
                `attempt ${attempt + 1}`,
            );
        }
    });

test('runtime hero refusals do not become phantom elapsed turns', async () => {
    const cases = [
        {
            name: 'automatic pickup',
            reason: 'automatic pickup',
            install: ({ x, y }) => {
                game.flags.pickup = true;
                game.level.objects[x][y] = {
                    o_id: 7001,
                    nexthere: null,
                };
            },
            remove: ({ x, y }) => {
                game.level.objects[x][y] = null;
                game.flags.pickup = false;
            },
        },
        {
            name: 'hidden trap',
            reason: 'trap activation',
            install: ({ x, y }) => {
                game.level.traps = [{
                    tx: x, ty: y, ttyp: PIT, tseen: false,
                }];
            },
            remove: () => {
                game.level.traps = [];
            },
        },
        {
            name: 'special terrain',
            reason: 'door or special terrain movement',
            install: ({ destination }) => {
                destination.typ = FOUNTAIN;
            },
            remove: ({ destination }) => {
                destination.typ = ROOM;
            },
        },
        ...[
            ['doorless door', D_NODOOR],
            ['open door', D_ISOPEN],
            ['broken door', D_BROKEN],
            ['closed door', D_CLOSED],
            ['locked door', D_LOCKED],
            ['trapped open door', D_ISOPEN | D_TRAPPED],
            ['trapped closed door', D_CLOSED | D_TRAPPED],
        ].map(([name, mask]) => ({
            name,
            reason: 'door or special terrain movement',
            install: ({ destination }) => {
                destination.typ = DOOR;
                destination.flags = destination.doormask = mask;
            },
            remove: ({ destination }) => {
                destination.typ = ROOM;
                destination.flags = destination.doormask = 0;
            },
        })),
        ...[ROOM, CORR].map((typ) => ({
            name: `${typ === ROOM ? 'room' : 'corridor'} boulder`,
            reason: 'boulder movement',
            install: ({ destination, x, y }) => {
                game.flags.pickup = false;
                destination.typ = typ;
                game.level.objects[x][y] = {
                    o_id: 7002,
                    otyp: BOULDER,
                    nexthere: null,
                };
            },
            remove: ({ x, y }) => {
                game.level.objects[x][y] = null;
            },
        })),
    ];

    for (const refusal of cases) {
        const replay = await runSegment({
            seed: 840004,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:MoveRetry,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none',
            moves: '',
        });
        clearTtyMessageWindow(game);
        resetCommandVars(game);
        const x = game.u.ux + 1;
        const y = game.u.uy;
        const destination = game.level.at(x, y);
        destination.typ = ROOM;
        destination.flags = destination.doormask = 0;
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.objects[x][y] = null;
        game.level.traps = [];
        game.level.regions = [];
        game.head_engr = null;
        refusal.install({ destination, x, y });

        const expected = heroCommandRetrySnapshot(replay);
        Object.assign(expected.context, {
            forcefight: 0,
            move: 0,
            mv: 0,
            nopick: 0,
            run: 0,
            travel: 0,
            travel1: 0,
        });
        expected.domoveAttempting = 0;
        expected.iflags.menu_requested = false;
        expected.multi = 0;
        expected.context.pendingCommand = {
            phase: 'parsed',
            key: commandKeyCode('l'),
            commandCount: 0,
            lastCommandCount: 0,
            multi: 0,
        };
        const expectedOutput = expected.output;
        delete expected.output;
        const initialDispatches = game._commandDispatchCount;
        let refusalOutput;
        let refusalScreen;
        let refusalCursor;
        let refusalTerminal;

        game.nhDisplay.pushKey(commandKeyCode('l'));
        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                moveloop_core(),
                (error) => (
                    error instanceof UnsupportedHeroMoveBoundaryError
                    && error.reason === refusal.reason
                ),
                `${refusal.name}, attempt ${attempt + 1}`,
            );
            const actual = heroCommandRetrySnapshot(replay);
            const actualOutput = actual.output;
            const actualTerminal = actual.terminal;
            delete actual.output;
            delete actual.terminal;
            const expectedTerminal = expected.terminal;
            delete expected.terminal;
            assert.deepEqual(
                actual,
                expected,
                `${refusal.name}, attempt ${attempt + 1}`,
            );
            expected.terminal = expectedTerminal;
            assert.equal(
                game._commandDispatchCount,
                initialDispatches + attempt + 1,
                refusal.name,
            );
            if (attempt === 0) {
                refusalOutput = structuredClone(actualOutput);
                assert.equal(
                    actualOutput.screens.length,
                    expectedOutput.screens.length + 1,
                );
                assert.deepEqual(
                    actualOutput.screens.slice(0, -1),
                    expectedOutput.screens,
                );
                assert.equal(
                    actualOutput.cursors.length,
                    expectedOutput.cursors.length + 1,
                );
                assert.deepEqual(
                    actualOutput.cursors.slice(0, -1),
                    expectedOutput.cursors,
                );
                refusalScreen = replay.getScreens().at(-1);
                refusalCursor = replay.getCursors().at(-1);
                refusalTerminal = structuredClone(actualTerminal);
            } else {
                assert.deepEqual(actualOutput, refusalOutput);
                assert.deepEqual(actualTerminal, refusalTerminal);
                assert.equal(replay.getScreens().at(-1), refusalScreen);
                assert.deepEqual(
                    replay.getCursors().at(-1),
                    refusalCursor,
                );
            }
            assert.deepEqual(replay.getRngSlices().at(-1), []);
            assert.deepEqual(
                replay.getAnimationFramesByStep().at(-1),
                [],
            );
        }

        refusal.remove({ destination, x, y });
        await moveloop_core();
        await assert.rejects(moveloop_core(), /Input queue empty/u);
        assert.deepEqual([game.u.ux, game.u.uy], [x, y], refusal.name);
        assert.equal(game.moves, expected.scheduler.moves + 1, refusal.name);
        assert.equal(
            game._commandDispatchCount,
            initialDispatches + 3,
            refusal.name,
        );
    }
});

test('unsupported movement retains its byte ahead of the next command',
    async () => {
        const replay = await runSegment({
            seed: 840004,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:PendingMove,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none',
            moves: '',
        });
        clearTtyMessageWindow(game);
        resetCommandVars(game);
        const start = [game.u.ux, game.u.uy];
        const east = game.level.at(start[0] + 1, start[1]);
        east.typ = FOUNTAIN;
        east.flags = east.doormask = 0;
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.level.objects[start[0] + 1][start[1]] = null;
        game.level.traps = [];
        game.level.regions = [];
        game.head_engr = null;
        game.nhDisplay.pushKey(commandKeyCode('l'));
        game.nhDisplay.pushKey(commandKeyCode('.'));

        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                moveloop_core(),
                (error) => (
                    error instanceof UnsupportedHeroMoveBoundaryError
                    && error.reason === 'door or special terrain movement'
                ),
            );
            assert.equal(
                game.context.pendingCommand.key,
                commandKeyCode('l'),
            );
            assert.deepEqual(
                game.nhDisplay.terminal._inputQueue,
                [commandKeyCode('.')],
            );
            assert.deepEqual(replay.getRngSlices().at(-1), []);
        }

        east.typ = ROOM;
        await moveloop_core();
        assert.deepEqual(
            [game.u.ux, game.u.uy],
            [start[0] + 1, start[1]],
        );
        assert.equal(game.context.pendingCommand, undefined);

        await moveloop_core();
        assert.deepEqual(
            [game.u.ux, game.u.uy],
            [start[0] + 1, start[1]],
        );
        assert.equal(game.context.pendingCommand, undefined);
    });

test('simple hero movement admits empty room and corridor controls',
    async () => {
        for (const terrain of [ROOM, CORR]) {
            const { destination, x, y } = await prepareHeroMoveAdmission();
            destination.typ = terrain;

            await domove(game);

            assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
            assert.equal(game.u.umoved, true);
        }
    });

function resetSafeWaitTestGame(options = '') {
    const state = resetParserTestGame([]);
    const parsed = parseNethackrc(options);
    state.flags = parsed.flags;
    state.iflags = parsed.iflags;
    state.commandOperations = parsed.commandOperations;
    state.level = new GameMap();
    state.moves = 1;
    state.u = {
        ux: 20,
        uy: 10,
        uprops: [],
        uswallow: false,
        uinwater: false,
        unblind_telepat_range: 0,
    };
    state.viz_array = Array.from(
        { length: ROWNO },
        () => new Uint8Array(COLNO),
    );
    state.level.at(state.u.ux, state.u.uy).typ = ROOM;

    const monster = {
        data: {
            pmidx: -1,
            mlet: 1,
            geno: 0,
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
            mattk: [{ aatyp: 1 }],
        },
        mx: state.u.ux + 1,
        my: state.u.uy,
        mhp: 5,
        mpeaceful: false,
        m_ap_type: 0,
        mundetected: false,
        msleeping: false,
        mcanmove: true,
        mcansee: true,
    };
    state.level.at(monster.mx, monster.my).typ = ROOM;
    state.level.monsters[monster.mx][monster.my] = monster;
    state.level.monlist = monster;
    state.viz_array[monster.my][monster.mx] = IN_SIGHT;
    return { state, monster };
}

test('runtime bindings apply a custom movement binding, phone-layout directions, and rest-on-space', () => {
    const parsed = parseNethackrc(
        'OPTIONS=number_pad:3,rest_on_space\nBINDINGS=x:movewest',
    );
    const model = createCommandBindingModel(parsed);

    assert.equal(commandForKey(model, commandKeyCode('x')), 'movewest');
    assert.equal(commandForKey(model, commandKeyCode(' ')), 'wait');
    // number_pad:3 selects the phone layout: 4/2/6/8 are W/N/E/S.
    assert.deepEqual(
        ['4', '2', '6', '8'].map((key) => (
            commandForKey(model, commandKeyCode(key))
        )),
        ['movewest', 'movenorth', 'moveeast', 'movesouth'],
    );
});

test('special count-key bindings retain their source byte namespace', async () => {
    const cases = [
        ['x', 'x'.charCodeAt(0)],
        ['7', '7'.charCodeAt(0)],
        ['^X', 0x18],
        ['M-x', 0xF8],
    ];
    const baseline = createCommandBindingModel(
        parseNethackrc('OPTIONS=number_pad'),
    );
    for (const [keyText, expected] of cases) {
        const parsed = parseNethackrc(
            `OPTIONS=number_pad\nBINDINGS=${keyText}:count`,
        );
        const model = createCommandBindingModel(parsed);
        assert.equal(model.specialKeys.count, expected, keyText);
        assert.equal(
            commandForKey(model, expected),
            commandForKey(baseline, expected),
            `${keyText} must not replace an extended-command binding`,
        );
    }

    const parsed = parseNethackrc(
        'OPTIONS=number_pad\nBINDINGS=x:count',
    );
    const state = resetParserTestGame('x12.');
    state.flags = parsed.flags;
    state.iflags = parsed.iflags;
    state.commandOperations = parsed.commandOperations;

    const key = await parseCommand(state);

    assert.equal(key, commandKeyCode('.'));
    assert.equal(state.commandCount, 12);
    assert.equal(state.multi, 11);
    assert.equal(state.nhDisplay.inputQueueLength, 0);
});

test('logical command reads compose altmeta across counts and number-pad input', async () => {
    // ESC followed by NUL or ESC remains a plain ESC command. Altmeta sets
    // the high bit: ASCII x (0x78) becomes M-x (0xF8). In number-pad mode,
    // ESC+4 composes M-4 (0x34 | 0x80 = 0xB4), which is runwest. A preceding
    // count digit must not break the later ESC+x composition.
    for (const following of [0, 0x1B]) {
        const state = resetParserTestGame([0x1B, following]);
        state.iflags.altmeta = true;
        assert.equal(await parseCommand(state), 0x1B);
        assert.equal(state.commandCount, 0);
        assert.equal(state.program_state.input_state, 'other');
        assert.equal(state.nhDisplay.inputQueueLength, 0);
    }

    const ordinary = resetParserTestGame([0x1B, 'x']);
    ordinary.iflags.altmeta = true;
    assert.equal(await parseCommand(ordinary), 0xF8);
    assert.equal(ordinary.nhDisplay.inputQueueLength, 0);

    const counted = resetParserTestGame(['1', 0x1B, 'x']);
    counted.iflags.altmeta = true;
    assert.equal(await parseCommand(counted), 0xF8);
    assert.equal(counted.commandCount, 1);
    assert.equal(counted.multi, 0);

    const numberPad = resetParserTestGame([0x1B, '4']);
    numberPad.iflags.num_pad = true;
    numberPad.iflags.altmeta = true;
    const metaFour = await parseCommand(numberPad);
    assert.equal(metaFour, 0xB4);
    assert.equal(
        commandForKey(numberPad.commandBindings, metaFour),
        'runwest',
    );
});

test('disabled altmeta leaves the byte after Escape queued', async () => {
    const state = resetParserTestGame([0x1B, 'x']);
    state.iflags.altmeta = false;

    assert.equal(await parseCommand(state), 0x1B);
    assert.equal(state.nhDisplay.inputQueueLength, 1);
    assert.equal(await parseCommand(state), commandKeyCode('x'));
    assert.equal(state.nhDisplay.inputQueueLength, 0);
});

test('parseCommand echoes a multi-digit count only at source boundaries', async () => {
    // Twelve is the smallest multi-digit count, so the first digit remains
    // silent and the second activates cmd.c get_count()'s Count message.
    const state = resetParserTestGame('12.');
    await ttyPline('Ready', state);
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        line: topLine(state),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });

    const key = await parseCommand(state);

    assert.equal(key, commandKeyCode('.'));
    assert.equal(state.commandCount, 12);
    assert.equal(state.lastCommandCount, 12);
    assert.equal(state.multi, 11);
    assert.equal(state.context.move, 1);
    assert.deepEqual(boundaries.map(({ line }) => line), [
        'Ready',
        'Ready',
        'Count: 12',
    ]);
    // The nine visible bytes in "Count: 12" leave the source cursor at 9.
    assert.deepEqual(boundaries.at(-1).cursor, [9, 0]);
    assert.equal(topLine(state), '');
});

test('count editing preserves erase, leading-zero, and cancellation branches', async () => {
    // boundaryLines records the top line immediately before each physical
    // byte read. A one-digit count stays silent; count > 9 and an erase
    // repaint "Count:". The control bytes are BS (0x08), DEL (0x7F), and ESC
    // (0x1B).
    const cases = [
        {
            name: 'backspace then append',
            keys: ['1', '2', 0x08, '3', '.'],
            key: commandKeyCode('.'),
            count: 13,
            multi: 12,
            boundaryLines: ['Ready', 'Ready', 'Count: 12', 'Count: 1',
                'Count: 13'],
        },
        {
            name: 'delete to zero',
            keys: ['1', 0x7F, '.'],
            key: commandKeyCode('.'),
            count: 0,
            multi: 0,
            boundaryLines: ['Ready', 'Ready', 'Count:'],
        },
        {
            name: 'leading zero',
            keys: ['0', '.'],
            key: commandKeyCode('.'),
            count: 0,
            multi: 0,
            boundaryLines: ['Ready', 'Ready'],
        },
        {
            name: 'escape cancellation',
            keys: ['1', '2', 0x1B],
            key: 0x1B,
            count: 0,
            multi: 0,
            boundaryLines: ['Ready', 'Ready', 'Count: 12'],
        },
    ];

    for (const entry of cases) {
        const state = resetParserTestGame(entry.keys);
        await ttyPline('Ready', state);
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push(topLine(state));

        const key = await parseCommand(state);

        assert.equal(key, entry.key, entry.name);
        assert.equal(state.commandCount, entry.count, entry.name);
        assert.equal(state.lastCommandCount, entry.count, entry.name);
        assert.equal(state.multi, entry.multi, entry.name);
        assert.deepEqual(boundaries, entry.boundaryLines, entry.name);
        assert.deepEqual(
            [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
            [0, 0],
            entry.name,
        );
        assert.equal(topLine(state), '', entry.name);
    }
});

test('parseCommand clears the physical message row but retains the final Count text as logical toplines', async () => {
    const state = resetParserTestGame('12.');
    // Fill the row with non-default glyph, color, and attribute values so
    // physical clearing is observable; "12." leaves "Count: 12" in logical
    // message history.
    for (let column = 0; column < state.nhDisplay.cols; ++column)
        state.nhDisplay.setCell(column, 0, 'X', 2, 3);
    state._pending_message = 'Ready';
    state._ttyToplines = 'Ready';
    state.nhDisplay.topMessage = 'Ready';
    state.nhDisplay.toplines = 'Ready';
    state.nhDisplay.toplin = 1;

    await parseCommand(state);

    assert.deepEqual(
        state.nhDisplay.grid[0],
        Array.from({ length: state.nhDisplay.cols }, () => ({
            ch: ' ', color: CLR_GRAY, attr: 0,
        })),
    );
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 0],
    );
    assert.equal(state._pending_message, '');
    assert.equal(state.nhDisplay.toplin, 0);
    assert.equal(state._ttyToplines, 'Count: 12');
    assert.equal(state.nhDisplay.topMessage, 'Count: 12');
    assert.equal(state.nhDisplay.toplines, 'Count: 12');
});

test('number-pad count prefix feeds the same saturating parser', async () => {
    // Five nines exceed NetHack's portable LARGEST_INT (32767), proving that
    // counts clamp rather than following JavaScript's larger integer range.
    const state = resetParserTestGame('n99999.');
    state.iflags.num_pad = true;

    const key = await parseCommand(state);

    assert.equal(key, commandKeyCode('.'));
    assert.equal(state.commandCount, 32767);
    assert.equal(state.multi, 32766);
    assert.equal(topLine(state), '');
});

test('a count prefix is retained before parsing or command dispatch',
    async () => {
    const replay = await runSegment({
        seed: 840003,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:CountTest,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
    });
    game.level.monlist = null;
    const initialDispatches = game._commandDispatchCount;
    game.nhDisplay.pushKey(commandKeyCode('3'));
    game.nhDisplay.pushKey(commandKeyCode('.'));
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('3'),
    );
    const rejected = heroCommandRetrySnapshot(replay);
    assert.deepEqual(game.context.pendingCommand, {
        phase: 'physical',
        key: commandKeyCode('3'),
    });
    assert.equal(game.nhDisplay.inputQueueLength, 1);
    assert.equal(game._commandDispatchCount, initialDispatches);

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('3'),
    );
    assert.deepEqual(heroCommandRetrySnapshot(replay), rejected);
});

test('a number-pad count prefix retains its physical retry phase', async () => {
    const replay = await runSegment({
        seed: 840003,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:NumpadCount,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,number_pad,pettype:none',
        moves: '',
    });
    game.level.monlist = null;
    const prefix = commandKeyCode('n');
    game.nhDisplay.pushKey(prefix);
    game.nhDisplay.pushKey(commandKeyCode('.'));

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === prefix,
    );
    const rejected = heroCommandRetrySnapshot(replay);
    assert.deepEqual(game.context.pendingCommand, {
        phase: 'physical',
        key: prefix,
    });
    assert.deepEqual(
        game.nhDisplay.terminal._inputQueue,
        [commandKeyCode('.')],
    );

    game.nhDisplay.cursorCol++;
    assert.notDeepEqual(heroCommandRetrySnapshot(replay), rejected);
    game.nhDisplay.cursorCol--;

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === prefix,
    );
    assert.deepEqual(heroCommandRetrySnapshot(replay), rejected);
});

test('the segment runner preserves output at an excluded count boundary',
    async () => {
    const replay = await runSegment({
        seed: 2026072001,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:BoundaryStop,role:Ranger,race:elf,'
            + 'gender:male,align:chaotic,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: '2.',
    });

    assert.equal(game._commandDispatchCount ?? 0, 0);
    assert.equal(game.multi ?? 0, 0);
    assert.equal(game.moves, 1);
    assert.equal(game.hero_seq ?? 0, 0);
    assert.equal(game.u.uhunger, 900);
    assert.deepEqual(game.context.pendingCommand, {
        phase: 'physical',
        key: commandKeyCode('2'),
    });
    assert.equal(replay.getScreens().length, 1);
    assert.equal(game.nhDisplay.inputQueueLength, 1);
});

test('the segment runner budget covers counts through the portable limit', () => {
    // Isolate the runner's arithmetic from later gameplay turn boundaries.
    // Every logical repeat plus the following input attempt fits inside the
    // finite guard, including the source's saturated count.
    for (const count of [1023, 1024, 1100, MAX_COMMAND_COUNT]) {
        const recipeLength = `${count}.`.length;
        assert.equal(
            segmentIterationLimit(recipeLength),
            Math.max(recipeLength * (MAX_COMMAND_COUNT + 1) + 1, 1024),
            `count ${count}`,
        );
        assert.ok(
            segmentIterationLimit(recipeLength) > count,
            `count ${count}`,
        );
    }
});

test('rhack clears menu and no-pickup prefix state on every entry', async () => {
    const state = resetParserTestGame('..');
    for (const firstTime of [true, false]) {
        state.iflags.menu_requested = true;
        state.context.nopick = 1;

        await rhack(firstTime ? 0 : commandKeyCode('.'), state);

        assert.equal(state.iflags.menu_requested, false);
        assert.equal(state.context.nopick, 0);
        assert.equal(state.context.move, 1);
    }
});

test('monster_nearby applies hostility, concealment, helplessness, and sensing', () => {
    const { state, monster } = resetSafeWaitTestGame();
    assert.equal(monsterNearby(state), true);

    monster.mpeaceful = true;
    assert.equal(monsterNearby(state), false);
    state.u.uprops[HALLUC] = { intrinsic: 1, extrinsic: 0 };
    assert.equal(monsterNearby(state), true);

    monster.m_ap_type = M_AP_FURNITURE;
    assert.equal(monsterNearby(state), false);
    monster.m_ap_type = 0;
    monster.msleeping = true;
    assert.equal(monsterNearby(state), false);
    monster.msleeping = false;
    state.viz_array[monster.my][monster.mx] = 0;
    assert.equal(monsterNearby(state), false);
});

test('safe wait rejects a nearby hostile with the bound force prefix', async () => {
    const { state } = resetSafeWaitTestGame(
        'OPTIONS=!cmdassist\nBINDINGS=x:reqmenu',
    );
    const model = createCommandBindingModel(state);
    assert.equal(keyForCommand(model, 'reqmenu'), commandKeyCode('x'));

    state.nhDisplay.pushKey(commandKeyCode('.'));
    await rhack(0, state);
    assert.equal(
        state._pending_message,
        "Are you waiting to get hit?  Use 'x' prefix to force a no-op (to rest).",
    );
    assert.equal(state.context.move, 0);
    assert.equal(state.did_nothing_flag, 1);

    state.nhDisplay.pushKey(commandKeyCode('.'));
    await rhack(0, state);
    assert.equal(state._pending_message, 'Are you waiting to get hit?');
    assert.equal(state.context.move, 0);
    assert.equal(state.did_nothing_flag, 2);

    state.nhDisplay.pushKey(commandKeyCode('.'));
    await rhack(0, state);
    assert.equal(state._pending_message, '');
    assert.equal(state.context.move, 0);
    assert.equal(state.did_nothing_flag, 3);
});

test('reqmenu prefix stops before consuming its following command', async () => {
    const { state } = resetSafeWaitTestGame(
        'OPTIONS=!cmdassist\nBINDINGS=x:reqmenu',
    );
    state.nhDisplay.pushKey(commandKeyCode('x'));
    state.nhDisplay.pushKey(commandKeyCode('.'));

    await assert.rejects(
        rhack(0, state),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('x'),
    );
    const rejected = structuredClone({
        context: state.context,
        iflags: state.iflags,
        input: state.nhDisplay.terminal._inputQueue,
        pendingMessage: state._pending_message,
    });
    await assert.rejects(
        rhack(0, state),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('x'),
    );

    assert.deepEqual(structuredClone({
        context: state.context,
        iflags: state.iflags,
        input: state.nhDisplay.terminal._inputQueue,
        pendingMessage: state._pending_message,
    }), rejected);
    assert.equal(state.context.move, 0);
    assert.equal(state.iflags.menu_requested, false);
    assert.equal(state.did_nothing_flag ?? 0, 0);
    assert.equal(state.nhDisplay.inputQueueLength, 1);
});

test('dangerous hero properties reject waiting and success resets its counter', async () => {
    const { state, monster } = resetSafeWaitTestGame('OPTIONS=!cmdassist');
    state.level.monsters[monster.mx][monster.my] = null;
    state.level.monlist = null;
    state.u.uprops[STONED] = { intrinsic: 1, extrinsic: 0 };

    await rhack(commandKeyCode('.'), state);
    assert.equal(
        state._pending_message,
        "Waiting doesn't feel like a good idea right now.",
    );
    assert.equal(state.context.move, 0);
    assert.equal(state.did_nothing_flag, 1);

    state.u.uprops[STONED].intrinsic = 0;
    await rhack(commandKeyCode('.'), state);
    assert.equal(state.context.move, 1);
    assert.equal(state.did_nothing_flag, 0);
});

test('run, rush, search, and pickup bytes remain atomic boundaries',
    async () => {
    const cases = [
        { name: 'run', key: 'x', binding: 'BINDINGS=x:runwest' },
        { name: 'rush', key: 'x', binding: 'BINDINGS=x:rushwest' },
        { name: 'search', key: 's', binding: '' },
        { name: 'pickup', key: ',', binding: '' },
    ];
    for (const commandCase of cases) {
        const replay = await runSegment({
            seed: 840004,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:ExcludedCommand,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen\n'
                + commandCase.binding,
            moves: '',
        });
        const key = commandKeyCode(commandCase.key);
        const initialDispatches = game._commandDispatchCount;
        game.nhDisplay.pushKey(key);
        await assert.rejects(
            moveloop_core(),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && error.key === key,
            commandCase.name,
        );
        const rejected = heroCommandRetrySnapshot(replay);
        await assert.rejects(
            moveloop_core(),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && error.key === key,
            commandCase.name,
        );
        assert.deepEqual(heroCommandRetrySnapshot(replay), rejected);
        assert.equal(game._commandDispatchCount, initialDispatches);
    }
});

test('moveloop allocates live monster movement once after elapsed input', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MovementAllocation,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen',
        // Dismiss the startup message boundary, then stop at command input.
        moves: ' ',
    });
    assert.equal(game.program_state.in_moveloop, 1);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.u.uhunger, 900);

    const tail = {
        data: { mmove: 6 }, mspeed: 0, movement: 11, mhp: 1, nmon: null,
    };
    const dead = {
        data: { mmove: 7 }, mspeed: 0, movement: 13, mhp: 0, nmon: tail,
    };
    const head = {
        data: { mmove: 5 }, mspeed: 0, movement: 7, mhp: 1, nmon: dead,
    };
    game.level.monlist = head;
    game.iflags.purge_monsters = 1;
    game.vision_full_recalc = 0;
    game.context.seer_turn = 2;
    initRng(918273);
    enableRngLog();
    const west = game.level.at(game.u.ux - 1, game.u.uy);
    west.typ = STONE;

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.deepEqual(getRngLog(), []);
    assert.equal(game.moves, 1);
    assert.equal(game.u.uhunger, 900);

    // A wall refusal consumes no time after exposing the elapsed phase.
    game.nhDisplay.pushKey(commandKeyCode('h'));
    await moveloop_core();
    assert.equal(game.level.monlist, head);
    assert.equal(head.nmon, tail);
    assert.equal(tail.nmon, null);
    assert.equal(dead.nmon, null);
    assert.equal(game.iflags.purge_monsters, 0);
    assert.deepEqual([head.movement, tail.movement], [19, 11]);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.moves, 2);
    assert.equal(game.hero_seq, 17);
    assert.equal(game.u.uhunger, 899);
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/u, '')),
        // This generated level has a fountain but no sink, so dosounds()
        // owns the 1-in-400 gate in place of the old fixed 1-in-300 draw.
        // Its Dexterity 9 makes engraving wear use 40 + 9 * 3 = 67.
        ['rn2(12)', 'rn2(12)', 'rn2(70)', 'rn2(400)', 'rn2(20)',
            'rn2(67)', 'rn2(31)'],
    );
    const cadenceValue = Number(getRngLog().at(-1).split('=').at(-1));
    assert.equal(game.context.seer_turn, 2 + cadenceValue + 15);

    const elapsedLog = [...getRngLog()];
    const elapsedMovement = [head.movement, tail.movement];
    game.nhDisplay.pushKey(commandKeyCode('h'));
    await moveloop_core();
    assert.equal(game.context.move, 0);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.moves, 2);
    assert.equal(game.hero_seq, 17);
    assert.equal(game.u.uhunger, 899);
    assert.deepEqual([head.movement, tail.movement], elapsedMovement);
    assert.deepEqual(getRngLog(), elapsedLog);

    // Blocked movement does not advance the source turn counter. The
    // synthetic monsters deliberately omit mcanmove, so
    // they spend an available ration without taking a map action. This
    // isolates the next allocation boundary from movement-path randomness.
    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.equal(game.moves, 2);
    assert.equal(game.u.uhunger, 899);
    assert.deepEqual(getRngLog(), elapsedLog);
    game.nhDisplay.pushKey(commandKeyCode('h'));
    await moveloop_core();
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.equal(game.moves, 3);
    // moves * 8 + one completed hero action is the source sequence owner.
    assert.equal(game.hero_seq, 25);
    assert.equal(game.u.uhunger, 898);
    // The head spends NORMAL_SPEED from 19; the tail's 11 is below the
    // action threshold and remains untouched.
    assert.deepEqual([head.movement, tail.movement], [7, 11]);
    assert.deepEqual(
        getRngLog().slice(elapsedLog.length)
            .map((entry) => entry.replace(/=.*/u, '')),
        // The second elapsed turn repeats allocation, generation, sound,
        // region, and engraving gates. Clairvoyance is not due this turn.
        ['rn2(12)', 'rn2(12)', 'rn2(70)', 'rn2(400)', 'rn2(20)',
            'rn2(67)'],
    );
    await assert.rejects(
        moveloop_core(),
        /Input queue empty/u,
    );
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('first-turn fog upkeep and later monster work stay source-owned', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:PreRationMonsterWork,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,!acoustics',
        moves: ' ',
    });
    const x = game.u.ux + 1;
    const y = game.u.uy;
    const square = game.level.at(x, y);
    square.typ = ROOM;
    square.flags = square.doormask = 0;
    const fogCloud = {
        data: game.mons[PM_FOG_CLOUD],
        mnum: PM_FOG_CLOUD,
        m_id: 9901,
        mhp: 1,
        mhpmax: 1,
        mlstmv: game.moves,
        movement: 0,
        mstate: MON_FLOOR,
        mx: x,
        my: y,
        nmon: null,
    };
    game.level.monlist = fogCloud;
    game.level.monsters[x][y] = fogCloud;
    game.level.regions = [];
    game.level.at(game.u.ux - 1, game.u.uy).typ = STONE;

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    const unchanged = {
        hunger: game.u.uhunger,
        moves: game.moves,
        movement: game.u.umovement,
    };
    game.nhDisplay.pushKey(commandKeyCode('h'));

    await moveloop_core();
    assert.equal(game.moves, unchanged.moves + 1);
    assert.equal(game.u.uhunger, unchanged.hunger - 1);
    assert.equal(game.u.umovement, NORMAL_SPEED);
    assert.equal(game.level.regions.length, 1);
    assert.equal(game.level.regions[0].visible, true);
    assert.deepEqual(game.level.regions[0].monsters, [fogCloud.m_id]);
    assert.equal(game.nhDisplay.inputQueueLength, 0);

    // movemon_singlemon() runs fog upkeep before its movement-ration gate.
    // The live second-turn scan must recreate the cloud even though it has no
    // movement ration, then proceed through the next input boundary.
    game.level.regions = [];
    fogCloud.movement = 0;
    game.context.move = 1;
    game.nhDisplay.pushKey(commandKeyCode('h'));
    const beforeFogBoundary = {
        hunger: game.u.uhunger,
        moves: game.moves,
        movement: game.u.umovement,
    };
    await moveloop_core();
    assert.equal(game.moves, beforeFogBoundary.moves + 1);
    assert.equal(game.u.uhunger, beforeFogBoundary.hunger - 1);
    assert.equal(game.u.umovement, beforeFogBoundary.movement);
    assert.equal(game.level.regions.length, 1);
    assert.deepEqual(game.level.regions[0].monsters, [fogCloud.m_id]);
    assert.equal(game.nhDisplay.inputQueueLength, 0);

    // A later parked guard remains outside the live monster-action boundary,
    // even when dead and below a movement ration.
    game.level.monsters[x][y] = null;
    game.level.monlist = {
        isgd: true,
        mhp: 0,
        mlstmv: game.moves - 1,
        movement: 0,
        mstate: MON_FLOOR,
        mx: 0,
        my: 0,
        nmon: null,
    };
    game.context.move = 1;
    game.nhDisplay.pushKey(commandKeyCode('~'));
    const parked = {
        hunger: game.u.uhunger,
        moves: game.moves,
        movement: game.u.umovement,
    };
    // The elapsed path used to reject here with a replay-boundary message.
    // Every turn now runs the general path, so the real monster-action
    // boundary is what stops it, and it names the branch it could not take.
    await assert.rejects(
        moveloop_core(),
        /parked guard handling/u,
    );
    assert.deepEqual({
        hunger: game.u.uhunger,
        moves: game.moves,
        movement: game.u.umovement,
    }, parked);
    assert.equal(game.nhDisplay.inputQueueLength, 1);
});

test('hero fog upkeep keeps its every-input region owner', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:HeroFogWork,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,!acoustics',
        moves: '',
    });
    game.youmonst.data = game.mons[PM_FOG_CLOUD];
    game.level.regions = [];
    game.level.at(game.u.ux - 1, game.u.uy).typ = STONE;
    game.nhDisplay.pushKey(commandKeyCode('h'));

    await moveloop_core();

    assert.equal(game.moves, 1);
    assert.equal(game.level.regions.length, 1);
    assert.equal(game.level.regions[0].visible, true);
    assert.equal(
        game.level.regions[0].bounding_box.lx <= game.u.ux
            && game.level.regions[0].bounding_box.hx >= game.u.ux
            && game.level.regions[0].bounding_box.ly <= game.u.uy
            && game.level.regions[0].bounding_box.hy >= game.u.uy,
        true,
    );
});

test('moveloop zero generation gate creates before the next allocation', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:RuntimeGeneration,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,!acoustics',
        // Dismiss startup, then let the test drive command boundaries.
        moves: ' ',
    });

    // Remove startup monsters from both source-owned indexes so allocation is
    // drawless and rn2(70) is the first core draw at the elapsed boundary.
    for (let monster = game.level.monlist; monster; monster = monster.nmon) {
        game.level.monsters[monster.mx][monster.my] = null;
    }
    game.level.monlist = null;
    game.iflags.purge_monsters = 0;
    game.vision_full_recalc = 0;
    // ISAAC seed 167's first core value is zero modulo 70, forcing the rare
    // allmain.c:maybe_generate_rnd_mon() branch without mocking makemon().
    initRng(167);
    enableRngLog();
    game.level.at(game.u.ux - 1, game.u.uy).typ = STONE;

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    game.nhDisplay.pushKey(commandKeyCode('h'));
    await moveloop_core();

    const created = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        created.push(monster);
    assert.ok(created.length > 0);
    assert.equal(getRngLog()[0], 'rn2(70)=0');
    assert.ok(created.every((monster) => !monster.mgenmklev));
    assert.ok(created.every((monster) => monster.movement === 0));

    // The wall refusal consumed no time. A following wait, then another wall
    // refusal, reaches the next allocation and live-action round for the same
    // nodes. Any allocated ration is spent before the prompt.
    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    game.nhDisplay.pushKey(commandKeyCode('h'));
    await moveloop_core();
    assert.ok(created.every(
        (monster) => monster.movement >= 0
            && monster.movement < NORMAL_SPEED,
    ));
});

test('a fast hero spends surplus movement without allocating a new turn', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:FastSurplus,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
    });
    game.level.monlist = null;
    game.u.uprops[FAST].intrinsic = INTRINSIC;
    // After rn2(70), seed 918273 yields zero for rn2(3), granting the
    // ordinary Fast tier's extra 12-point movement ration.
    initRng(918273);
    enableRngLog();

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.equal(game.moves, 1);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.u.uhunger, 900);

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.equal(game.moves, 2);
    assert.equal(game.u.umovement, 24);
    assert.equal(game.hero_seq, 17);
    assert.equal(game.u.uhunger, 899);
    assert.ok(getRngLog().includes('rn2(3)=0'));
    const allocatedLog = [...getRngLog()];

    game.context.seer_turn = 2;
    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.equal(game.moves, 2);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.hero_seq, 18);
    assert.equal(game.u.uhunger, 899);
    assert.equal(getRngLog().length, allocatedLog.length + 1);
    assert.match(getRngLog().at(-1), /^rn2\(31\)=/u);
    const cadenceValue = Number(getRngLog().at(-1).split('=').at(-1));
    assert.equal(game.context.seer_turn, 2 + cadenceValue + 15);
});

test('moveloop blocks an actionable monster before fast-hero state changes', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MonsterAction,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const monster = {
        data: { mmove: 12 }, movement: 12, mhp: 1, nmon: null,
        // C's mcanmove is a bitfield every real monster carries. Without it
        // assertSimpleActionState() returns early and never checks anything,
        // so this fixture would not be the actionable monster it claims.
        mcanmove: true,
        mx: game.u.ux + 1,
        my: game.u.uy,
    };
    game.level.monlist = monster;
    game.u.umovement = 24;
    game.context.move = 1;
    const before = {
        dispatches: game._commandDispatchCount,
        heroSeq: game.hero_seq,
        hunger: game.u.uhunger,
        moves: game.moves,
    };
    game.nhDisplay.pushKey(commandKeyCode('~'));

    // The replay path rejected with a generic message. The real boundary
    // names the branch it could not take.
    await assert.rejects(
        moveloop_core(),
        /monster attack on the hero/u,
    );
    assert.equal(game.u.umovement, 24);
    assert.equal(monster.movement, 12);
    assert.equal(game.nhDisplay.inputQueueLength, 1);
    assert.deepEqual({
        dispatches: game._commandDispatchCount,
        heroSeq: game.hero_seq,
        hunger: game.u.uhunger,
        moves: game.moves,
    }, before);
});


test('movement repeat counts preserve the COLNO sentinel threshold', async () => {
    await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MoveSentinel,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
    });
    game.level.monlist = null;
    const start = [game.u.ux, game.u.uy];
    const destination = game.level.at(start[0] + 1, start[1]);
    destination.typ = ROOM;
    destination.flags = destination.doormask = 0;

    for (const [initial, expected] of [
        [2, 1],
        [COLNO, COLNO],
        [COLNO + 1, COLNO + 1],
    ]) {
        game.u.ux = start[0];
        game.u.uy = start[1];
        game.u.dx = 1;
        game.u.dy = 0;
        game.context.mv = 1;
        game.context.run = 1;
        game.context.move = 0;
        game.multi = initial;

        await moveloop_core();

        assert.equal(game.multi, expected, `initial multi ${initial}`);
    }
});

test('all source direction families dispatch their exact movement intent', async () => {
    // cmd.c's default vi order is h/y/k/u/l/n/j/b for
    // W/NW/N/NE/E/SE/S/SW. Lowercase walks with run=0, uppercase runs with
    // run=1, and Ctrl-letter rushes with run=3.
    await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MoveIntents,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
    });
    // Every destination tile is overwritten below; seed 840004 supplies only
    // deterministic startup state, not a favorable terrain fixture.
    const start = [game.u.ux, game.u.uy];
    const directions = [
        ['h', -1, 0], ['y', -1, -1], ['k', 0, -1], ['u', 1, -1],
        ['l', 1, 0], ['n', 1, 1], ['j', 0, 1], ['b', -1, 1],
    ];
    const modes = [
        ['walk', (key) => key.charCodeAt(0), 0],
        ['run', (key) => key.toUpperCase().charCodeAt(0), 1],
        ['rush', (key) => key.toUpperCase().charCodeAt(0) & 0x1F, 3],
    ];
    game.level.traps = [];
    game.level.regions = [];
    game.head_engr = null;

    for (const [mode, keyCode, expectedRun] of modes) {
        for (const [key, dx, dy] of directions) {
            resetCommandVars(game);
            game.u.ux = start[0];
            game.u.uy = start[1];
            const x = start[0] + dx;
            const y = start[1] + dy;
            const square = game.level.at(x, y);
            square.typ = ROOM;
            square.flags = square.doormask = 0;
            game.level.monsters[x][y] = null;
            game.level.objects[x][y] = null;

            await rhack(keyCode(key), game);

            assert.deepEqual(
                [game.u.dx, game.u.dy, game.u.dz],
                [dx, dy, 0],
                `${mode} ${key}`,
            );
            assert.equal(game.context.run, expectedRun, `${mode} ${key}`);
            assert.equal(
                game.context.mv,
                expectedRun ? 1 : 0,
                `${mode} ${key}`,
            );
            assert.deepEqual(
                [game.u.ux, game.u.uy],
                [start[0] + dx, start[1] + dy],
                `${mode} ${key}`,
            );
        }
    }
});

test('a first-time altmeta number-pad run remains an atomic boundary',
    async () => {
    await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:RunIntent,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'number_pad,altmeta',
        moves: '',
    });
    const start = [game.u.ux, game.u.uy];
    const west = game.level.at(start[0] - 1, start[1]);
    west.typ = ROOM;
    west.flags = west.doormask = 0;
    // Any nonzero sentinel proves first-time running resets last_str_turn to
    // zero. With number_pad+altmeta, ESC followed by 4 composes M-4, the
    // runwest binding.
    game.u.last_str_turn = 99;
    game.nhDisplay.pushKey(0x1B);
    game.nhDisplay.pushKey(commandKeyCode('4'));

    await assert.rejects(
        rhack(0, game),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === 0xB4,
    );

    assert.deepEqual([game.u.ux, game.u.uy], start);
    assert.equal(game.context.run ?? 0, 0);
    assert.equal(game.context.mv ?? 0, 0);
    assert.equal(game.multi ?? 0, 0);
    assert.equal(game.u.last_str_turn, 99);
});

test('runtime dispatch applies a configured movement binding', async () => {
    await runSegment({
        // This seed was selected because the west square is ordinary open
        // floor, isolating binding and intent from collision behavior.
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MoveTest,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen\n'
            + 'BINDINGS=x:movewest',
        moves: '',
    });
    const start = [game.u.ux, game.u.uy];
    game.nhDisplay.pushKey(commandKeyCode('x'));

    await rhack(0);

    assert.deepEqual([game.u.dx, game.u.dy, game.u.dz], [-1, 0, 0]);
    assert.deepEqual([game.u.ux, game.u.uy], [start[0] - 1, start[1]]);
    assert.equal(game.u.umoved, true);
    assert.equal(game.context.move, 1);
    assert.equal(game._commandDispatchCount, 1);
});
