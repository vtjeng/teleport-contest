import assert from 'node:assert/strict';
import test from 'node:test';

import {
    commandForKey,
    commandKeyCode,
    createCommandBindingModel,
    keyForCommand,
} from '../js/command_bindings.js';
import {
    moveloop_core,
    UnsupportedTurnBoundaryError,
} from '../js/allmain.js';
import {
    failClosedCommandRefusals,
    MAX_COMMAND_COUNT,
    parseCommand,
    resetCommandVars,
    rhack,
    UnsupportedHeroCommandBoundaryError,
} from '../js/cmd.js';
import {
    UnsupportedEatError,
    UnsupportedHungerTransitionError,
} from '../js/eat.js';
import {
    ALTAR,
    COLNO,
    CORR,
    CROSSWALL,
    DO_MOVE,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    DOOR,
    FAST,
    FOUNTAIN,
    GRAVE,
    HALLUC,
    HWALL,
    ICE,
    IN_SIGHT,
    INTRINSIC,
    LADDER,
    M_AP_FURNITURE,
    MON_FLOOR,
    NORMAL_SPEED,
    PASSES_WALLS,
    PIT,
    ROOM,
    ROWNO,
    SDOOR,
    SINK,
    BLINDED,
    STAIRS,
    STATUE_TRAP,
    STONE,
    STONED,
    TDWALL,
    THRONE,
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
import { flush_screen } from '../js/display.js';
import {
    CORPSE,
    DAGGER,
    DART,
    FOOD_CLASS,
    objects_globals_init,
    PICK_AXE,
    SACK,
    TOOL_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { game, resetGame } from '../js/gstate.js';
import { UnsupportedFeatureDescriptionError } from '../js/invent.js';
import {
    domove,
    monsterNearby,
    test_move,
    UnsupportedHeroMoveBoundaryError,
} from '../js/hack.js';
import { runSegment, segmentIterationLimit } from '../js/jsmain.js';
import { stairway_find_dir } from '../js/stairs.js';
import {
    AT_CLAW,
    M1_NEEDPICK,
    M1_TUNNEL,
    PM_FOG_CLOUD,
    PM_NEWT,
    S_FELINE,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
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
                await test_move(ux, uy, 1, 0, DO_MOVE, state, env),
                false,
            );
        }
        destination.typ = STONE;
        assert.equal(
            await test_move(ux, uy, 1, 0, DO_MOVE, state, env),
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
        assert.equal(await test_move(ux, uy, 1, 0, DO_MOVE, state, env), false);
        assert.deepEqual(messages, ["(east): It's a wall."]);

        // mention_walls is the exact source output gate. The refusal itself
        // remains in force when the option is disabled.
        state.flags.mention_walls = false;
        destination.typ = VWALL;
        assert.equal(
            await test_move(ux, uy, 1, 0, DO_MOVE, state, {
                message: () => assert.fail('disabled wall message'),
            }),
            false,
        );

        // ROOM is outside this ported test_move() branch and remains legal.
        destination.typ = ROOM;
        assert.equal(await test_move(ux, uy, 1, 0, DO_MOVE, state), true);
    });

// C ref: hack.c:1014-1045. Before its closing "It's solid stone." else, the
// obstacle arm asks four questions about the hero, and every answer diverges
// from the refusal this port gives: Passes_walls falls through the arm and can
// answer TRUE, Underwater prints a different line, a tunneller that needs no
// pick eats the rock, and autodig with a wielded pick digs. None is ported, so
// each has to raise rather than answer FALSE.
test('the obstacle arm refuses the four hero states C answers differently',
    async () => {
        // Interior coordinate and an eastward step, as in the wall case above:
        // it keeps isok() and the map edge out of the result.
        const ux = 10;
        const uy = 10;

        function obstacleState() {
            const state = {
                // mention_walls on so a state that fails to refuse reaches the
                // message hook, which fails the case rather than passing it
                // quietly.
                flags: { mention_walls: true },
                context: {},
                level: new GameMap(),
                u: { ux, uy, uprops: [], uinwater: 0 },
                youmonst: { data: { mflags1: 0 } },
            };
            objects_globals_init(state);
            state.level.at(ux + 1, uy).typ = STONE;
            return state;
        }

        function step(state) {
            return test_move(ux, uy, 1, 0, DO_MOVE, state, {
                message: () => assert.fail('refused arm printed a wall line'),
            });
        }

        // hack.c:1014. The port refuses on Passes_walls alone, without
        // may_passwall(), so the extrinsic form has to stop here too.
        const passwall = obstacleState();
        passwall.u.uprops[PASSES_WALLS] = { intrinsic: 1, extrinsic: 0 };
        await assert.rejects(() => step(passwall), {
            name: 'UnsupportedHeroMoveBoundaryError',
            reason: 'obstacle passed rather than blocking',
        });

        // hack.c:1016. u.uinwater, not a property slot.
        const underwater = obstacleState();
        underwater.u.uinwater = 1;
        await assert.rejects(() => step(underwater), {
            name: 'UnsupportedHeroMoveBoundaryError',
            reason: 'obstacle passed rather than blocking',
        });

        // hack.c:1037 reads both flags, so a dwarf -- M1_TUNNEL and
        // M1_NEEDPICK together -- keeps the ordinary refusal and its line.
        const tunneller = obstacleState();
        tunneller.youmonst.data.mflags1 = M1_TUNNEL;
        await assert.rejects(() => step(tunneller), {
            name: 'UnsupportedHeroMoveBoundaryError',
            reason: 'obstacle passed rather than blocking',
        });
        const dwarf = obstacleState();
        dwarf.youmonst.data.mflags1 = M1_TUNNEL | M1_NEEDPICK;
        const dwarfLines = [];
        assert.equal(
            await test_move(ux, uy, 1, 0, DO_MOVE, dwarf, {
                message: (line) => dwarfLines.push(line),
            }),
            false,
        );
        assert.deepEqual(dwarfLines, ["It's solid stone."]);

        // hack.c:1042's four terms. PICK_AXE is TOOL_CLASS with oc_skill
        // P_PICK_AXE, which is what is_pick() reads.
        const digger = obstacleState();
        digger.flags.autodig = true;
        digger.uwep = { oclass: TOOL_CLASS, otyp: PICK_AXE };
        await assert.rejects(() => step(digger), {
            name: 'UnsupportedHeroMoveBoundaryError',
            reason: 'automatic digging',
        });

        // Each of the other three terms alone returns the arm to its ordinary
        // refusal, which is what keeps the guard from being wider than C.
        for (const suppress of [
            (state) => { state.flags.autodig = false; },
            (state) => { state.context.run = 1; },
            (state) => { state.context.nopick = 1; },
            // A dagger is WEAPON_CLASS with oc_skill P_DAGGER, so is_pick()
            // answers FALSE and C prints the wall line instead of digging.
            (state) => { state.uwep = { oclass: WEAPON_CLASS, otyp: DAGGER }; },
            (state) => { state.uwep = null; },
        ]) {
            const state = obstacleState();
            state.flags.autodig = true;
            state.uwep = { oclass: TOOL_CLASS, otyp: PICK_AXE };
            suppress(state);
            const lines = [];
            assert.equal(
                await test_move(ux, uy, 1, 0, DO_MOVE, state, {
                    message: (line) => lines.push(line),
                }),
                false,
            );
            assert.deepEqual(lines, ["It's solid stone."]);
        }
    });

test('blind obstacle refusal records exact tactile viewing vectors',
    async () => {
        // C display.c seenv_matrix. Keep this oracle independent of the
        // production table so a directional-table mutation cannot update both
        // the implementation and its expected value.
        const expectedSeenvMatrix = [
            [0x04, 0x02, 0x01],
            [0x08, 0xFF, 0x80],
            [0x10, 0x20, 0x40],
        ];
        assert.deepEqual(seenv_matrix, expectedSeenvMatrix);
        await runSegment({
            seed: 840002,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:BlindWall,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,blind,pettype:none',
            moves: '',
        });
        game.flags.mention_walls = false;
        const heroLastSeenType = 0x7F;
        game.level.lastseentyp[game.u.ux][game.u.uy] = heroLastSeenType;
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
                    game.level.lastseentyp[x][y] = 0x7E;

                    assert.equal(
                        await test_move(
                            game.u.ux,
                            game.u.uy,
                            dx,
                            dy,
                            DO_MOVE,
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
                        expectedSeenvMatrix[1 - dy][dx + 1],
                    );
                    assert.ok(destination.remembered_glyph);
                    assert.equal(
                        destination.disp_ch,
                        destination.remembered_glyph.ch,
                    );
                    assert.equal(
                        game.level.lastseentyp[x][y],
                        typ,
                        'feel_location records the tactile terrain type',
                    );
                    assert.equal(
                        game.level.lastseentyp[game.u.ux][game.u.uy],
                        heroLastSeenType,
                        'feel_location does not rewrite unrelated cells',
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
            await test_move(game.u.ux, game.u.uy, 1, 0, DO_MOVE, game, {
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
        commandOutput: {
            didNothingFlag: game.did_nothing_flag,
            disp: structuredClone(game.disp),
        },
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
        go: structuredClone(game.go),
        gw: structuredClone(game.gw),
        hero: structuredClone(game.u),
        iflags: structuredClone(game.iflags),
        parser: {
            cmdKey: game.cmdKey,
            commandCount: game.commandCount,
            dispatchCount: game._commandDispatchCount,
            lastCommandCount: game.lastCommandCount,
        },
        programState: structuredClone(game.program_state),
        input: {
            queue: [...(game.nhDisplay.terminal._inputQueue ?? [])],
            waiting: game.nhDisplay.isWaitingForInput,
        },
        multi: game.multi,
        monsters: (() => {
            const monsters = [];
            for (let monster = game.level.monlist;
                monster;
                monster = monster.nmon) {
                const { nmon: _next, ...fields } = monster;
                monsters.push(structuredClone(fields));
            }
            return monsters;
        })(),
        output: {
            animations: structuredClone(retained(
                replay.getAnimationFramesByStep(),
            )),
            cursors: structuredClone(retained(replay.getCursors())),
            lastRngIndex: replay._lastRngIdx,
            pendingAnimations: structuredClone(
                replay._pendingAnimFrames,
            ),
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
            displayContext: {
                a: game.displayCtx.a,
                b: game.displayCtx.b,
                c: game.displayCtx.c,
                m: [...game.displayCtx.m],
                n: game.displayCtx.n,
                r: [...game.displayCtx.r],
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
            // ICE is rm.h:88's next type after ALTAR, so it is the terrain
            // just outside IS_FURNITURE()'s range and the one that pins its
            // upper bound. Its own arm of dfeature_at() calls ice_descr(),
            // which is unported.
            name: 'ice terrain',
            reason: 'door or special terrain movement',
            setup: ({ destination }) => {
                destination.typ = ICE;
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
            // ICE, the type immediately past ALTAR, stands for terrain
            // outside IS_FURNITURE()'s range now that the seven types inside
            // it are admitted.
            name: 'special terrain',
            reason: 'door or special terrain movement',
            install: ({ destination }) => {
                destination.typ = ICE;
            },
            remove: ({ destination }) => {
                destination.typ = ROOM;
            },
        },
        // A doorless or open doorway is now an admitted destination
        // (hack.c test_move() reaches only its testdiag arm for those), and so
        // are the two masks closed_door() answers TRUE for: autoopen pulls at
        // a plain D_CLOSED door and names a plain D_LOCKED one. The masks
        // below are the ones left. The two carrying D_TRAPPED alongside
        // D_CLOSED or D_LOCKED reach doopen_indir(), whose D_TRAPPED tail
        // fires the door trap and bills a shop; the other two reach the
        // ordinary destination checks, where D_BROKEN is doorless to
        // test_move() but has its own dfeature_at() description and no
        // recording.
        ...[
            ['broken door', D_BROKEN, 'door or special terrain movement'],
            [
                'trapped open door',
                D_ISOPEN | D_TRAPPED,
                'door or special terrain movement',
            ],
            [
                'trapped closed door',
                D_CLOSED | D_TRAPPED,
                'trapped or unusual door',
            ],
            // D_LOCKED | D_TRAPPED is deliberately absent: lock.c:855 tests
            // only D_CLOSED, so 0x18 takes the message switch and returns
            // before the b_trapped() tail, and the port serves it. The
            // 'trapped closed door' row above is the mask that stays refused,
            // because its roll can reach that tail.
        ].map(([name, mask, reason]) => ({
            name,
            reason,
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
        // pickup.c describe_decor() owns the line an arrival on a decorated
        // square prints when mention_decor is on, and tracks iflags.prev_decor
        // across arrivals; neither is ported.
        {
            name: 'stairs arrival with mention_decor',
            reason: 'decor description',
            install: ({ destination }) => {
                game.flags.mention_decor = true;
                destination.typ = STAIRS;
            },
            remove: ({ destination }) => {
                game.flags.mention_decor = false;
                destination.typ = ROOM;
            },
        },
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
        // Every case moves one square; the diagonal ones carry their own
        // offset and movement key so that the same retry snapshot covers both
        // orientations.
        const moveKey = refusal.key ?? 'l';
        const x = game.u.ux + (refusal.dx ?? 1);
        const y = game.u.uy + (refusal.dy ?? 0);
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
        game.cmdKey = commandKeyCode('k');
        game.commandCount = 17;
        game.lastCommandCount = 19;

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
        Object.assign(expected.parser, {
            cmdKey: commandKeyCode(moveKey),
            commandCount: 0,
            lastCommandCount: 0,
        });
        expected.context.pendingCommand = {
            phase: 'parsed',
            key: commandKeyCode(moveKey),
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

        game.nhDisplay.pushKey(commandKeyCode(moveKey));
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
            expected.parser.dispatchCount = initialDispatches + 1;
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
                initialDispatches + 1,
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
            initialDispatches + 1,
            refusal.name,
        );
    }
});

// hack.c doorless_door() masks off D_NODOOR and D_BROKEN together, so
// test_move()'s exit arm lets the hero step diagonally off either one. The
// destination seam refuses D_BROKEN as an arrival, so the only way to observe
// that half of the predicate is to place the hero on one directly.
test('a diagonal pet swap stops rather than refusing silently', async () => {
    // A hero on a doorway that still has its door may not step out of it
    // diagonally, and C reaches that refusal through do_attack() rather than
    // before it. uhitm.c:474 evaluates `foo = (Punished || !rn2(7) || ...)`
    // inside the is_safemon branch, so C spends a draw even for the pet the
    // hero would otherwise swap with, then returns FALSE and lets
    // test_move()'s exit rule decline the step. The port does have do_attack()
    // (js/uhitm.js:51) and spends that draw on an ordinary swap, but domove()
    // runs test_move() before it, the reverse of hack.c, so admitting this
    // step would refuse it without ever reaching the draw. It fails closed
    // instead.
    const replay = await runSegment({
        seed: 840024,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:PetDoorway,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const pet = game.level.monlist;
    assert.ok(pet?.mtame, 'the starting pet is on the level');
    const [x, y] = [game.u.ux + 1, game.u.uy - 1];
    game.level.at(game.u.ux, game.u.uy).typ = DOOR;
    game.level.at(game.u.ux, game.u.uy).flags = D_ISOPEN;
    const destination = game.level.at(x, y);
    destination.typ = ROOM;
    destination.flags = 0;
    game.level.monsters[pet.mx][pet.my] = null;
    pet.mx = x;
    pet.my = y;
    game.level.monsters[x][y] = pet;
    const before = { ux: game.u.ux, uy: game.u.uy, moves: game.moves };

    const drawsBefore = replay.getRngLog().length;
    game.nhDisplay.pushKey(commandKeyCode('u'));
    await assert.rejects(
        moveloop_core(),
        (error) => error.reason === 'hero combat or displacement',
    );

    assert.deepEqual(
        { ux: game.u.ux, uy: game.u.uy, moves: game.moves },
        before,
        'the stopped swap moved nobody and elapsed no turn',
    );
    assert.deepEqual(
        [pet.mx, pet.my],
        [x, y],
        'the pet stayed on the destination square',
    );
    // Fail-closed means before the draw, not instead of it: nothing may be
    // spent on a step the port cannot finish.
    assert.equal(replay.getRngLog().length, drawsBefore);
});

// The refusal sits ahead of requireOrdinaryStartingPetSwap() on purpose, and
// the plain pet case cannot tell: its square holds nothing, so every swap gate
// returns and the throw fires whichever order the two are in. A trap on the
// destination distinguishes them. C never consults the swap gates on this step
// -- do_attack() returns FALSE and test_move()'s exit rule declines it -- so
// reporting a pet-swap trap boundary would name a situation C never reaches.
test('a refused diagonal outranks the pet-swap consequence gates', async () => {
    const replay = await runSegment({
        seed: 840024,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:TrapDoorway,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const pet = game.level.monlist;
    assert.ok(pet?.mtame, 'the starting pet is on the level');
    const [x, y] = [game.u.ux + 1, game.u.uy - 1];
    game.level.at(game.u.ux, game.u.uy).typ = DOOR;
    game.level.at(game.u.ux, game.u.uy).flags = D_ISOPEN;
    const destination = game.level.at(x, y);
    destination.typ = ROOM;
    destination.flags = 0;
    game.level.monsters[pet.mx][pet.my] = null;
    pet.mx = x;
    pet.my = y;
    game.level.monsters[x][y] = pet;
    // The gate that would otherwise claim the step first.
    game.level.traps = [{ tx: x, ty: y, ttyp: PIT, tseen: false }];

    game.nhDisplay.pushKey(commandKeyCode('u'));
    await assert.rejects(
        moveloop_core(),
        (error) => error.reason === 'hero combat or displacement',
    );
    void replay;
});

// The mirror of the pet case above, and the ordering it protects.
// domove_core() takes m_at() at hack.c:2762 and reaches domove_attackmon_at()
// at 2794, well before test_move() at 2841, so a HOSTILE on the diagonal is
// attacked whatever the doorway rules would say -- uhitm.c do_attack() has no
// diagonal-doorway test. The seam briefly admitted the step ahead of its
// monster branch, which turned this honest stop into a silent refusal: the
// port declined the move and never attacked, where C attacks.
test('a hostile on a refused diagonal still stops for combat', async () => {
    const replay = await runSegment({
        seed: 840024,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:HostileDoorway,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: ' ',
    });
    const [x, y] = [game.u.ux + 1, game.u.uy - 1];
    // The hero stands on a doorway that still has its door, so test_move()'s
    // exit rule would refuse this diagonal on an empty square.
    game.level.at(game.u.ux, game.u.uy).typ = DOOR;
    game.level.at(game.u.ux, game.u.uy).flags = D_ISOPEN;
    const destination = game.level.at(x, y);
    destination.typ = ROOM;
    destination.flags = 0;
    const hostile = newMonster({
        mx: x,
        my: y,
        mhp: 3,
        data: {
            pmnames: ['newt', 'newt', 'newt'],
            mlet: S_FELINE,
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
    });
    game.level.monsters[x] ??= [];
    game.level.monsters[x][y] = hostile;

    game.nhDisplay.pushKey(commandKeyCode('u'));
    await assert.rejects(
        moveloop_core(),
        (error) => error.reason === 'hero combat or displacement',
    );
    void replay;
});

test('a doorless destination admits the diagonal test_move() allows',
    async () => {
    // The companion of the hero-square case: test_move()'s testdiag arm
    // admits a diagonal move into a doorway when doorless_door() holds.
    // D_BROKEN is not applicable, because the terrain seam refuses it as a
    // destination, so D_NODOOR is the only mask this rule admits here.
    await runSegment({
        seed: 840025,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:DoorwayEntry,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none',
        moves: ' ',
    });
    const [x, y] = [game.u.ux + 1, game.u.uy - 1];
    const destination = game.level.at(x, y);
    destination.typ = DOOR;
    destination.flags = D_NODOOR;
    destination.doormask = D_NODOOR;
    game.level.at(game.u.ux, game.u.uy).typ = ROOM;

    game.nhDisplay.pushKey(commandKeyCode('u'));
    await moveloop_core();

    assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
});

test('a doorless mask leaves both diagonal doorway rules unarmed',
    async () => {
        for (const [name, mask] of [
            ['doorless', D_NODOOR],
            ['broken', D_BROKEN],
        ]) {
            await runSegment({
                seed: 840004,
                datetime: COMMAND_DATETIME,
                nethackrc: 'OPTIONS=name:DoorlessExit,role:Healer,race:human,'
                    + 'gender:female,align:neutral,!legacy,!tutorial,'
                    + '!splash_screen,pettype:none',
                moves: '',
            });
            clearTtyMessageWindow(game);
            resetCommandVars(game);
            const start = [game.u.ux, game.u.uy];
            const heroSquare = game.level.at(start[0], start[1]);
            heroSquare.typ = DOOR;
            heroSquare.flags = heroSquare.doormask = mask;
            const destination = game.level.at(start[0] + 1, start[1] - 1);
            destination.typ = ROOM;
            destination.flags = destination.doormask = 0;
            for (const column of game.level.monsters) column.fill(null);
            game.level.monlist = null;
            game.level.objects[start[0] + 1][start[1] - 1] = null;
            game.level.traps = [];
            game.level.regions = [];
            game.head_engr = null;

            game.nhDisplay.pushKey(commandKeyCode('u'));
            await moveloop_core();
            await assert.rejects(moveloop_core(), /Input queue empty/u);
            assert.deepEqual(
                [game.u.ux, game.u.uy],
                [start[0] + 1, start[1] - 1],
                `${name} doorway diagonal exit`,
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
        // ICE is the first type past IS_FURNITURE()'s range, so it is still a
        // refused destination and holds this test's refusal.
        east.typ = ICE;
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

// hack.c test_move() (991-1160) has no arm for any of these seven types --
// rm.h:119 makes IS_OBSTRUCTED `typ < POOL` and IS_DOOR is false -- so the
// obstacle chain never claims the square and the step is admitted below it.
// ICE, rm.h:88's next type after ALTAR, is the case just outside the range.
test('simple hero movement admits every furniture square', async () => {
    for (const [label, terrain] of [
        ['stairs', STAIRS],
        ['ladder', LADDER],
        ['fountain', FOUNTAIN],
        ['throne', THRONE],
        ['sink', SINK],
        ['grave', GRAVE],
        ['altar', ALTAR],
    ]) {
        const { destination, x, y } = await prepareHeroMoveAdmission();
        destination.typ = terrain;

        await domove(game);

        assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
        assert.equal(game.u.umoved, true, label);
    }

    const { destination } = await prepareHeroMoveAdmission();
    destination.typ = ICE;
    await assert.rejects(
        domove(game),
        (error) => (
            error instanceof UnsupportedHeroMoveBoundaryError
            && error.reason === 'door or special terrain movement'
        ),
    );
});

// invent.c look_here() computes dfeature_at() unconditionally and prints its
// line above "You see here" when the square holds exactly one object.
// dfeature_at() (4037-4097) reaches the cmap for a fountain, throne, sink and
// grave, and stairs_description() for a staircase; its altar arm needs
// a_gname(), which has no owner, so an altar holding an object still stops.
test('a furniture square with one object prints its dfeature line',
    async () => {
        for (const [label, line, decorate] of [
            ['fountain', 'There is a fountain here.', (destination) => {
                destination.typ = FOUNTAIN;
            }],
            ['sink', 'There is a sink here.', (destination) => {
                destination.typ = SINK;
            }],
            ['grave', 'There is a grave here.', (destination) => {
                destination.typ = GRAVE;
            }],
            ['throne', 'There is an opulent throne here.', (destination) => {
                destination.typ = THRONE;
            }],
            // A staircase and a doorway were refused here until dfeature_at()
            // gained an owner, so they belong in the same list as the five
            // types the seam has just admitted.
            ['staircase', 'There is a staircase down here.',
                (destination, x, y) => {
                    destination.typ = STAIRS;
                    // Move the level's own down staircase onto the square
                    // rather than inventing a record: stairs_description()
                    // reads tolev, isladder and u_traversed off it.
                    const stway = stairway_find_dir(false, game);
                    stway.sx = x;
                    stway.sy = y;
                }],
            ['open doorway', 'There is an open door here.', (destination) => {
                destination.typ = DOOR;
                destination.flags = destination.doormask = D_ISOPEN;
            }],
        ]) {
            const { destination, x, y } = await prepareHeroMoveAdmission();
            decorate(destination, x, y);
            game.flags.pickup = false;
            game.level.objects[x][y] = {
                otyp: DART,
                oclass: WEAPON_CLASS,
                quan: 1,
                nobj: null,
                nexthere: null,
                dknown: true,
            };
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            // The dfeature line and "You see here" are two messages in one
            // turn, so the second asks for the --More-- a space dismisses.
            game.nhDisplay.pushKey(commandKeyCode(' '));

            await domove(game);

            assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
            assert.match(
                game._ttyToplines ?? '',
                new RegExp(`^${line.replace(/\./gu, '\\.')}`, 'u'),
                label,
            );
            assert.match(
                game._ttyToplines ?? '',
                /You see here a dart\./u,
                label,
            );
        }
    });

test('an altar holding an object stops for a_gname()', async () => {
    const { destination, x, y } = await prepareHeroMoveAdmission();
    destination.typ = ALTAR;
    game.flags.pickup = false;
    game.level.objects[x][y] = {
        otyp: DART,
        oclass: WEAPON_CLASS,
        quan: 1,
        nobj: null,
        nexthere: null,
        dknown: true,
    };

    // The seam refuses this before look_here() can reach dfeature_at()'s
    // a_gname() arm. That matters for where the error lands, not just which
    // class it is: nothing wraps the movement path in failClosedCommand(), so
    // an UnsupportedFeatureDescriptionError raised below domove() would travel
    // past js/jsmain.js's boundary list and discard the segment's matching
    // prefix. Only the four classes that list names end a segment, so the
    // assertion is on the class the hero-move seam raises, not on membership
    // in failClosedCommandRefusals(), which no code on this path consults.
    await assert.rejects(
        domove(game),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError
            && error.message.includes('terrain feature description'),
    );
});

// invent.c look_here()'s blind arm calls dungeon.c surface() for the noun the
// hero feels underfoot, and js/dungeon.js surface() ports only its ROOM and
// CORR arms. Every other admitted terrain would throw a bare Error out of
// runSegment() and discard the segment, because js/jsmain.js breaks only on
// the four boundary classes. OPTIONS=blind reaches this from turn one through
// u.uroleplay.blind, so the guard is not hypothetical. The altar row expects
// this reason rather than the a_gname() one because the blind guard sits
// above it: a blind hero never reaches dfeature_at().
test('a blind hero refuses an object on terrain surface() cannot name',
    async () => {
        for (const [label, terrain, admitted] of [
            ['fountain', FOUNTAIN, false],
            ['altar', ALTAR, false],
            ['stairs', STAIRS, false],
            ['room', ROOM, true],
            ['corridor', CORR, true],
        ]) {
            const { destination, x, y } = await prepareHeroMoveAdmission();
            destination.typ = terrain;
            game.flags.pickup = false;
            game.u.uprops[BLINDED].intrinsic = 1;
            game.level.objects[x][y] = {
                otyp: DART,
                oclass: WEAPON_CLASS,
                quan: 1,
                nobj: null,
                nexthere: null,
                dknown: true,
            };
            if (admitted) {
                // A blind hero on a room square reaches look_here()'s message
                // and then waits for a key, so this control cannot run the
                // move to completion. What it must show is that the guard did
                // not fire, so it asserts on the reason rather than on
                // reaching the end of the turn.
                await domove(game).catch((error) => {
                    assert.ok(
                        !String(error?.message ?? '')
                            .includes('blind terrain description'),
                        label,
                    );
                });
            } else {
                await assert.rejects(
                    domove(game),
                    (error) => error instanceof UnsupportedHeroMoveBoundaryError
                        && error.message.includes(
                            'blind terrain description',
                        ),
                    label,
                );
            }
        }
    });

// pickup.c check_here() calls describe_decor() under flags.mention_decor, and
// pickup.c:392-410 mentions a furniture square even when the terrain has not
// changed, because its `ltyp == iflags.prev_decor` test carries
// `&& !IS_FURNITURE(ltyp)`. Neither describe_decor() nor iflags.prev_decor is
// ported, so the whole predicate stays refused rather than printing nothing.
// The doorway rows matter as much as the furniture ones: the guard's
// predicate is `IS_FURNITURE(location.typ) || doorway`, and without a doorway
// case the `|| doorway` term can be deleted with the whole suite still green.
// C reaches a doorway here to blank the dfeature and rewrite prev_decor, which
// is why it is refused rather than admitted.
test('a furniture square with mention_decor stays refused', async () => {
    for (const [label, terrain, mask, admitted] of [
        ['fountain', FOUNTAIN, 0, false],
        ['altar', ALTAR, 0, false],
        ['open doorway', DOOR, D_ISOPEN, false],
        ['doorless doorway', DOOR, D_NODOOR, false],
        ['room', ROOM, 0, true],
        ['corridor', CORR, 0, true],
    ]) {
        const { destination, x, y } = await prepareHeroMoveAdmission();
        destination.typ = terrain;
        destination.flags = destination.doormask = mask;
        game.flags.mention_decor = true;

        if (admitted) {
            await domove(game);
            assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
            continue;
        }
        await assert.rejects(
            domove(game),
            (error) => (
                error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'decor description'
            ),
            label,
        );
    }
});

test('a run onto a doorway or a furniture square ends on the square it reaches',
    async () => {
    // hack.c:2937-2941, domove_core()'s arm after u_on_newpos():
    // `if (svc.context.run && svc.context.run < 8
    //      && (IS_DOOR(typ) || IS_OBSTRUCTED(typ) || IS_FURNITURE(typ)))
    //          nomul(0);`
    // The three run matrices only ever reach the IS_DOOR term, so without the
    // furniture cases below the IS_FURNITURE term can be deleted outright.
    // STAIRS and ALTAR are the ends of rm.h:138's range, so between them they
    // also pin both of that macro's bounds.
    for (const [label, typ, doormask] of [
        ['doorway', DOOR, D_NODOOR],
        ['staircase', STAIRS, 0],
        ['fountain', FOUNTAIN, 0],
        ['altar', ALTAR, 0],
    ]) {
        const { destination, x, y } = await prepareHeroMoveAdmission();
        destination.typ = typ;
        destination.flags = destination.doormask = doormask;
        game.context.run = 1;
        game.multi = 12;
        // nomul() clears these two and sets disp.botl; the three field
        // assignments this call site replaced wrote none of them, and a
        // running hero is never asleep or invulnerable in a recorded game,
        // which is why no matrix can tell the two apart.
        game.u.uinvulnerable = true;
        game.u.usleep = 5;
        game.disp.botl = false;

        await domove(game);

        assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
        assert.equal(game.context.run, 0, `${label} run`);
        assert.equal(game.multi, 0, `${label} multi`);
        assert.equal(game.u.uinvulnerable, false, `${label} uinvulnerable`);
        assert.equal(game.u.usleep, 0, `${label} usleep`);
        assert.equal(game.disp.botl, true, `${label} botl`);
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

test('command retry snapshot detects monster, display RNG, and recorder owners',
    async () => {
        const cases = [
            {
                name: 'monster state',
                mutate(replay) {
                    assert.ok(game.level.monlist);
                    game.level.monlist.mfleetim += 1;
                },
            },
            {
                name: 'display RNG',
                mutate() {
                    game.displayCtx.a += 1n;
                },
            },
            {
                name: 'burden message state',
                mutate() {
                    game.go.oldcap += 1;
                },
            },
            {
                name: 'capacity cache',
                mutate() {
                    game.gw.wc += 1;
                },
            },
            {
                name: 'pending recorder frame',
                mutate(replay) {
                    replay._pendingAnimFrames.push({
                        cursor: [1, 2, 1],
                        screen: 'pending',
                    });
                },
            },
            {
                name: 'recorder RNG index',
                mutate(replay) {
                    replay._lastRngIdx += 1;
                },
            },
        ];

        for (const owner of cases) {
            const replay = await runSegment({
                seed: 840003,
                datetime: COMMAND_DATETIME,
                nethackrc: 'OPTIONS=name:RetryOwner,role:Healer,'
                    + 'race:human,gender:female,align:neutral,!legacy,'
                    + '!tutorial,!splash_screen',
                moves: '',
            });
            const before = heroCommandRetrySnapshot(replay);
            owner.mutate(replay);
            assert.notDeepEqual(
                heroCommandRetrySnapshot(replay),
                before,
                owner.name,
            );
        }
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
    assert.equal(game.hero_seq, 8);
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

test('travel and pickup bytes remain atomic boundaries',
    async () => {
    const cases = [
        // cmd.c dotravel() reaches dotravel_target(), which sets
        // svc.context.run to 8. Travel is not one of the movement commands
        // this boundary dispatches, unlike the ctrl-direction rush commands
        // the same binding table names, which sit at run 3.
        { name: 'travel', key: 'x', binding: 'BINDINGS=x:travel' },
        // The `g` and `G` prefixes are refused by the command lookup, not by
        // ADMITTED_RUN_MODES: do_run() behind `G` sets run 3, the same value
        // the admitted ctrl-direction rush sets, so the value list cannot tell
        // them apart. These two pin that the earlier refusal is what holds.
        { name: 'rush prefix', key: 'g', binding: '' },
        { name: 'run prefix', key: 'G', binding: '' },
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
            // Dismiss the startup welcome and stop at the first gameplay
            // command prompt so the pre-attempt capture is a true peer of
            // the rejected-command capture.
            moves: ' ',
        });
        const key = commandKeyCode(commandCase.key);
        assert.equal(
            game._commandDispatchCount,
            0,
            'the setup space dismisses startup output, not a gameplay wait',
        );
        assert.equal(game.moves, 1);
        assert.equal(game.hero_seq, 8);
        assert.equal(game.u.uhunger, 900);
        const initialDispatches = game._commandDispatchCount;
        game.cmdKey = commandKeyCode('k');
        game.commandCount = 17;
        game.lastCommandCount = 19;
        game.nhDisplay.pushKey(key);
        const beforeFirstRejection = heroCommandRetrySnapshot(replay);
        assert.deepEqual(
            beforeFirstRejection.terminal.cursor,
            beforeFirstRejection.output.cursors.at(-1),
            'the baseline terminal and recorder cursor owners agree',
        );
        await assert.rejects(
            moveloop_core(),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && error.key === key,
            commandCase.name,
        );
        const rejected = heroCommandRetrySnapshot(replay);
        const expected = structuredClone(beforeFirstRejection);
        Object.assign(expected.context, {
            forcefight: 0,
            move: 0,
            mv: 0,
            nopick: 0,
            run: 0,
            travel: 0,
            travel1: 0,
            pendingCommand: {
                phase: 'physical',
                key,
            },
        });
        expected.domoveAttempting = 0;
        expected.iflags.in_parse = false;
        expected.iflags.menu_requested = false;
        expected.input.queue = [];
        expected.multi = 0;
        expected.parser.commandCount = 0;
        expected.output.animations.push([]);
        expected.output.cursors.push(
            structuredClone(expected.output.cursors.at(-1)),
        );
        expected.output.rngSlices.push([]);
        expected.output.screens.push(expected.output.screens.at(-1));
        expected.terminal.waitEpoch++;
        assert.deepEqual(
            rejected,
            expected,
            `${commandCase.name} first rejection has only documented deltas`,
        );
        assert.deepEqual(
            rejected.terminal.cursor,
            rejected.output.cursors.at(-1),
            'the rejected terminal and recorder cursor owners agree',
        );
        assert.deepEqual(game.context.pendingCommand, {
            phase: 'physical',
            key,
        });
        assert.deepEqual(game.nhDisplay.terminal._inputQueue, []);
        assert.equal(
            game.nhDisplay.waitEpoch,
            beforeFirstRejection.terminal.waitEpoch + 1,
        );
        assert.equal(
            replay.getScreens().length,
            beforeFirstRejection.output.screens.length + 1,
            'the first classification retains exactly its prompt capture',
        );
        assert.deepEqual(
            replay.getScreens().slice(0, -1),
            beforeFirstRejection.output.screens,
        );
        assert.deepEqual(
            replay.getCursors().slice(0, -1),
            beforeFirstRejection.output.cursors,
        );
        assert.deepEqual(replay.getRngSlices().at(-1), []);
        assert.deepEqual(replay.getAnimationFramesByStep().at(-1), []);
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

test('a sighted hero looks at an ordinary corpse without stopping',
    async () => {
    // invent.c look_here() ends its single-object branch with
    // feel_cockatrice(otmp, FALSE), which does nothing unless
    // will_feel_cockatrice() holds. A sighted hero without gloves off in a
    // petrifying corpse's presence therefore reads the line and plays on.
    const replay = await runSegment({
        seed: 840023,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:CorpseLook,role:Valkyrie,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen,pettype:none',
        moves: ' ',
    });
    game.level.objects[game.u.ux][game.u.uy] = {
        otyp: CORPSE,
        oclass: FOOD_CLASS,
        corpsenm: PM_NEWT,
        quan: 1,
        nobj: null,
        nexthere: null,
        dknown: true,
    };
    game.nhDisplay.pushKey(commandKeyCode(':'));
    // The startup line is still pending, so the new message wraps it in a
    // More prompt; the Space answers that, as a player would.
    game.nhDisplay.pushKey(commandKeyCode(' '));

    await moveloop_core();
    await flush_screen(1);

    assert.match(topLine(game), /You see here a newt corpse\./u);
    assert.equal(game.context.move, 0);
});

test('the inventory command stops before drawing an unformattable item',
    async () => {
    // Every starting pack formats, so this puts an object inside the Rogue's
    // sack: naming a container's contents needs pickup.c count_contents(),
    // which is not ported. The stop has to leave the screen and the keystroke
    // exactly as the admission seam would.
    const replay = await runSegment({
        seed: 840022,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:InventoryStop,role:Rogue,'
            + 'race:human,gender:female,align:chaotic,!legacy,'
            + '!tutorial,!splash_screen,pettype:none',
        moves: ' ',
    });
    let sack = null;
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === SACK) sack = obj;
    }
    assert.ok(sack, 'the Rogue carries a sack');
    sack.cobj = { otyp: DART, oclass: WEAPON_CLASS, quan: 1, nobj: null };
    const key = commandKeyCode('i');
    const screens = replay.getScreens().length;
    const startingMoves = game.moves;
    const discoveryState = () => game.objects.map((type) => [
        type.oc_name_known, type.oc_encountered,
    ]);
    const discoveryBefore = discoveryState();
    game.nhDisplay.pushKey(key);

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === key
            && /container contents count/u.test(error.message),
    );

    assert.equal(game.context.move, 0);
    assert.equal(game.moves, startingMoves);
    // Formatting a name marks its type discovered, so a refusal part-way
    // through the pack would leave earlier items discovered. Nothing may
    // move.
    assert.deepEqual(discoveryState(), discoveryBefore);
    // One capture for the prompt the refused keystroke was read at, and no
    // menu cells anywhere on it.
    assert.equal(replay.getScreens().length, screens + 1);
    assert.deepEqual(replay.getScreens().at(-1), replay.getScreens().at(-2));
    assert.deepEqual(replay.getRngSlices().at(-1), []);
    // The retry contract: pressing it again reaches the same stop.
    game.nhDisplay.pushKey(key);
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError,
    );
});

test('Escape at a command prompt prints nothing and takes no time',
    async () => {
    // rhack() returns at its empty-key test before any command lookup, so
    // Escape is neither a command nor a bad command; parse() has already
    // cleared the message window by then.
    await runSegment({
        seed: 840026,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:EscapeCommand,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none',
        moves: ' ',
    });
    const startingMoves = game.moves;
    game.nhDisplay.pushKey(0x1B);

    await moveloop_core();
    await flush_screen(1);

    assert.equal(topLine(game), '');
    assert.equal(game.context.move, 0);
    assert.equal(game.moves, startingMoves);
    assert.equal(game.context.pendingCommand, undefined);
});

test('an unbound byte answers rhack bad-command output and takes no time',
    async () => {
    // Space, percent, and the two control bytes below have no binding in the
    // default set; '^^' also checks that the line uses visctrl() form. A digit
    // and Escape are excluded because cmd.c parse() consumes the first into
    // get_count() and rhack() answers the second before its bad-command path.
    const admitted = [
        { key: commandKeyCode(' '), shown: ' ' },
        { key: commandKeyCode('%'), shown: '%' },
        { key: 30, shown: '^^' }, // ^^, unbound and outside the ASCII letters
        { key: 3, shown: '^C' }, // ^C, unbound in the source command table
    ];
    const refused = [
        commandKeyCode('7'), // a count digit while num_pad is off
    ];
    const replay = await runSegment({
        seed: 840021,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:UnboundCommand,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen,pettype:none',
        // The space dismisses startup output and stops at the first gameplay
        // command prompt, so no keystroke below is a message dismissal.
        moves: ' ',
    });
    assert.equal(game._commandDispatchCount, 0);
    const startingMoves = game.moves;

    for (const { key, shown } of admitted) {
        const dispatches = game._commandDispatchCount;
        const screens = replay.getScreens().length;
        game.nhDisplay.pushKey(key);
        await moveloop_core();
        // pline() leaves the line pending; the next loop iteration's
        // flush_screen(1) paints it, which is the same order the recorded
        // screens capture.
        await flush_screen(1);
        assert.equal(topLine(game), `Unknown command '${shown}'.`);
        assert.equal(game.context.move, 0, `${shown} consumed no time`);
        assert.equal(game.moves, startingMoves, `${shown} elapsed no turn`);
        assert.equal(game.multi, 0);
        assert.equal(game._commandDispatchCount, dispatches + 1);
        assert.equal(replay.getScreens().length, screens + 1);
        assert.deepEqual(
            replay.getRngSlices().at(-1),
            [],
            `${shown} drew no gameplay randomness`,
        );
    }

    // With number_pad on, cmd.c parse() reads the byte directly and only the
    // count key enters get_count(); the digits become movement commands. The
    // admission has to follow the option rather than the ASCII class.
    await runSegment({
        seed: 840021,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:UnboundCommand,role:Healer,'
            + 'race:human,gender:female,align:neutral,!legacy,'
            + '!tutorial,!splash_screen,pettype:none\n'
            + 'OPTIONS=number_pad:1',
        moves: ' ',
    });
    const numberPadMoves = game.moves;
    game.nhDisplay.pushKey(commandKeyCode('%'));
    await moveloop_core();
    await flush_screen(1);
    assert.equal(topLine(game), "Unknown command '%'.");
    assert.equal(game.moves, numberPadMoves);
    game.nhDisplay.pushKey(commandKeyCode('n'));
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('n'),
        'the number-pad count key stays a count prefix',
    );

    // A rejected physical byte is retained for retry, so each refusal needs
    // its own segment rather than another key pushed at the same prompt.
    for (const key of refused) {
        await runSegment({
            seed: 840021,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:UnboundCommand,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none',
            moves: ' ',
        });
        const refusedFrom = game.moves;
        game.nhDisplay.pushKey(key);
        await assert.rejects(
            moveloop_core(),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && error.key === key,
            `key ${key} stays outside the bad-command path`,
        );
        assert.equal(game.moves, refusedFrom);
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

    // mon.c runs m_everyturn_effect() before the movement-ration gate, so this
    // ration-less fog cloud still reaches gas-cloud creation. region.c's
    // block_point() rebuilds vision.c's transparency index, and the dry run
    // cannot reproduce that on a cloned state, so the whole turn stops before
    // any live state or PRNG moves rather than admitting a scan whose later
    // monsters would take different vision-dependent branches.
    // This call only dispatches the wait; its elapsed turn runs on the next
    // moveloop_core().
    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    const beforeFog = {
        hunger: game.u.uhunger,
        moves: game.moves,
        movement: game.u.umovement,
    };

    // Two attempts, to show the stop leaves the turn retryable. No key is
    // queued: the elapsed turn throws before the next command is read, so the
    // pending input is exactly what it was.
    for (let attempt = 0; attempt < 2; ++attempt) {
        game.context.move = 1;
        await assert.rejects(
            () => moveloop_core(),
            (error) => (
                error instanceof UnsupportedTurnBoundaryError
                && error.reason === 'monster region creation'
            ),
            `attempt ${attempt}`,
        );
        assert.equal(game.moves, beforeFog.moves, `attempt ${attempt}`);
        assert.equal(game.u.uhunger, beforeFog.hunger, `attempt ${attempt}`);
        assert.equal(
            game.u.umovement,
            beforeFog.movement,
            `attempt ${attempt}`,
        );
        assert.deepEqual(game.level.regions, [], `attempt ${attempt}`);
    }

    game.level.regions = [];
    fogCloud.movement = 0;

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
        // dochug()'s standard-attack gate reads noattacks(mdat), so an
        // attackless species would walk past the boundary this test names.
        data: { mmove: 12, mattk: [{ aatyp: AT_CLAW }] },
        movement: 12, mhp: 1, nmon: null,
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
    game.gw.wc = 12345;
    const before = {
        dispatches: game._commandDispatchCount,
        capacityCache: game.gw.wc,
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
        capacityCache: game.gw.wc,
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
    // A new game starts the hero on the upstairs, and hack.c lookaround()
    // reads levl[u.ux][u.uy].typ; only a ROOM square stays inside the
    // running boundary this port admits.
    game.level.at(start[0], start[1]).typ = ROOM;

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

test('a first-time altmeta number-pad run establishes the run sentinel',
    async () => {
    await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:RunIntent,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'number_pad,altmeta',
        moves: '',
    });
    game.level.monlist = null;
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

    await rhack(0, game);

    // cmd.c rhack()'s DOMOVE_RUSH arm: a first-time run without a count sets
    // multi to max(COLNO, ROWNO), zeroes last_str_turn, marks context.mv and
    // calls domove(), which takes the run's first step immediately.
    assert.deepEqual([game.u.ux, game.u.uy], [start[0] - 1, start[1]]);
    assert.equal(game.context.run, 1);
    assert.equal(game.context.mv, 1);
    assert.equal(game.multi, COLNO);
    assert.equal(game.u.last_str_turn, 0);
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

test('every nonzero-key rhack entry counts one logical dispatch', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:DispatchCount,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,!acoustics',
        moves: '',
    });
    // C's repeat path re-enters rhack(gc.cmd_key) with the key already in
    // hand, skipping the parse. That entry is still a fresh logical command,
    // so it must count. The retry direction -- re-entering with key 0 while a
    // pendingCommand is retained -- is what must NOT count, and is covered by
    // the boundary-retry cases above.
    game.context.pendingCommand = null;
    const before = game._commandDispatchCount ?? 0;

    await rhack(commandKeyCode('.'), game);
    assert.equal(game._commandDispatchCount, before + 1);

    // The same key again is a second logical command, not a repeat of the
    // first, so the counter advances again.
    game.context.pendingCommand = null;
    await rhack(commandKeyCode('.'), game);
    assert.equal(game._commandDispatchCount, before + 2);
});

test('an adjacent statue trap stops retryably at the `s` key', async () => {
    // detect.c dosearch0() would reach activate_statue_trap(), which is not
    // ported. This refusal was a bare Error until the audit of
    // e30ea05..d1a71f7: failClosedCommand() converts only the Unsupported*
    // classes, so the segment died and lost every screen it had matched
    // instead of stopping at a boundary the player can retry.
    const replay = await runSegment({
        seed: 9300001,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:StatueSearch,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,!acoustics',
        moves: '',
    });
    const drawsBefore = replay.getRngLog().length;
    // A secret door on the first square the traversal visits. dosearch0() runs
    // x from ux-1 and y from uy-1, so this square precedes the trap; its
    // rnl(7 - fund) is what a refusal decided inside the loop would spend
    // before ever reaching the statue. Without it the PRNG assertion below
    // holds for both the right and the wrong placement, because nothing else
    // in this hero's 3x3 draws.
    game.level.at(game.u.ux - 1, game.u.uy - 1).typ = SDOOR;
    // STATUE_TRAP on a later square, unseen so the search would find it.
    game.level.traps.push({
        tx: game.u.ux + 1, ty: game.u.uy, ttyp: STATUE_TRAP, tseen: false,
    });
    const searchKey = commandKeyCode('s');
    game.nhDisplay.pushKey(searchKey);

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === searchKey
            && /activate_statue_trap\(\) is not ported/.test(error.message),
    );
    // Nothing was spent and no turn elapsed: the preflight settled the whole
    // 3x3 before the loop reached the secret door, so the command is still
    // retryable and the segment keeps its prefix.
    assert.equal(replay.getRngLog().length, drawsBefore);
    assert.deepEqual(replay.getRngSlices().at(-1), []);
    assert.equal(game.moves, 1);
    assert.equal(game.context.move, 0);
    assert.equal(game.context.pendingCommand.phase, 'parsed');
    assert.equal(game.context.pendingCommand.key, searchKey);
});

test('a search branch this port lacks stops retryably at the `s` key', async () => {
    // detect.c dosearch0() feels every adjacent square when the hero is blind,
    // which reaches feel_location() branches this port does not own. The
    // refusal has to reach the player as the retryable command boundary, and
    // it has to be decided before the loop draws its first rnl().
    const replay = await runSegment({
        seed: 840021,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:BlindSearch,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none,!acoustics,blind',
        moves: '',
    });
    const searchKey = commandKeyCode('s');
    assert.equal(commandForKey(createCommandBindingModel(game), searchKey),
        'search');
    const drawsBefore = replay.getRngLog().length;
    game.nhDisplay.pushKey(searchKey);

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === searchKey
            && /feels every adjacent square/.test(error.message),
    );
    // Nothing was spent: the preflight decided over all eight squares before
    // dosearch0()'s loop could draw, so the segment keeps its whole prefix and
    // the command remains retryable.
    assert.equal(replay.getRngLog().length, drawsBefore);
    assert.equal(game.moves, 1);
    assert.equal(game.context.move, 0);
    assert.deepEqual(replay.getRngSlices().at(-1), []);
    assert.equal(game.context.pendingCommand.phase, 'parsed');
    assert.equal(game.context.pendingCommand.key, searchKey);

    // Retrying the retained command reproduces the same refusal and still
    // spends nothing.
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === searchKey,
    );
    assert.equal(replay.getRngLog().length, drawsBefore);
    assert.equal(game.moves, 1);
});

test("both of eat.js's stop classes convert at the command seam", () => {
    // js/cmd.js runEatCommand() wraps doeat() in failClosedCommand(), and
    // js/jsmain.js breaks a segment only for the three boundary classes, so a
    // class doeat() can raise that the wrapper does not list escapes as a hard
    // failure and discards the segment's matching prefix instead of stopping
    // on it. eat.js raises two: UnsupportedEatError from doeat() and
    // floorfood(), and UnsupportedHungerTransitionError from newuhs(), which
    // done_eating() and lesshungry() both call on the doeat() path.
    const converted = failClosedCommandRefusals();
    assert.ok(converted.includes(UnsupportedEatError));
    assert.ok(converted.includes(UnsupportedHungerTransitionError));
});

// The '>' handler routes dodown() through failClosedCommand() (js/cmd.js), and
// js/jsmain.js runSegment() breaks a segment only for the boundary classes
// that wrapper produces. A class raised inside goto_level()'s tail that the
// list omits escapes runSegment() as a hard throw, and the scorer records a
// session error instead of keeping the screens the segment already matched.
// Each of these four is reached by a named site in that tail, so each is
// asserted separately: one deepEqual over the whole list would also catch a
// deletion, but would churn on every unrelated addition.
test('every class goto_level()\'s tail can raise converts at the command seam',
    async () => {
        const { UnsupportedPickupError } = await import('../js/pickup.js');
        const { UnsupportedHeroTimeoutBoundaryError } =
            await import('../js/timeout.js');
        const { UnsupportedPositionCheckError } =
            await import('../js/teleport.js');
        const { UnsupportedMonsterCreationError } =
            await import('../js/makemon_create.js');
        const converted = failClosedCommandRefusals();

        // do.c:1993 pickup(1), goto_level()'s last statement.
        assert.ok(converted.includes(UnsupportedPickupError));
        // do.c:1821 run_timers(), for timers due while the hero was away.
        assert.ok(converted.includes(UnsupportedHeroTimeoutBoundaryError));
        // do.c:1814 losedogs() -> mon_arrive() -> rloc_to(), placing a
        // follower that arrives with the hero.
        assert.ok(converted.includes(UnsupportedPositionCheckError));
        // do.c:1699 mklev() -> makemon(), for a mimic inside a generated shop.
        assert.ok(converted.includes(UnsupportedMonsterCreationError));
    });

// Both classes lowering an experience level raises, asserted separately for
// the reason the goto_level() test above states. The first is reachable from
// the running game today: js/cmd.js doextcmd() routes '#levelchange' through
// failClosedCommand(), and wizcmds.c wiz_level_change()'s lowering arm throws
// it for any answer below the hero's level once she is above level 1. Drop it
// from the list and that answer stops being a segment boundary, so every
// screen the segment already matched is discarded as a session error instead.
test("both classes a lowered experience level raises convert at the command "
    + 'seam', async () => {
    const { UnsupportedExperienceChangeError } =
        await import('../js/exper.js');
    const { UnsupportedAbilityChangeError } = await import('../js/attrib.js');
    const converted = failClosedCommandRefusals();

    // wizcmds.c:474 losexp("#levelchange"), the lowering arm's loop body.
    assert.ok(converted.includes(UnsupportedExperienceChangeError));
    // attrib.c:1054-1062 adjabil()'s loss arm, and its lose_weapon_skill()
    // tail at 1072. No ported command reaches either yet.
    assert.ok(converted.includes(UnsupportedAbilityChangeError));
});
