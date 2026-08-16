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
    cmdq_add_ec,
    cmdq_peek,
    extcmdRow,
    failClosedCommandRefusals,
    MAX_COMMAND_COUNT,
    parseCommand,
    resetCommandVars,
    rhack,
    UnsupportedHeroCommandBoundaryError,
    UnsupportedHeroCommandBranchBoundaryError,
} from '../js/cmd.js';
import {
    UnsupportedEatError,
    UnsupportedHungerTransitionError,
} from '../js/eat.js';
import { INTERNALCMD, extcmdlist } from '../js/extcmdlist_data.js';
import {
    ALTAR,
    BEAR_TRAP,
    COLNO,
    CORR,
    CQ_CANNED,
    CROSSWALL,
    DBWALL,
    DO_MOVE,
    DOMOVE_WALK,
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
    isok,
    LADDER,
    LAVAPOOL,
    LEVITATION,
    M_AP_FURNITURE,
    MON_FLOOR,
    NORMAL_SPEED,
    OBJ_FLOOR,
    OBJ_INVENT,
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
    TEST_MOVE,
    THRONE,
    TLCORNER,
    TLWALL,
    TRCORNER,
    TRWALL,
    TUWALL,
    BLCORNER,
    BRCORNER,
    VWALL,
    W_ARMF,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { GameMap } from '../js/game.js';
import {
    flush_screen,
    remembered_glyph_presentation,
} from '../js/display.js';
import {
    CORPSE,
    ARMOR_CLASS,
    DAGGER,
    DART,
    FOOD_CLASS,
    IRON_SHOES,
    objects_globals_init,
    PICK_AXE,
    SACK,
    TOOL_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { game, resetGame } from '../js/gstate.js';
import { newObject, place_object } from '../js/obj.js';
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
    AD_FIRE,
    AT_CLAW,
    AT_NONE,
    M1_NEEDPICK,
    M1_TUNNEL,
    PM_DISPLACER_BEAST,
    PM_FOG_CLOUD,
    PM_COCKATRICE,
    PM_LICHEN,
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

// cmd.c:4326-4330 isok() is `x >= 1 && x <= COLNO - 1 && y >= 0
// && y <= ROWNO - 1`. The column and row bounds differ: column 0 exists in
// levl[][] and sits outside the map, while row 0 is the map's first row. The
// port defines isok() in js/const.js, where a comment says why; these cases
// sit on each of the four bounds and one step past it.
test('isok admits the map columns and rows cmd.c names', () => {
    // Column 1 row 0 is the first square isok() admits, at two of the bounds.
    assert.equal(isok(1, 0), true);
    // COLNO-1 and ROWNO-1 are the last, at the other two.
    assert.equal(isok(COLNO - 1, ROWNO - 1), true);
    // `x >= 1` drops column 0, which levl[][] has and the map does not.
    assert.equal(isok(0, 0), false);
    // `x <= COLNO - 1` drops column COLNO, one past the last.
    assert.equal(isok(COLNO, 0), false);
    // `y >= 0` drops row -1; C admits row 0, unlike column 0.
    assert.equal(isok(1, -1), false);
    // `y <= ROWNO - 1` drops row ROWNO, one past the last.
    assert.equal(isok(1, ROWNO), false);
});

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

// C ref: hack.c:1050. is_db_wall() takes the closing else's first arm, ahead of
// the flags.mention_walls line the case above covers, so a raised drawbridge
// speaks for itself. DBWALL satisfies IS_WALL() (rm.h:117), which is why it
// reaches this arm at all and why, before the arm existed, the port fell
// through to that line and said "It's solid stone." -- display.c wall_angle()
// has no DBWALL case.
test('a raised drawbridge answers for itself rather than as a wall',
    async () => {
        // The same interior coordinate and eastward step as the wall case, so
        // isok() and the map edge stay out of the result.
        const ux = 10;
        const uy = 10;
        const state = {
            flags: { mention_walls: true },
            level: new GameMap(),
        };
        const destination = state.level.at(ux + 1, uy);
        destination.typ = DBWALL;
        // A seen square: the wall line the drawbridge arm displaces reads
        // seenv through wall_angle(), so leaving it clear would let the arms
        // agree by accident.
        destination.seenv = 0xFF;
        const messages = [];
        const env = { message: (message) => messages.push(message) };

        assert.equal(
            await test_move(ux, uy, 1, 0, DO_MOVE, state, env),
            false,
        );
        assert.deepEqual(messages, ['That drawbridge is up!']);

        // C's pline() here is not the pline_dir() the wall line uses
        // (pline.c:114-123), so accessiblemsg adds no location prefix.
        state.a11y = { accessiblemsg: true };
        state.iflags = {};
        state.u = { ux, uy, uprops: [] };
        messages.length = 0;
        assert.equal(
            await test_move(ux, uy, 1, 0, DO_MOVE, state, env),
            false,
        );
        assert.deepEqual(messages, ['That drawbridge is up!']);

        // No flag gates this line, unlike the wall line below it in C's chain.
        state.flags.mention_walls = false;
        messages.length = 0;
        assert.equal(
            await test_move(ux, uy, 1, 0, DO_MOVE, state, env),
            false,
        );
        assert.deepEqual(messages, ['That drawbridge is up!']);

        // TEST_MOVE answers FALSE in silence: C wraps the whole chain in
        // `if (mode == DO_MOVE)`.
        messages.length = 0;
        assert.equal(
            await test_move(ux, uy, 1, 0, TEST_MOVE, state, env),
            false,
        );
        assert.deepEqual(messages, []);
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
                    // Whatever layer _map_location() picked, the cell drawn
                    // has to be the cell remembered. Some of these squares
                    // hold a floor object, whose memory is an unresolved
                    // glyph number rather than a presentation.
                    assert.equal(
                        destination.disp_ch,
                        remembered_glyph_presentation(
                            destination.remembered_glyph,
                            game,
                        ).ch,
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
    const objectRecord = (object) => {
        const {
            cobj,
            nobj,
            nexthere,
            ...fields
        } = object;
        return {
            cobj: cobj?.o_id ?? null,
            fields: structuredClone(fields),
            nexthere: nexthere?.o_id ?? null,
            nobj: nobj?.o_id ?? null,
        };
    };
    const objectChain = (head, link) => {
        const records = [];
        for (let object = head; object; object = object[link]) {
            records.push(objectRecord(object));
        }
        return records;
    };
    return {
        context: structuredClone(game.context),
        cursor: replay.getCursors().map((cursor) => [...cursor]),
        display: {
            grid: structuredClone(game.nhDisplay.grid),
            messages: [...game.nhDisplay.messages],
            topMessage: game.nhDisplay.topMessage,
            toplin: game.nhDisplay.toplin,
            toplines: game.nhDisplay.toplines,
            ttyToplines: game._ttyToplines,
        },
        domoveAttempting: game.domoveAttempting,
        hero: structuredClone(game.u),
        iflags: structuredClone(game.iflags),
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
        displayRngContext: {
            a: game.displayCtx.a,
            b: game.displayCtx.b,
            c: game.displayCtx.c,
            m: [...game.displayCtx.m],
            n: game.displayCtx.n,
            r: [...game.displayCtx.r],
        },
        rngLog: [...getRngLog()],
        screens: [...replay.getScreens()],
        world: {
            lastSeen: structuredClone(game.level.lastseentyp),
            levelObjects: objectChain(game.level.objlist, 'nobj'),
            locations: structuredClone(game.level.locations),
            monsterGrid: game.level.monsters.map(
                (column) => column.map((monster) => monster?.m_id ?? 0),
            ),
            objectGrid: game.level.objects.map(
                (column) => column.map(
                    (head) => objectChain(head, 'nexthere'),
                ),
            ),
            vision: game.viz_array.map((row) => [...row]),
            visionFullRecalc: game.vision_full_recalc,
        },
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

async function prepareHeroMoveAdmission(extraRc = '') {
    const replay = await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MoveAdmission,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + `pettype:none\n${extraRc}`,
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

test('reqmenu movement crosses ordinary piles without pickup or description',
    async () => {
        for (const [label, pickupEnabled, pileLimit, binding, prefix] of [
            // The default prefix and limit exercise the menu-sized branch
            // that ordinary !autopickup movement would otherwise enter.
            ['default menu', false, 5, '', 'm'],
            // Equality at two selects the count line without the prefix.
            ['default count', false, 2, '', 'm'],
            // Explicit autopickup exercises pickup()'s same nopick return.
            ['autopickup menu', true, 5, '', 'm'],
            // Rebinding reqmenu proves dispatch carries its semantic flag;
            // the count threshold keeps the two display branches covered.
            ['rebound autopickup count', true, 2,
                'BINDINGS=x:reqmenu', 'x'],
        ]) {
            const { x, y } = await prepareHeroMoveAdmission(binding);
            game.flags.pickup = pickupEnabled;
            game.flags.pile_limit = pileLimit;
            const head = installFloorPile(x, y, 2);
            const before = structuredClone(head);
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            game.context.move = 0;
            game.context.run = 0;
            game.context.nopick = 0;
            game.domoveAttempting = 0;
            game.nhDisplay.pushKey(commandKeyCode(prefix));
            // The destination is one square east of the prepared hero.
            game.nhDisplay.pushKey(commandKeyCode('l'));

            await rhack(0, game);

            assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
            assert.equal(game.level.objects[x][y], head, label);
            assert.deepEqual(structuredClone(head), before, label);
            assert.equal(game._ttyToplines, '', label);
            assert.equal(game.context.nopick, 1, label);
            assert.equal(game.iflags.menu_requested, false, label);
            assert.equal(game.nhDisplay.inputQueueLength, 0, label);
        }
    });

test('reqmenu movement skips look-here terrain guards with an object present',
    async () => {
        for (const [name, terrain] of [
            ['blind fountain', FOUNTAIN],
            ['altar feature', ALTAR],
        ]) {
            const options = terrain === FOUNTAIN ? 'OPTIONS=blind' : '';
            const { destination, x, y } = await prepareHeroMoveAdmission(
                options,
            );
            destination.typ = terrain;
            const head = installFloorPile(x, y, 1);
            const before = structuredClone(head);
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            game.context.move = 0;
            game.domoveAttempting = 0;
            game.nhDisplay.pushKey(commandKeyCode('m'));
            game.nhDisplay.pushKey(commandKeyCode('l'));

            await rhack(0, game);

            assert.deepEqual([game.u.ux, game.u.uy], [x, y], name);
            assert.equal(game.level.objects[x][y], head, name);
            assert.deepEqual(structuredClone(head), before, name);
            assert.equal(game._ttyToplines, '', name);
            assert.equal(game.context.nopick, 1, name);
        }
    });

function installFloorPile(x, y, count = 2, firstOverrides = {}) {
    let head = null;
    for (let index = count - 1; index >= 0; --index) {
        head = {
            o_id: 7000 + index,
            otyp: DART,
            oclass: WEAPON_CLASS,
            corpsenm: PM_NEWT,
            quan: 1,
            where: OBJ_FLOOR,
            dknown: false,
            nobj: null,
            nexthere: head,
            ...(index === 0 ? firstOverrides : {}),
        };
    }
    game.level.objects[x][y] = head;
    return head;
}

test('movement-admission snapshots detect every atomic owner they claim',
    async () => {
        const { replay, x, y } = await prepareHeroMoveAdmission();
        const floorObject = installFloorPile(x, y, 2);
        const secondFloorObject = floorObject.nexthere;
        const monster = newMonster({
            m_id: 987654,
            mx: x + 1,
            my: y,
            mhp: 1,
            mcanmove: true,
        });
        game.level.monlist = monster;
        game.level.monsters[monster.mx][monster.my] = monster;
        const before = heroMoveAdmissionSnapshot(replay);
        const cases = [
            {
                name: 'floor discovery',
                mutate: () => { floorObject.dknown = !floorObject.dknown; },
                restore: () => { floorObject.dknown = !floorObject.dknown; },
            },
            {
                name: 'floor link',
                mutate: () => { floorObject.nexthere = null; },
                restore: () => { floorObject.nexthere = secondFloorObject; },
            },
            {
                name: 'hero room buffers',
                mutate: () => { game.u.urooms = 'Z'; },
                restore: () => { game.u.urooms = before.hero.urooms; },
            },
            {
                name: 'remembered map',
                mutate: () => { game.level.at(x, y).seenv ^= 1; },
                restore: () => { game.level.at(x, y).seenv ^= 1; },
            },
            {
                name: 'vision',
                mutate: () => { game.viz_array[y][x] ^= IN_SIGHT; },
                restore: () => { game.viz_array[y][x] ^= IN_SIGHT; },
            },
            {
                name: 'monster state',
                mutate: () => { monster.mfleetim += 1; },
                restore: () => { monster.mfleetim -= 1; },
            },
        ];

        for (const oracle of cases) {
            oracle.mutate();
            assert.notDeepEqual(
                heroMoveAdmissionSnapshot(replay),
                before,
                oracle.name,
            );
            oracle.restore();
            assert.deepEqual(
                heroMoveAdmissionSnapshot(replay),
                before,
                `${oracle.name} restoration`,
            );
        }
    });

test('a walk opens and dismisses ordinary two-to-four-object pile windows',
    async () => {
        for (const [count, pileLimit] of [[2, 5], [4, 5], [2, 0]]) {
            const { replay, x, y } = await prepareHeroMoveAdmission();
            game.flags.pickup = false;
            game.flags.pile_limit = pileLimit;
            const head = installFloorPile(x, y, count);
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            game.context.run = 1;
            game.multi = COLNO;
            const screensBefore = replay.getScreens().length;
            game.nhDisplay.pushKey(commandKeyCode(' '));

            await domove(game);

            assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
            assert.equal(game.level.objects[x][y], head);
            assert.equal(game.context.run, 0);
            assert.equal(game.multi, 0);
            assert.equal(replay.getScreens().length, screensBefore + 1);
            let observed = 0;
            for (let object = head; object; object = object.nexthere) {
                assert.equal(object.dknown, true);
                ++observed;
            }
            assert.equal(observed, count);
        }
    });

test('a walk admits a multibyte name to the ordinary object-pile window',
    async () => {
        const { replay, x, y } = await prepareHeroMoveAdmission();
        game.flags.pickup = false;
        game.flags.pile_limit = 5;
        // The two-byte final character reaches the byte-window renderer while
        // the second object keeps this on look_here()'s pile branch.
        const head = installFloorPile(x, y, 2, {
            oextra: { oname: 'caf\u00e9' },
        });
        clearTtyMessageWindow(game);
        game._ttyToplines = '';
        const screensBefore = replay.getScreens().length;
        game.nhDisplay.pushKey(commandKeyCode(' '));

        await domove(game);

        assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
        assert.equal(game.level.objects[x][y], head);
        assert.equal(replay.getScreens().length, screensBefore + 1);
        assert.equal(head.dknown, true);
        assert.equal(game.nhDisplay.inputQueueLength, 0);
    });

test('a walk reports decorated pile terrain on menu and count paths',
    async () => {
        for (const [label, counted, decorate] of [
            ['staircase menu', false, (destination, x, y) => {
                destination.typ = STAIRS;
                // The relocated down staircase supplies the complete record
                // stairs_description() reads for this synthetic destination.
                const stway = stairway_find_dir(false, game);
                stway.sx = x;
                stway.sy = y;
            }],
            ['doorway count', true, (destination) => {
                destination.typ = DOOR;
                destination.flags = destination.doormask = D_NODOOR;
            }],
        ]) {
            const { destination, replay, x, y } =
                await prepareHeroMoveAdmission();
            decorate(destination, x, y);
            game.flags.pickup = false;
            game.flags.pile_limit = counted ? 2 : 5;
            const head = installFloorPile(x, y, 2);
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            if (!counted) {
                // The menu is the next input boundary; Space dismisses it.
                game.nhDisplay.pushKey(commandKeyCode(' '));
            }
            const screensBefore = replay.getScreens().length;

            await domove(game);

            assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
            if (counted) {
                const terrain = game._ttyToplines.indexOf(
                    'There is a doorway here.',
                );
                const count = game._ttyToplines.indexOf(
                    'There are two objects here.',
                );
                assert.ok(terrain >= 0, label);
                assert.ok(count > terrain, label);
            } else {
                assert.ok(replay.getScreens().length > screensBefore, label);
                for (let object = head; object; object = object.nexthere)
                    assert.equal(object.dknown, true, label);
            }
        }
    });

test('a walk reports every ordinary pile-limit count partition without names',
    async () => {
        for (const [count, expected, typ] of [
            // Two has its dedicated word and exercises an ordinary room.
            [2, 'two', ROOM],
            // Three is the lower edge of "a few" and uses a corridor.
            [3, 'a few', CORR],
            // Five is the lower edge of "several".
            [5, 'several', ROOM],
            // Nine is the upper edge of "several".
            [9, 'several', CORR],
            // Ten is the lower edge of "many".
            [10, 'many', ROOM],
        ]) {
            const { destination, x, y } = await prepareHeroMoveAdmission();
            destination.typ = typ;
            game.flags.pickup = false;
            // Equality selects the count arm and pins the inclusive
            // `pileCount >= pile_limit` edge for every source partition.
            game.flags.pile_limit = count;
            const head = installFloorPile(x, y, count);
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            // Nonzero run and multi sentinels prove check_here() calls
            // nomul(0) before it reports the count.
            game.context.run = 1;
            game.multi = COLNO;

            await domove(game);

            assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
            assert.equal(game.level.objects[x][y], head);
            assert.equal(game.context.run, 0);
            assert.equal(game.multi, 0);
            assert.equal(
                game._ttyToplines,
                `There are ${expected} objects here.`,
            );
            for (let object = head; object; object = object.nexthere)
                assert.equal(object.dknown, false, `count ${count}`);
        }
    });

test('a triggering pile inside a visible region is refused before movement',
    async () => {
        const { x, y } = await prepareHeroMoveAdmission();
        const source = { x: game.u.ux, y: game.u.uy };
        game.flags.pickup = false;
        game.flags.pile_limit = 2;
        installFloorPile(x, y, 2);
        const region = create_region([{
            lx: Math.min(source.x, x),
            ly: Math.min(source.y, y),
            hx: Math.max(source.x, x),
            hy: Math.max(source.y, y),
        }]);
        region.visible = true;
        region.hero_inside = true;
        game.level.regions.push(region);
        const toplinesBefore = game._ttyToplines;

        await assert.rejects(
            domove(game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && error.message.includes(
                    'visible region over skipped-pile count',
                ),
        );
        assert.deepEqual([game.u.ux, game.u.uy], [source.x, source.y]);
        assert.equal(game._ttyToplines, toplinesBefore);
    });

test('a single object inside an entered visible region refuses atomically',
    async () => {
        const target = await prepareHeroMoveAdmission();
        const source = { x: game.u.ux, y: game.u.uy };
        game.flags.pickup = false;
        // Zero keeps one object on invent.c look_here()'s naming path.
        game.flags.pile_limit = 0;
        installFloorPile(target.x, target.y, 1);
        const region = create_region([{
            lx: Math.min(source.x, target.x),
            ly: Math.min(source.y, target.y),
            hx: Math.max(source.x, target.x),
            hy: Math.max(source.y, target.y),
        }]);
        region.visible = true;
        region.hero_inside = true;
        game.level.regions.push(region);
        const before = heroMoveAdmissionSnapshot(target.replay);

        await assert.rejects(
            domove(game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason
                    === 'visible region over single-object description',
        );
        assert.deepEqual(heroMoveAdmissionSnapshot(target.replay), before);
    });

test('pile_limit zero leaves a single object on the naming path', async () => {
    const { x, y } = await prepareHeroMoveAdmission();
    game.flags.pickup = false;
    game.flags.pile_limit = 0;
    installFloorPile(x, y, 1);
    clearTtyMessageWindow(game);
    game._ttyToplines = '';

    await domove(game);

    assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
    assert.match(game._ttyToplines, /dart/u);
    assert.doesNotMatch(game._ttyToplines, /objects here/u);
    assert.equal(game.level.objects[x][y].dknown, true);
});

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
            name: 'single-object pile-limit count',
            reason: 'single-object skipped-pile count',
            setup: ({ x, y }) => {
                // One is the only threshold which makes a single floor object
                // enter the count arm that this pile slice excludes.
                game.flags.pile_limit = 1;
                game.level.objects[x][y] = {
                    // The first valid object identity and one ordinary dart
                    // provide a complete single-node floor chain.
                    o_id: 1,
                    otyp: DART,
                    oclass: WEAPON_CLASS,
                    quan: 1,
                    where: OBJ_FLOOR,
                    nexthere: null,
                };
            },
        },
        {
            name: 'non-triggering five-object pile',
            reason: 'object pile outside the two-to-four-item window',
            setup: ({ x, y }) => {
                // Five is the first pile count outside the preceding menu
                // slice; zero keeps skipping disabled.
                installFloorPile(x, y, 5);
                game.flags.pile_limit = 0;
            },
        },
        {
            name: 'blind cockatrice pile',
            reason: 'blind object pile',
            setup: ({ x, y }) => {
                installFloorPile(x, y, 2, {
                    otyp: CORPSE,
                    oclass: FOOD_CLASS,
                    corpsenm: PM_COCKATRICE,
                });
                game.u.uprops[BLINDED].intrinsic = 1;
            },
        },
        {
            name: 'mention-decor pile-limit count',
            reason: 'mention-decor pile-limit count',
            setup: ({ x, y }) => {
                installFloorPile(x, y);
                game.flags.mention_decor = true;
                // An equal threshold selects the deferred count branch after
                // the ordinary terrain preflight has accepted its memory.
                game.flags.pile_limit = 2;
                game.iflags.prev_decor = ROOM;
            },
        },
        {
            name: 'hidden pit',
            reason: 'trap activation',
            setup: ({ x, y }) => {
                installFloorPile(x, y);
                // tseen=false models a legally enterable hidden trap.
                game.level.traps.push({
                    tx: x, ty: y, ttyp: PIT, tseen: false,
                });
            },
        },
        // trap.c preflight_dotrap()'s three stops beyond the trap type. Each
        // is asked here, ahead of the move, because spoteffects() calls
        // dotrap() after the hero has already stepped onto the square and
        // pickup(1) has already described what is on it; refusing there would
        // land after both.
        {
            // trap.c dotrap():3035-3044 answers a trap the hero already knows
            // with a one-in-five rn2(5) escape, and both that branch and the
            // fly-over at :3027-3032 name the trap through trapname().
            name: 'bear trap the hero has seen',
            reason: 'a trap the hero has already seen',
            setup: ({ x, y }) => {
                installFloorPile(x, y);
                game.level.traps.push({
                    tx: x, ty: y, ttyp: BEAR_TRAP, tseen: true,
                });
            },
        },
        {
            // trap.c:1517-1518 answers iron shoes with Yname2(uarmf).
            name: 'bear trap under iron shoes',
            reason: 'iron shoes in a bear trap',
            setup: ({ x, y }) => {
                installFloorPile(x, y);
                game.level.traps.push({
                    tx: x, ty: y, ttyp: BEAR_TRAP, tseen: false,
                });
                // IRON_SHOES is the one boot type objects.c gives oc_material
                // IRON, which is the whole of wearing_iron_shoes()'s test.
                game.uarmf = {
                    o_id: 90, otyp: IRON_SHOES, oclass: ARMOR_CLASS,
                    quan: 1, owornmask: W_ARMF, where: OBJ_INVENT,
                };
            },
        },
        {
            name: 'lava under pile',
            reason: 'door or special terrain movement',
            setup: ({ destination, x, y }) => {
                destination.typ = LAVAPOOL;
                installFloorPile(x, y);
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
                installFloorPile(x, y);
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
                installFloorPile(x, y);
                game.head_engr = {
                    engr_x: x,
                    engr_y: y,
                    engr_txt: ['Elbereth'],
                    nxt_engr: null,
                };
            },
        },
        // An ordinary hostile at the destination is no longer an admission
        // case at all: hack.c domove_core() hands it to uhitm.c do_attack(),
        // which spends the turn. What is still refused ahead of every
        // mutation is a target the hero has not detected, which C decides at
        // domove_attackmon_at():1968 before do_attack() is called.
        {
            name: 'hidden monster at destination',
            reason: 'attacking a hidden monster',
            setup: ({ x, y }) => {
                game.level.monsters[x][y] = {
                    mx: x, my: y, mhp: 1, mundetected: 1,
                };
            },
        },
        // hack.c:1972's displacer-beast swap short-circuits on the species
        // before its !rn2(2), so the refusal has to cost no draw -- which the
        // snapshot below checks along with everything else.
        {
            name: 'displacer beast at destination',
            reason: 'displacer beast position swap',
            setup: ({ x, y }) => {
                game.level.monsters[x][y] = newMonster({
                    mx: x, my: y, mhp: 3, mhpmax: 3, mcanmove: 1,
                    data: game.mons[PM_DISPLACER_BEAST],
                });
            },
        },
        // is_safemon() sends a spotted peaceful monster down do_attack()'s
        // swap arm at uhitm.c:461, and everything that arm does past the
        // rn2(7) is written for the starting pet. Any other peaceful stops.
        {
            name: 'peaceful non-pet at destination',
            reason: 'peaceful monster displacement',
            setup: ({ x, y }) => {
                game.level.monsters[x][y] = newMonster({
                    mx: x, my: y, mhp: 3, mhpmax: 3, mcanmove: 1,
                    // A distinct m_id is what makes it not the starting pet;
                    // this recipe has pettype:none, so there is no pet at all.
                    m_id: 4242,
                    mpeaceful: 1,
                    data: game.mons[PM_NEWT],
                });
                assert.notEqual(game.context.startingpet_mid, 4242);
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

// With `safe_pet` off, is_safemon() is false for the hero's own pet, so
// uhitm.c do_attack() takes its hostile arm at 511 rather than the swap arm.
// attack_checks()'s confirm test at 300-320 is what stops it there: the pet is
// peaceful and the hero is neither confused, hallucinating nor stunned, so C
// asks "Really attack your kitten?" through paranoid_query(), which has no
// port. The stop still costs nothing, because the test precedes every draw.
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
        const drawsBefore = replay.getRngLog().length;

        // The first attempt is not silent: hack.c:2790-2792 runs nomul(0) for
        // a target that fails is_safemon(), which normalizes context.mv,
        // context.travel, context.travel1 and multi. Comparing the second
        // attempt with the first is what shows the keystroke is retryable,
        // and the random-number log is what shows the stop is free.
        let previous = null;
        for (let attempt = 0; attempt < 2; ++attempt) {
            await assert.rejects(
                domove(game),
                (error) => (
                    error instanceof UnsupportedHeroMoveBoundaryError
                    && error.reason
                        === 'confirming an attack on a peaceful monster'
                ),
            );
            const snapshot = heroMoveAdmissionSnapshot(replay);
            if (previous)
                assert.deepEqual(snapshot, previous, `attempt ${attempt + 1}`);
            previous = snapshot;
            assert.equal(replay.getRngLog().length, drawsBefore);
        }
        assert.equal(game.multi, 0);
        assert.deepEqual([game.u.umoved, game.domoveAttempting], [false, 1]);
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

// Place the hero on an intact doorway with the pet on the diagonal it would
// step to. hack.c:2798 reaches domove_attackmon_at() and hack.c:2843 reaches
// test_move(), in that order, so the doorway exit rule decides the step only
// after do_attack() has had its turn -- and the two seeds below split on what
// do_attack() answers.
function petOnRefusedDiagonal(name) {
    const [x, y] = [game.u.ux + 1, game.u.uy - 1];
    game.level.at(game.u.ux, game.u.uy).typ = DOOR;
    game.level.at(game.u.ux, game.u.uy).flags = D_ISOPEN;
    const destination = game.level.at(x, y);
    destination.typ = ROOM;
    destination.flags = 0;
    const pet = game.level.monlist;
    assert.ok(pet?.mtame, `the starting pet is on the level for ${name}`);
    game.level.monsters[pet.mx][pet.my] = null;
    pet.mx = x;
    pet.my = y;
    game.level.monsters[x][y] = pet;
    return { pet, x, y };
}

function petDoorwaySegment(seed, name) {
    return {
        seed,
        datetime: COMMAND_DATETIME,
        nethackrc: `OPTIONS=name:${name},role:Valkyrie,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    };
}

// uhitm.c:474 evaluates `foo = (Punished || !rn2(7) || ...)` inside
// do_attack()'s is_safemon branch. On the `!rn2(7)` outcome the pet refuses to
// swap: uhitm.c:497 makes it flee for rnd(6) turns, :500 prints the line and
// :502 returns TRUE, which ends domove_core() at hack.c:2799 without ever
// reaching test_move(). The turn is spent even though the hero has not moved.
test('a pet that refuses the swap ends the step before test_move()',
    async () => {
        const replay = await runSegment(
            petDoorwaySegment(840024, 'PetDoorway'),
        );
        const { pet, x, y } = petOnRefusedDiagonal('PetDoorway');
        const before = { ux: game.u.ux, uy: game.u.uy };
        const drawsBefore = replay.getRngLog().length;

        game.nhDisplay.pushKey(commandKeyCode('u'));
        await moveloop_core();

        // Both draws belong to do_attack(); the doorway rule below it draws
        // nothing, so this pins the whole cost of the step.
        assert.deepEqual(
            replay.getRngLog().slice(drawsBefore),
            ['rn2(7)=0', 'rnd(6)=3'],
            'do_attack() drew before anything looked at the doorway',
        );
        assert.equal(
            game._pending_message,
            'You stop.  Your little dog is in the way!',
        );
        assert.deepEqual([game.u.ux, game.u.uy], [before.ux, before.uy]);
        assert.deepEqual([pet.mx, pet.my], [x, y], 'nobody swapped');
        assert.equal(pet.mflee, true);
        assert.equal(pet.mfleetim, 3);
        // uhitm.c:502 returns TRUE, so svc.context.move survives the step and
        // the turn elapses on the next moveloop_core().
        assert.equal(game.context.move, 1);
    });

// The other outcome of the same draw. do_attack() falls through to uhitm.c:509
// and returns FALSE, domove_core() carries on to test_move() at hack.c:2843,
// and the exit rule at hack.c:1208 declines the diagonal. hack.c:2844-2847
// answers that with `svc.context.move = 0; nomul(0)`, so this step costs the
// draw and nothing else.
test('a declined attack still reaches the doorway exit rule', async () => {
    const replay = await runSegment(petDoorwaySegment(840026, 'PetLingers'));
    const { pet, x, y } = petOnRefusedDiagonal('PetLingers');
    const before = { ux: game.u.ux, uy: game.u.uy };
    const drawsBefore = replay.getRngLog().length;

    game.nhDisplay.pushKey(commandKeyCode('u'));
    await moveloop_core();

    // Six is not zero, so `foo` is false and do_attack() declines the step.
    assert.deepEqual(
        replay.getRngLog().slice(drawsBefore),
        ['rn2(7)=6'],
        'the draw happened even though test_move() refused the step',
    );
    assert.equal(game._pending_message, '');
    assert.deepEqual([game.u.ux, game.u.uy], [before.ux, before.uy]);
    assert.deepEqual([pet.mx, pet.my], [x, y], 'nobody swapped');
    assert.equal(pet.mflee, false);
    assert.equal(game.context.move, 0, 'the refused diagonal spent no turn');
});

// hack.c domove_bump_mon() (1925-1948) runs at hack.c:2794, above the
// do_attack() call this slice moved. With the reqmenu prefix pending it prints
// "Pardon me, <pet>." and spends the turn without reaching do_attack() at all,
// so the port cannot admit the step and let the swap happen. The control run
// is what makes this a test of the prefix rather than of the geometry: the
// same two squares swap normally when nothing precedes the movement key.
test('the reqmenu prefix refuses a step into a monster', async () => {
    for (const prefixed of [false, true]) {
        const label = prefixed ? 'with m' : 'without m';
        const replay = await runSegment(petDoorwaySegment(840026, 'PetBump'));
        const pet = game.level.monlist;
        assert.ok(pet?.mtame, label);
        const [x, y] = [game.u.ux + 1, game.u.uy];
        const start = [game.u.ux, game.u.uy];
        game.level.monsters[pet.mx][pet.my] = null;
        pet.mx = x;
        pet.my = y;
        game.level.monsters[x][y] = pet;
        const drawsBefore = replay.getRngLog().length;

        if (prefixed) game.nhDisplay.pushKey(commandKeyCode('m'));
        game.nhDisplay.pushKey(commandKeyCode('l'));

        if (!prefixed) {
            await moveloop_core();
            // Six is not zero, so do_attack() declines and the swap runs.
            assert.deepEqual(replay.getRngLog().slice(drawsBefore),
                ['rn2(7)=6'], label);
            assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
            assert.deepEqual([pet.mx, pet.my], start, label);
            continue;
        }
        await assert.rejects(
            moveloop_core(),
            (error) => error.reason === 'reqmenu bump into a monster',
            label,
        );
        // C spends the turn on the bump; the port spends nothing and stops,
        // so neither the draw nor the swap may have happened.
        assert.equal(replay.getRngLog().length, drawsBefore, label);
        assert.deepEqual([game.u.ux, game.u.uy], start, label);
        assert.deepEqual([pet.mx, pet.my], [x, y], label);
        // The seam runs ahead of cmd.c set_move_cmd(), which is what lets
        // executeMovement() unwind the keystroke completely. A refusal raised
        // below domove() instead would leave context.move set, and the next
        // moveloop_core() would charge the hero for a turn that never ran.
        assert.deepEqual({
            nopick: game.context.nopick,
            move: game.context.move,
            menuRequested: game.iflags.menu_requested,
            attempting: game.domoveAttempting,
        }, {
            nopick: 0, move: 0, menuRequested: false, attempting: 0,
        }, label);
    }
});

// The swap-consequence gates in requireOrdinaryStartingPetSwap() guard
// domove_swap_with_pet(), which C calls at hack.c:2922 -- long after the
// test_move() that declines this step. Running them ahead of do_attack() is
// therefore wider than C, which never consults them here. The widening is
// deliberate: both stop the port, and this seam stops it one call earlier
// than the terrain rule would. A trap on the destination is what shows it,
// because a bare pet square passes every gate.
test('the pet-swap gates refuse a diagonal C declines at test_move()',
    async () => {
        const replay = await runSegment(
            petDoorwaySegment(840026, 'TrapDoorway'),
        );
        const { x, y } = petOnRefusedDiagonal('TrapDoorway');
        game.level.traps = [{ tx: x, ty: y, ttyp: PIT, tseen: false }];
        const drawsBefore = replay.getRngLog().length;

        game.nhDisplay.pushKey(commandKeyCode('u'));
        await assert.rejects(
            moveloop_core(),
            (error) => error.reason === 'pet swap trap interaction',
        );
        // The seam runs before movement intent is committed, so the refusal
        // costs the draw the same step spent in the test above.
        assert.equal(replay.getRngLog().length, drawsBefore);
    });

// The mirror of the pet case above, and the ordering it protects.
// domove_core() takes m_at() at hack.c:2762 and reaches domove_attackmon_at()
// at 2794, well before test_move() at 2841, so a HOSTILE on the diagonal is
// attacked whatever the doorway rules would say -- uhitm.c do_attack() has no
// diagonal-doorway test. The seam briefly admitted the step ahead of its
// monster branch, which turned this honest stop into a silent refusal: the
// port declined the move and never attacked, where C attacks.
//
// Now that the hostile arm is ported the swing really happens, so what the
// refused diagonal has to leave behind is the attempt's draws rather than a
// boundary. A doorway rule consulted first would leave none.
test('a hostile on a refused diagonal is attacked, not declined', async () => {
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
    // A real species, so the swing can read its armor class through worn.c
    // find_mac() and its empty attack slot through uhitm.c passive(). The
    // copy's armor class is far below anything the dungeon generates, which
    // makes find_roll_to_hit() return a number no rnd(20) can fall under: the
    // swing misses whatever this seed rolls, and the case stays about the
    // ordering rather than about the combat arithmetic.
    const hostile = newMonster({
        mx: x,
        my: y,
        mhp: 3,
        mhpmax: 3,
        // newMonster() leaves mcanmove clear, which would put
        // mon_maybe_unparalyze()'s rn2(10) between the exercise draw and the
        // to-hit roll. This case is about which subsystem runs first, so the
        // target is mobile and the sequence stays the ordinary four.
        mcanmove: 1,
        data: { ...game.mons[PM_LICHEN], ac: -30 },
    });
    game.level.monsters[x] ??= [];
    game.level.monsters[x][y] = hostile;
    const drawsBefore = replay.getRngLog().length;

    game.nhDisplay.pushKey(commandKeyCode('u'));
    await moveloop_core();

    // The hero stayed put -- do_attack() returns TRUE and domove_core() ends
    // at 2799 -- and the four melee calls were spent all the same.
    assert.deepEqual([game.u.ux, game.u.uy], [x - 1, y + 1]);
    assert.deepEqual(
        replay.getRngLog().slice(drawsBefore, drawsBefore + 4).map(
            (entry) => entry.split('=')[0],
        ),
        ['rn2(20)', 'rn2(19)', 'rnd(20)', 'rn2(3)'],
    );
    assert.equal(game._pending_message, 'You miss the lichen.');
    assert.equal(hostile.mhp, 3);
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

test('retried reqmenu movement retains its no-pick prefix', async () => {
    const replay = await runSegment({
        // This independent seed supplies an ordinary adjacent square; the
        // test replaces its terrain and object so only retry ownership varies.
        seed: 840005,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:PendingMenuMove,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,autopickup',
        moves: '',
    });
    clearTtyMessageWindow(game);
    resetCommandVars(game);
    const start = [game.u.ux, game.u.uy];
    const x = start[0] + 1;
    const y = start[1];
    const east = game.level.at(x, y);
    // ICE is the first type outside IS_FURNITURE(), so the first attempt
    // reaches the destination boundary after both prefix bytes are parsed.
    east.typ = ICE;
    east.flags = east.doormask = 0;
    for (const column of game.level.monsters) column.fill(null);
    game.level.monlist = null;
    const floorObject = installFloorPile(x, y, 1);
    game.level.traps = [];
    game.level.regions = [];
    game.head_engr = null;
    game.nhDisplay.pushKey(commandKeyCode('m'));
    // `l` names the prepared square one column east of the hero.
    game.nhDisplay.pushKey(commandKeyCode('l'));

    let pendingCommand = null;
    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            moveloop_core(),
            (error) => (
                error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'door or special terrain movement'
            ),
        );
        assert.equal(game.context.pendingCommand.key, commandKeyCode('l'));
        assert.equal(game.context.pendingCommand.menuRequested, true);
        if (pendingCommand === null) {
            pendingCommand = structuredClone(game.context.pendingCommand);
        } else {
            assert.deepEqual(game.context.pendingCommand, pendingCommand);
        }
        assert.deepEqual([game.u.ux, game.u.uy], start);
        assert.equal(game.level.objects[x][y], floorObject);
        assert.deepEqual(replay.getRngSlices().at(-1), []);
    }

    east.typ = ROOM;
    await moveloop_core();

    assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
    assert.equal(game.level.objects[x][y], floorObject);
    assert.equal(game.context.nopick, 1);
    assert.equal(game.context.pendingCommand, undefined);
});

// The `F` sibling of the test above. The prefix effect the retry has to carry
// is context.forcefight itself, and executeMovement()'s catch runs
// resetCommandVars() on the refusal, so the live flag is 0 by the time the
// next attempt starts: only captureParsedCommand()/restoreParsedCommand() can
// put it back. Replayed as a plain walk instead, the same keystroke steps onto
// the square rather than swinging at it, which is the difference the last
// three assertions read.
test('retried fight movement retains its force-fight prefix', async () => {
    const replay = await runSegment({
        // This independent seed supplies an ordinary adjacent square; the
        // test replaces its contents so only retry ownership varies.
        seed: 840006,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:PendingFightMove,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!autopickup',
        moves: '',
    });
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    resetCommandVars(game);
    const start = [game.u.ux, game.u.uy];
    const x = start[0] + 1;
    const y = start[1];
    const east = game.level.at(x, y);
    east.typ = ROOM;
    east.flags = east.doormask = 0;
    for (const column of game.level.monsters) column.fill(null);
    game.level.objects[x][y] = null;
    game.level.traps = [];
    game.level.regions = [];
    game.head_engr = null;
    // preflightDomoveDestination()'s forcefight arm admits every empty square,
    // so a destination monster is the only admission failure a force-fight can
    // reach. An undetected one is the monster the seam still refuses under the
    // prefix, where a spotted hostile would be attacked and would draw. The
    // species is immaterial -- hack.c domove_attackmon_at():1968 reads the
    // mundetected flag -- so a newt keeps the placement cheap.
    const hidden = newMonster({
        m_id: 840601,
        mx: x,
        my: y,
        mhp: 3,
        mcanmove: true,
        data: game.mons[PM_NEWT],
    });
    hidden.mundetected = 1;
    game.level.monsters[x][y] = hidden;
    game.level.monlist = hidden;
    game.nhDisplay.pushKey(commandKeyCode('F'));
    // `l` names the prepared square one column east of the hero.
    game.nhDisplay.pushKey(commandKeyCode('l'));

    let pendingCommand = null;
    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            moveloop_core(),
            (error) => (
                error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'attacking a hidden monster'
            ),
        );
        assert.equal(game.context.pendingCommand.key, commandKeyCode('l'));
        assert.equal(game.context.pendingCommand.forcefight, true);
        // The refusal reset the live flag, so the capture is the only record
        // of the prefix left when the next attempt reads it back.
        assert.equal(game.context.forcefight, 0);
        if (pendingCommand === null) {
            pendingCommand = structuredClone(game.context.pendingCommand);
        } else {
            assert.deepEqual(game.context.pendingCommand, pendingCommand);
        }
        assert.deepEqual([game.u.ux, game.u.uy], start);
        assert.deepEqual(replay.getRngSlices().at(-1), []);
    }

    game.level.monsters[x][y] = null;
    game.level.monlist = null;
    await moveloop_core();

    // hack.c domove_fight_empty()'s thin-air arm (2314-2316): the swing spends
    // the turn where the square is accessible and holds nothing, and the hero
    // stays put. A retry that lost the prefix would have walked onto it in
    // silence instead.
    assert.deepEqual([game.u.ux, game.u.uy], start);
    assert.equal(game._ttyToplines, 'You attack thin air.');
    assert.equal(game.context.pendingCommand, undefined);
});

// The other half of do_fight()'s effect. cmd.c do_fight():1632 sets
// gd.domove_attempting |= DOMOVE_WALK beside svc.context.forcefight, and
// rhack():3785 picks the walk arm from that word rather than from the run value
// the row carries; set_move_cmd():1396 leaves svc.context.run alone while the
// word is set. The test above cannot see the difference, because a plain
// direction key is run mode 0 and a retry that rebuilt the word from scratch
// would reach DOMOVE_WALK and svc.context.run 0 anyway.
//
// A shift-direction key can, and one is reachable behind the `F` prefix. The
// eight do_move_<dir> rows are the only ones carrying CMD_gGF_PREFIX
// (cmd.c:2009-2023), so a bare `FL` is turned away at rhack():3693-3722; but
// was_m_prefix latches on do_reqmenu() and is never cleared (3771-3772), so
// after `mF` the accepted flag is CMD_M_PREFIX, which do_run_east does carry
// (cmd.c:2051). `mFL` therefore reaches the dispatch with DOMOVE_WALK set and
// run mode 1, where C spends the turn on one forced swing and clears
// svc.context.forcefight after it.
test('retried fight movement retains its committed walk intent', async () => {
    const replay = await runSegment({
        // The seed and square the sibling test above prepares, for the same
        // reason: only retry ownership varies.
        seed: 840006,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:PendingWalkIntent,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none,!autopickup',
        moves: '',
    });
    clearTtyMessageWindow(game);
    game._ttyToplines = '';
    resetCommandVars(game);
    const start = [game.u.ux, game.u.uy];
    const x = start[0] + 1;
    const y = start[1];
    const east = game.level.at(x, y);
    east.typ = ROOM;
    east.flags = east.doormask = 0;
    for (const column of game.level.monsters) column.fill(null);
    game.level.objects[x][y] = null;
    game.level.traps = [];
    game.level.regions = [];
    game.head_engr = null;
    // The undetected newt of the sibling test. hack.c runStopsBeforeMonster()
    // answers FALSE for it at every run value, because display.h mon_visible()
    // reads mundetected, so the run mode does not change which refusal the
    // destination reaches.
    const hidden = newMonster({
        m_id: 840602,
        mx: x,
        my: y,
        mhp: 3,
        mcanmove: true,
        data: game.mons[PM_NEWT],
    });
    hidden.mundetected = 1;
    game.level.monsters[x][y] = hidden;
    game.level.monlist = hidden;
    game.nhDisplay.pushKey(commandKeyCode('m'));
    game.nhDisplay.pushKey(commandKeyCode('F'));
    // `L` is run-east, the shift-direction row `F` alone could not prefix.
    game.nhDisplay.pushKey(commandKeyCode('L'));

    for (let attempt = 0; attempt < 2; ++attempt) {
        await assert.rejects(
            moveloop_core(),
            (error) => (
                error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === 'attacking a hidden monster'
            ),
        );
        assert.equal(game.context.pendingCommand.key, commandKeyCode('L'));
        // js/const.js and js/cmd.js hold the same DOMOVE_WALK bit; the
        // capture has to carry it, because resetCommandVars() zeroed the
        // live word on the refusal and no later input can rebuild it.
        assert.equal(
            game.context.pendingCommand.domoveAttempting,
            DOMOVE_WALK,
        );
        assert.equal(game.domoveAttempting, 0);
    }

    game.level.monsters[x][y] = null;
    game.level.monlist = null;
    await moveloop_core();

    // The walk arm swings once and clears the prefix. A retry that lost the
    // word takes rhack()'s DOMOVE_RUSH arm instead, which skips
    // `svc.context.forcefight = 0` and leaves the next movement command a
    // force-fight the player never typed.
    assert.deepEqual([game.u.ux, game.u.uy], start);
    assert.equal(game._ttyToplines, 'You attack thin air.');
    assert.equal(game.context.forcefight, 0);
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
    // a_gname() arm, and it raises the movement class rather than letting
    // UnsupportedFeatureDescriptionError travel. js/cmd.js runs domove()
    // inside failClosedCommand(), so either class would end the segment, but
    // js/jsmain.js breaks directly on the movement class and reaches the other
    // only through that wrapper. The assertion is therefore on the class the
    // hero-move seam raises.
    await assert.rejects(
        domove(game),
        (error) => error instanceof UnsupportedHeroMoveBoundaryError
            && error.message.includes('terrain feature description'),
    );
});

// invent.c look_here()'s blind arm names what the hero feels underfoot with
// dungeon.c surface(), and js/dungeon.js surface() now answers every terrain
// this seam admits. Until it did, a blind arrival on furniture or a doorway
// holding an object threw a bare Error straight out of runSegment() and
// discarded the segment's matching prefix; OPTIONS=blind reaches this from
// turn one through u.uroleplay.blind, so it was not hypothetical.
// invent.c:4210-4211 drops the dfeature line when it repeats the surface,
// which is why the fountain row expects no second line and the grave row does.
// An altar is the one admitted square that still stops, one guard below, for
// dfeature_at()'s a_gname(); the test above owns that row.
test('a blind hero feels the surface named under one object', async () => {
    for (const [label, surf, feature, decorate] of [
        ['fountain', 'fountain', null, (destination) => {
            destination.typ = FOUNTAIN;
        }],
        // SINK and THRONE have no arm of their own in surface(): rm.h:126
        // makes IS_ROOM(typ) `typ >= ROOM`, so both fall through to "floor"
        // while dfeature_at() still names them.
        ['sink', 'floor', 'There is a sink here.', (destination) => {
            destination.typ = SINK;
        }],
        ['throne', 'floor', 'There is an opulent throne here.',
            (destination) => {
                destination.typ = THRONE;
            }],
        ['grave', 'headstone', 'There is a grave here.', (destination) => {
            destination.typ = GRAVE;
        }],
        ['staircase', 'stairs', 'There is a staircase down here.',
            (destination, x, y) => {
                destination.typ = STAIRS;
                // On_stairs() reads the stairway list, not the terrain, so
                // move the level's own down staircase onto the square.
                const stway = stairway_find_dir(false, game);
                stway.sx = x;
                stway.sy = y;
            }],
        ['open doorway', 'doorway', 'There is an open door here.',
            (destination) => {
                destination.typ = DOOR;
                destination.flags = destination.doormask = D_ISOPEN;
            }],
        ['room', 'floor', null, () => {}],
        ['corridor', 'ground', null, (destination) => {
            destination.typ = CORR;
        }],
    ]) {
        const expected = [
            `You try to feel what is lying here on the ${surf}.`,
            ...(feature ? [feature] : []),
            'You feel here a dart.',
        ].join(' ');
        // The tty packs as many messages onto a topline as fit beside the
        // --More--, so the split between toplines is not one per message.
        // Replay the turn with one more queued space each time and collect the
        // topline it stops on; the run that needs no further key completes.
        const seen = [];
        for (let dismissals = 0; dismissals <= 3; ++dismissals) {
            const { destination, x, y } = await prepareHeroMoveAdmission();
            decorate(destination, x, y);
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
            clearTtyMessageWindow(game);
            game._ttyToplines = '';
            for (let key = 0; key < dismissals; ++key)
                game.nhDisplay.pushKey(commandKeyCode(' '));

            const stopped = await domove(game).then(() => false, (error) => {
                assert.match(String(error?.message ?? ''),
                    /Input queue empty/u, `${label} after ${dismissals}`);
                return true;
            });
            seen.push(game._ttyToplines ?? '');
            if (!stopped) {
                assert.deepEqual([game.u.ux, game.u.uy], [x, y], label);
                break;
            }
        }
        // topl.c separates two messages sharing a topline with two spaces and
        // keeps a trailing one beside the --More--, neither of which says
        // anything about the messages, so collapse both before comparing.
        assert.equal(
            seen.join(' ').replace(/\s+/gu, ' ').trim(),
            expected,
            label,
        );
    }
});

// pickup.c check_here() calls describe_decor() under flags.mention_decor.
// pickup.c:392-410 mentions a furniture square even when the terrain has not
// changed, because its `ltyp == iflags.prev_decor` test carries
// `&& !IS_FURNITURE(ltyp)`. The silent ROOM and CORR branches are owned after
// the startup staircase memory; furniture remains refused.
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
        // The selected movement boundary begins after startup has described
        // and remembered the traversed D:1 staircase.
        game.iflags.prev_decor = STAIRS;

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

test('decor preflight translations preserve the raw movement reason',
    async () => {
        const expectedReason = 'ordinary decor after unowned prior terrain';
        const ordinary = await prepareHeroMoveAdmission();
        game.flags.mention_decor = true;
        // FOUNTAIN is neither the startup staircase nor the ROOM destination,
        // so ordinaryDecorPlan reaches its unsupported prior-terrain branch.
        game.iflags.prev_decor = FOUNTAIN;
        const ordinaryBefore = heroMoveAdmissionSnapshot(ordinary.replay);
        await assert.rejects(
            domove(game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === expectedReason
                && error.message
                    === `unsupported hero move: ${expectedReason}`,
        );
        assert.deepEqual(
            heroMoveAdmissionSnapshot(ordinary.replay),
            ordinaryBefore,
        );

        const replay = await runSegment({
            seed: 840024,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:PetDecorReason,role:Valkyrie,'
                + 'race:human,gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,mention_decor',
            moves: ' ',
        });
        const pet = game.level.monlist;
        assert.ok(pet?.mtame, 'the starting pet is on the level');
        const x = game.u.ux + 1;
        const y = game.u.uy;
        game.level.at(x, y).typ = ROOM;
        game.level.monsters[pet.mx][pet.my] = null;
        pet.mx = x;
        pet.my = y;
        game.level.monsters[x][y] = pet;
        game.level.objects[x][y] = null;
        game.level.traps = [];
        game.level.regions = [];
        game.head_engr = null;
        game.iflags.prev_decor = FOUNTAIN;
        game.u.dx = 1;
        game.u.dy = 0;
        game.context.move = 1;
        game.domoveAttempting = 1;
        const petBefore = heroMoveAdmissionSnapshot(replay);
        const petPosition = [pet.mx, pet.my];

        await assert.rejects(
            domove(game),
            (error) => error instanceof UnsupportedHeroMoveBoundaryError
                && error.reason === expectedReason
                && error.message
                    === `unsupported hero move: ${expectedReason}`,
        );
        assert.deepEqual(heroMoveAdmissionSnapshot(replay), petBefore);
        assert.deepEqual([pet.mx, pet.my], petPosition);
        assert.equal(game.iflags.prev_decor, FOUNTAIN);
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

// C ref: cmd.c bind_key() (2688-2694), whose loop skips an INTERNALCMD row
// and then finds no other row spelled the same way, so it returns FALSE
// without calling cmdbind_add(). No recorded case can show this: all six rows
// carry a NUL key, so only a `bind` statement reaches one, and C answers that
// statement with the config error this port has no non-fatal form of.
test('a binding to an internal command leaves the key where it was', () => {
    const internal = extcmdlist.filter(
        (entry) => (entry.flags & INTERNALCMD) !== 0,
    );
    // cmd.c:2060-2065. Naming them here is what makes the loop below a test
    // rather than a restatement of the production filter.
    assert.deepEqual(internal.map((entry) => entry.ef_txt), [
        'clicklook', 'mouseaction', 'altadjust', 'altdip', 'alttakeoff',
        'altunwield',
    ]);
    for (const entry of internal) {
        assert.equal(entry.key, 0, entry.ef_txt);
        // 'Z' is #cast's compiled-in key, so a statement C refuses leaves
        // #cast holding it.
        const model = createCommandBindingModel(
            parseNethackrc(`BINDINGS=Z:${entry.ef_txt}\n`),
        );
        assert.equal(
            commandForKey(model, commandKeyCode('Z')), 'cast', entry.ef_txt,
        );
    }
    // The control: an ordinary row with the same statement shape does bind,
    // so the flag and not the statement is what the skip reads. #dip is
    // altdip's own handler under a name bind_key() accepts.
    const bound = createCommandBindingModel(
        parseNethackrc('BINDINGS=Z:dip\n'),
    );
    assert.equal(commandForKey(bound, commandKeyCode('Z')), 'dip');
});

// C ref: cmd.c's rest_on_space updater (3487-3503). Its `unrestonspace` is a
// static that remembers whatever command Space held before rest_on_space took
// it, so that turning the option off hands Space back rather than unbinding
// it -- "have some non-Null command bound in player's RC file", as the
// comment there puts it. The port spells that memory as model.unrestOnSpace,
// and the restBinding flag is how updateRestOnSpace() tells the #wait entry it
// installed itself apart from the player's own binding. Only that one call
// sets the flag; cmdbind_add() has no counterpart, so every other binding,
// including a `bind` statement's, leaves it clear.
test('rest_on_space hands Space back to the command the rc file bound', () => {
    // options.c txt2key() spells the space key "<space>". Binding it first,
    // then toggling the option on and off, is the sequence that needs the
    // memory: the entry Space holds when the option comes on is the player's.
    const model = createCommandBindingModel(parseNethackrc(
        'BINDINGS=<space>:kick\n'
        + 'OPTIONS=rest_on_space\n'
        + 'OPTIONS=!rest_on_space\n',
    ));
    assert.equal(commandForKey(model, commandKeyCode(' ')), 'kick');
    // With the option left on, #wait holds Space and the rc binding waits.
    const resting = createCommandBindingModel(parseNethackrc(
        'BINDINGS=<space>:kick\nOPTIONS=rest_on_space\n',
    ));
    assert.equal(commandForKey(resting, commandKeyCode(' ')), 'wait');
    // With no rc binding, C's unrestonspace stays Null and Space ends unbound,
    // which is the "Unknown command ' '." case that comment names.
    const bare = createCommandBindingModel(parseNethackrc(
        'OPTIONS=rest_on_space\nOPTIONS=!rest_on_space\n',
    ));
    assert.equal(commandForKey(bare, commandKeyCode(' ')), null);
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

test('a committed count is retained as a parsed command after dispatch refusal',
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
    // The inventory row is one of the 168 extcmdlist[] rows carrying no
    // occupation text, so rhack():3728 installs nothing and the count is still
    // refused; the two rows that do carry one run it instead.
    game.nhDisplay.pushKey(commandKeyCode('i'));
    // get_count() consumes the '3' and returns the 'i', so the refusal names
    // the command byte the count modified rather than the digit that opened
    // it. It is the plain boundary and never the branch subclass
    // failClosedCommand() raises from below a dispatched command;
    // scripts/scan-sessions.mjs isCommandRefusal() separates the two.
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && !(error instanceof UnsupportedHeroCommandBranchBoundaryError)
            && error.key === commandKeyCode('i'),
    );
    const rejected = heroCommandRetrySnapshot(replay);
    // cmd.c parse():5142-5144 sets gm.multi to the count and then decrements
    // it, so a count of 3 leaves two repeats owed.
    assert.deepEqual(game.context.pendingCommand, {
        key: commandKeyCode('i'),
        commandCount: 3,
        lastCommandCount: 3,
        multi: 2,
    });
    // Both keys entered parse(); nothing is left for a second read.
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.equal(game._commandDispatchCount, initialDispatches + 1);

    // The retry re-decides the retained command instead of dispatching it,
    // and reads no further input to do so.
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('i'),
    );
    assert.deepEqual(heroCommandRetrySnapshot(replay), rejected);
    assert.equal(game._commandDispatchCount, initialDispatches + 1);
});

test('a number-pad count reaches the same committed-count refusal', async () => {
    const replay = await runSegment({
        seed: 840003,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:NumpadCount,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,number_pad,pettype:none',
        moves: '',
    });
    game.level.monlist = null;
    // With number_pad on, cmd.c parse():5110 reads the byte itself and only
    // the count key hands control to get_count(), which then collects the 3.
    game.nhDisplay.pushKey(commandKeyCode('n'));
    game.nhDisplay.pushKey(commandKeyCode('3'));
    game.nhDisplay.pushKey(commandKeyCode('i'));

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('i'),
    );
    const rejected = heroCommandRetrySnapshot(replay);
    assert.deepEqual(game.context.pendingCommand, {
        key: commandKeyCode('i'),
        commandCount: 3,
        lastCommandCount: 3,
        multi: 2,
    });
    assert.deepEqual(game.nhDisplay.terminal._inputQueue, []);

    game.nhDisplay.cursorCol++;
    assert.notDeepEqual(heroCommandRetrySnapshot(replay), rejected);
    game.nhDisplay.cursorCol--;

    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('i'),
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
        // The inventory row carries no occupation text, so its count is the
        // one rhack() still refuses; the waiting row it replaced now installs
        // an occupation instead.
        moves: '2i',
    });

    // resetCommandVars() runs on the refusal, so the live multi is 0 while the
    // retained command still owes its repeat.
    assert.equal(game.multi ?? 0, 0);
    assert.equal(game.moves, 1);
    assert.equal(game.hero_seq, 8);
    assert.equal(game.u.uhunger, 900);
    assert.deepEqual(game.context.pendingCommand, {
        key: commandKeyCode('i'),
        commandCount: 2,
        lastCommandCount: 2,
        multi: 1,
    });
    // One screen per key read: the '2' is echoed nowhere, because
    // get_count():5069 withholds the echo until the count exceeds 9, and the
    // 'i' is refused after its own prompt capture.
    assert.equal(replay.getScreens().length, 2);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.equal(game._commandDispatchCount, 1);
});

test('a count ahead of an unadmitted command byte is refused after parse()',
    async () => {
    // cmd.c parse() (5096-5151) runs to completion before rhack() looks at the
    // byte it returned, so a command this port will not dispatch is refused at
    // the command byte and never at a count digit: get_count() has already
    // consumed and echoed the digits, parse():5142-5144 has already committed
    // gm.multi, and parse():5147's clear_nhwindow(WIN_MESSAGE) has already
    // cleared the row. 'X' is the twoweapon row (cmd.c:1913), which
    // ADMITTED_COMMANDS omits, so it is refused whether or not a count precedes
    // it -- and the counted form has to cost the two extra key reads, not stop
    // at the first digit.
    for (const [typed, screens, count] of [
        [' X', 2, 0],
        [' 12X', 4, 12],
    ]) {
        const replay = await runSegment({
            seed: 840021,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:CountUnadmitted,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none',
            // The leading space dismisses startup output, so every later byte
            // is part of the command under test.
            moves: typed,
        });
        assert.deepEqual(
            game.context.pendingCommand,
            {
                key: commandKeyCode('X'),
                commandCount: count,
                lastCommandCount: count,
                // parse():5142-5144 assigns the count and then decrements it.
                multi: count ? count - 1 : 0,
            },
            `'${typed}' retains the parsed command`,
        );
        // One screen per key read. A refusal taken on the byte that opened the
        // command would stop at the '1' and leave two of these unspent.
        assert.equal(
            replay.getScreens().length,
            screens,
            `'${typed}' read every byte`,
        );
    }
});

test('a count of 0 or 1 leaves the command identical to a bare one',
    async () => {
    // cmd.c parse():5142-5144 is `gm.multi = gc.command_count; if (gm.multi)
    // gm.multi--;`, so counts of 0 and 1 both leave gm.multi at 0 and rhack()
    // installs no occupation at 3728-3729. Each has to reach dosearch() by the
    // path a bare `s` takes, drawing the same randomness in the same order.
    const runs = [];
    for (const typed of ['s', '0s', '1s']) {
        const replay = await runSegment({
            seed: 840031,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:CountZeroOne,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none',
            // The space dismisses startup output, so `typed` is the first
            // gameplay command in every run.
            moves: ` ${typed}`,
        });
        runs.push({
            typed,
            // gl.last_command_count outlives the command, where
            // gc.command_count is zeroed by parse():5102 on the next entry.
            lastCommandCount: game.lastCommandCount,
            rng: replay.getRngLog(),
            // The last capture is the prompt the search returned to, so it
            // carries everything the command drew.
            screen: replay.getScreens().at(-1),
            cursor: replay.getCursors().at(-1),
            moves: game.moves,
            multi: game.multi,
        });
    }
    const [bare, zero, one] = runs;
    // A turn elapsed, so the searches really ran rather than being refused.
    assert.equal(bare.moves, 2);
    assert.ok(bare.rng.length > 0);
    for (const run of [zero, one]) {
        assert.deepEqual(run.rng, bare.rng, `${run.typed} randomness`);
        assert.deepEqual(run.screen, bare.screen, `${run.typed} screen`);
        assert.deepEqual(run.cursor, bare.cursor, `${run.typed} cursor`);
        assert.equal(run.moves, bare.moves, `${run.typed} turn`);
        assert.equal(run.multi, 0, `${run.typed} multi`);
    }
    // The three counts still differ where C keeps them, so the runs above
    // agree because gm.multi came out 0, not because the digits went unread.
    assert.deepEqual(runs.map((run) => run.lastCommandCount), [0, 0, 1]);
});

test('a count before a byte bound to no command reaches the bad-command path',
    async () => {
    // cmd.c rhack():3828-3839 prints the unknown-command line and then zeroes
    // gm.multi itself, so a count typed ahead of an unbound byte needs neither
    // an occupation nor a repeat and must not be refused.
    await runSegment({
        seed: 840021,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:CountUnbound,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: ' ',
    });
    const startingMoves = game.moves;
    // '%' has no binding in the default set; 12 is the smallest count that
    // also drives get_count()'s echo, so this covers a count that painted.
    for (const ch of '12%') game.nhDisplay.pushKey(commandKeyCode(ch));

    await moveloop_core();
    await flush_screen(1);

    assert.equal(topLine(game), "Unknown command '%'.");
    assert.equal(game.multi, 0);
    assert.equal(game.context.move, 0);
    assert.equal(game.moves, startingMoves);
    assert.equal(game.commandCount, 12);
});

test('the 0377 empty-key value stays refused after parsing', async () => {
    // cmd.c rhack():3661-3672 rings the bell for key 0377 and returns;
    // nhbell() is not ported, so it stays on the refusing side even though
    // cmdbind_get() finds no command for it, which is the one place this port
    // parts company with an ordinary unbound byte. rhack()'s other empty-key
    // value, 0, cannot be reached: win/tty/wintty.c tty_nhgetch():4093-4098
    // substitutes ESC for NUL below readchar(), as js/input.js nhgetch() does.
    const key = 0xFF;
    await runSegment({
        seed: 840021,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:EmptyKey,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,'
            + '!splash_screen,pettype:none',
        moves: ' ',
    });
    // Sharing the unbound byte's classification is what makes the separate
    // empty-key test load-bearing rather than decorative.
    assert.equal(commandForKey(createCommandBindingModel(game), key), null);
    game.nhDisplay.pushKey(key);
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === key,
    );
});

test('a count of 2 or more refuses on a row this port would dispatch',
    async () => {
    // extcmdlist[] carries occupation text on exactly two of its rows,
    // searching at cmd.c:1846-1847 and waiting at :1930-1931. rhack():3728-3729
    // spends a count on those, which is ported; every other row leaves gm.multi
    // for allmain.c moveloop_core():515-531 to repeat the command with, which
    // is not. Both keys below therefore stop here although ADMITTED_COMMANDS
    // names them and C answers each with a single command: doinv() and dodown()
    // return ECMD_OK and rhack():3814 then zeroes gm.multi itself. QUALITY.json
    // carries both as a deferred entry.
    for (const typed of ['12i', '3>']) {
        await runSegment({
            seed: 840021,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:CountOutside,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none',
            moves: ' ',
        });
        const refusedFrom = game.moves;
        for (const ch of typed) game.nhDisplay.pushKey(commandKeyCode(ch));
        await assert.rejects(
            moveloop_core(),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && error.key === commandKeyCode(typed.at(-1))
                && /gm\.multi above 0/.test(error.message),
            `'${typed}' stops at the committed count`,
        );
        assert.equal(game.moves, refusedFrom, `'${typed}' elapsed no turn`);
        assert.equal(game.multi, 0, `'${typed}' left no live count`);
    }
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

test('rhack runs a queued command even when it was given a key', async () => {
    // cmd.c:3642 pops the queue before anything else on every rhack() call;
    // `firsttime` gates only the parse below it. allmain.c:530 is the one
    // caller that passes a nonzero key -- the counted-repeat re-entry -- so a
    // command queued while gm.multi is still positive runs there instead of
    // the repeated key.
    const state = resetParserTestGame('');
    cmdq_add_ec(CQ_CANNED, extcmdRow('wait'), state);
    // 3 is ^C, unbound in cmd.c's command table, so were the key consulted
    // the bad-command path would answer it: a pline and no turn spent.
    await rhack(3, state);
    assert.equal(state.context.move, 1, 'the queued wait spent the turn');
    assert.equal(state._pending_message ?? '', '');
    assert.equal(cmdq_peek(CQ_CANNED, state), null, 'the queue was drained');
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

test('a rebound reqmenu prefix forces its following wait command', async () => {
    const { state } = resetSafeWaitTestGame(
        'OPTIONS=!cmdassist\nBINDINGS=x:reqmenu',
    );
    state.nhDisplay.pushKey(commandKeyCode('x'));
    state.nhDisplay.pushKey(commandKeyCode('.'));

    await rhack(0, state);

    assert.equal(state.context.move, 1);
    assert.equal(state.iflags.menu_requested, true);
    assert.equal(state.did_nothing_flag ?? 0, 0);
    assert.equal(state.nhDisplay.inputQueueLength, 0);
});

// cmd.c binds 'm' to do_reqmenu with PREFIXCMD (1829-1830), so rhack() jumps
// back to got_prefix_input (3762-3773) and parse() reads a second key. Each
// tty_nhgetch() is where recorder patch 006 captures a screen and a cursor, so
// the prefix costs exactly one frame. The port used to refuse 'm' before the
// reqmenu arm could run, which ended the segment one frame early and lost every
// frame after it.
test('the reqmenu prefix costs the one frame its second key read does in C',
    async () => {
        // Counts read off fresh recordings of the patched C program at seed
        // 5150601, datetime 20260807140000, with the rc below: 2 frames for a
        // bare 's', 3 for 'ms', and 3 for the doubled prefix 'mm', which
        // cancels. Every one is one frame per key plus the launch frame.
        for (const [moves, frames] of [['s', 2], ['ms', 3], ['mm', 3]]) {
            const replay = await runSegment({
                seed: 5150601,
                datetime: '20260807140000',
                nethackrc: 'OPTIONS=name:Prefixer,role:Valkyrie,race:human,'
                    + 'gender:female,align:neutral,!legacy,!tutorial,'
                    + '!splash_screen',
                moves,
            });
            assert.equal(replay.getScreens().length, frames, `${moves} screens`);
            assert.equal(replay.getCursors().length, frames, `${moves} cursors`);
        }
    });

test('reqmenu rejects non-prefix commands and Escape cancels silently',
    async () => {
        for (const [key, description] of [
            [':', 'look'],
            ['i', 'inventory'],
        ]) {
            const { state } = resetSafeWaitTestGame('OPTIONS=!cmdassist');
            const grid = structuredClone(state.nhDisplay.grid);
            state.nhDisplay.pushKey(commandKeyCode('m'));
            state.nhDisplay.pushKey(commandKeyCode(key));

            await rhack(0, state);

            assert.equal(
                state._pending_message,
                `The ${description} command does not accept 'm' prefix.`,
            );
            assert.deepEqual(state.nhDisplay.grid, grid);
            assert.equal(state.context.move, 0);
            assert.equal(state.iflags.menu_requested, false);
            assert.equal(state.nhDisplay.inputQueueLength, 0);
        }

        for (const cancel of [0, 0xFF, 0x1B]) {
            const { state } = resetSafeWaitTestGame('OPTIONS=!cmdassist');
            const grid = structuredClone(state.nhDisplay.grid);
            state.nhDisplay.pushKey(commandKeyCode('m'));
            state.nhDisplay.pushKey(cancel);

            await rhack(0, state);

            assert.equal(state._pending_message, '');
            assert.deepEqual(state.nhDisplay.grid, grid);
            assert.equal(state.context.move, 0);
            assert.equal(state.iflags.menu_requested, false);
            assert.equal(state.nhDisplay.inputQueueLength, 0);
        }
    });

test('a doubled reqmenu prefix cancels without leaking into the next command',
    async () => {
        for (const [configuration, prefix] of [
            ['OPTIONS=!cmdassist', 'm'],
            ['OPTIONS=!cmdassist\nBINDINGS=x:reqmenu', 'x'],
        ]) {
            const { state, monster } = resetSafeWaitTestGame(configuration);
            const grid = structuredClone(state.nhDisplay.grid);
            state.nhDisplay.pushKey(commandKeyCode(prefix));
            state.nhDisplay.pushKey(commandKeyCode(prefix));

            await rhack(0, state);

            assert.equal(state._pending_message,
                `Double ${prefix} prefix, canceled.`);
            assert.deepEqual(state.nhDisplay.grid, grid);
            assert.equal(state.context.move, 0);
            assert.equal(state.iflags.menu_requested, false);
            assert.equal(state.context.pendingCommand, undefined);
            assert.equal(state.nhDisplay.inputQueueLength, 0);

            state.level.monsters[monster.mx][monster.my] = null;
            state.level.monlist = null;
            state.nhDisplay.pushKey(commandKeyCode('.'));
            await rhack(0, state);
            assert.equal(state.context.move, 1);
            assert.equal(state.iflags.menu_requested, false);
        }
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

test('travel and prefix bytes remain atomic boundaries',
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
                key,
                commandCount: 0,
                lastCommandCount: 0,
                multi: 0,
            },
        });
        expected.domoveAttempting = 0;
        expected.iflags.in_parse = false;
        expected.iflags.menu_requested = false;
        expected.input.queue = [];
        expected.multi = 0;
        // parse() ran to completion before the refusal, so it left its own
        // cmd_key and its zeroed counts behind, overwriting the sentinels
        // planted above.
        expected.parser.cmdKey = key;
        expected.parser.commandCount = 0;
        expected.parser.lastCommandCount = 0;
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
            key,
            commandCount: 0,
            lastCommandCount: 0,
            multi: 0,
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
    // A committed count refuses instead, and names the command byte it
    // modified: get_count() has already eaten the '7' by then. The inventory
    // row is one of the rows carrying no occupation text, which are the ones
    // rhack() still refuses a count for.
    const refused = [
        { typed: '7i', key: commandKeyCode('i') },
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
    // The count key never reaches the bad-command path: parse() hands it to
    // get_count(), which collects the '3' and returns the 'i' as the command.
    // A byte treated as unbound would have printed "Unknown command 'n'."
    // instead, exactly as '%' did above.
    game.nhDisplay.pushKey(commandKeyCode('n'));
    game.nhDisplay.pushKey(commandKeyCode('3'));
    game.nhDisplay.pushKey(commandKeyCode('i'));
    await assert.rejects(
        moveloop_core(),
        (error) => error instanceof UnsupportedHeroCommandBoundaryError
            && error.key === commandKeyCode('i'),
        'the number-pad count key stays a count prefix',
    );

    // A refused command is retained for retry, so each refusal needs its own
    // segment rather than another key pushed at the same prompt.
    for (const { typed, key } of refused) {
        await runSegment({
            seed: 840021,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:UnboundCommand,role:Healer,'
                + 'race:human,gender:female,align:neutral,!legacy,'
                + '!tutorial,!splash_screen,pettype:none',
            moves: ' ',
        });
        const refusedFrom = game.moves;
        for (const ch of typed) game.nhDisplay.pushKey(commandKeyCode(ch));
        await assert.rejects(
            moveloop_core(),
            (error) => error instanceof UnsupportedHeroCommandBoundaryError
                && error.key === key,
            `'${typed}' stays outside the bad-command path`,
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
        // permonst.h:48 gives every species NATTK slots and mhitu.c
        // mattacku() indexes all six, so the empty ones are spelled out.
        data: {
            mmove: 12,
            mattk: [
                // AD_FIRE, not AD_PHYS: this test needs the monster's turn to
                // stop somewhere, and uhitm.c mhitm_adtyping() now carries
                // AD_PHYS through to the hero's hit points. AD_FIRE is the
                // nearest damage type it still refuses, and a clawing fire
                // attack is an ordinary pairing (mhitm_ad_fire()'s own
                // callers include AT_CLAW species).
                { aatyp: AT_CLAW, adtyp: AD_FIRE, damn: 1, damd: 2 },
                ...Array.from({ length: 5 }, () => ({
                    aatyp: AT_NONE, adtyp: 0, damn: 0, damd: 0,
                })),
            ],
        },
        movement: 12, mhp: 1, nmon: null,
        // C's mcanmove is a bitfield every real monster carries. Without it
        // assertSimpleActionState() returns early and never checks anything,
        // so this fixture would not be the actionable monster it claims.
        mcanmove: true,
        mx: game.u.ux + 1,
        my: game.u.uy,
        // mhitu.c:710. The monster's level is added straight into the
        // armor-class differential, and thirty beats every rnd(20), so this
        // fixture always reaches hitmu() rather than sometimes missing.
        m_lev: 30,
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
        /uhitm\.c mhitm_ad_fire\(\)/u,
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

// The refusal both movement backstops convert. pickup.c pickup() reaches
// engrave.c can_reach_floor() only when the hero's new square holds an object,
// and that answers FALSE while the hero levitates, where js/pickup.js raises
// UnsupportedPickupError. That class is one of the four the movement path can
// reach that js/jsmain.js does not break the segment on, so before the
// wrappers it escaped runSegment() and cost the segment its matching prefix.
//
// The js/hack.js seam guards refuse ahead of domove(), but none of them reads
// Levitation -- hack.c test_move() does not either, and js/hack.js
// spoteffects() records that nothing in this port grants the property yet --
// so the two tests below set it directly. That is what makes them backstop
// tests rather than repeats of the seam's own admission cases.
function installUnreachableFloorObject(x, y) {
    // !autopickup keeps the seam's 'automatic pickup' guard silent, so the
    // object survives as far as pickup()'s can_reach_floor() test.
    game.flags.pickup = false;
    place_object(
        // One ordinary dart: xname() formats it, so the seam's nameability
        // preflight admits the square.
        newObject({ o_id: 7101, otyp: DART, oclass: WEAPON_CLASS, quan: 1 }),
        x,
        y,
        { state: game },
    );
    // An extrinsic source is the shape worn levitation takes. An intrinsic one
    // carries a turn count, which the elapsed turn's nh_timeout refuses before
    // the movement under test can run.
    game.u.uprops[LEVITATION].extrinsic = 1;
}

test('a refusal below domove() reaches the player as a command boundary',
    async () => {
        const { x, y } = await prepareHeroMoveAdmission();
        installUnreachableFloorObject(x, y);
        game.context.move = 0;
        game.context.run = 0;
        game.context.nopick = 0;
        game.domoveAttempting = 0;
        const moveKey = commandKeyCode('l');
        game.nhDisplay.pushKey(moveKey);

        await assert.rejects(
            () => rhack(0, game),
            (error) => {
                assert.ok(
                    error instanceof UnsupportedHeroCommandBoundaryError,
                    `${error.constructor.name} is not a command boundary`,
                );
                // And the subclass that says the refusal came from below a
                // dispatched command rather than from the admission seam.
                // scripts/scan-sessions.mjs isCommandRefusal() reads this to
                // decide whether the recorded byte can name the behavior the
                // port stopped on; here it cannot, because `l` is admitted.
                assert.ok(
                    error instanceof UnsupportedHeroCommandBranchBoundaryError,
                    `${error.constructor.name} is not a branch boundary`,
                );
                assert.equal(error.key, moveKey);
                assert.equal(
                    error.message,
                    'unsupported hero command: an unported branch of this '
                    + 'command: unsupported pickup: pickup() by a hero who '
                    + 'cannot reach the floor',
                );
                return true;
            },
        );
        // The wrapper refuses after the step rather than before it: domove()
        // moved the hero and only then reached pickup(). That is why the
        // js/hack.js seam guards stay where they are -- they refuse while
        // nothing has moved, drawn or painted yet.
        assert.deepEqual([game.u.ux, game.u.uy], [x, y]);
        // failClosedCommand() runs resetCommandVars() before it throws, and
        // that reset deliberately preserves context.pendingCommand. Nothing
        // serializes pendingCommand, so the retained key outlives the refusal
        // only inside this segment, which js/jsmain.js then ends.
        assert.equal(game.context.move, 0);
        assert.equal(game.multi, 0);
        assert.equal(game.context.pendingCommand.key, moveKey);
    });

// Prepares the run the two tests below drive: two ordinary squares east of the
// hero, with the hero's own square made ordinary too because hack.c
// lookaround() reads levl[u.ux][u.uy].typ and a new game starts on the
// upstairs. Answers the second square, which the run reaches on the turn
// allmain.c:526 runs with rhack() off the stack.
async function prepareRunPastTheFirstStep() {
    const { x, y } = await prepareHeroMoveAdmission();
    const beyond = game.level.at(x + 1, y);
    beyond.typ = ROOM;
    beyond.flags = beyond.doormask = 0;
    game.level.monsters[x + 1][y] = null;
    game.level.objects[x + 1][y] = null;
    game.level.at(game.u.ux, game.u.uy).typ = ROOM;
    game.context.move = 0;
    game.context.run = 0;
    game.context.nopick = 0;
    game.domoveAttempting = 0;
    return { second: [x + 1, y], first: [x, y] };
}

// Takes the run's first step through rhack() and leaves moveloop_core() the
// second. Shift-l is an uncounted run, the only movement the repeated-command
// seam admits: executeMovement() sets multi to the COLNO sentinel, which is
// what sends the next turn into the domove() re-entry rather than rhack().
async function takeFirstRunStep(first) {
    game.nhDisplay.pushKey(commandKeyCode('L'));
    await rhack(0, game);
    assert.deepEqual([game.u.ux, game.u.uy], first);
    assert.equal(game.multi, COLNO);
    assert.equal(game.context.mv, 1);
    // rhack() ran its finally on the way out and dropped the retained
    // keystroke. That is the premise of the turn boundary the next turn
    // raises: no key survives here for a command boundary to hand back.
    assert.equal(game.context.pendingCommand, undefined);
    // Skip the elapsed-turn block, so the next turn is the run step alone.
    game.context.move = 0;
}

test('a refusal below the run loop reaches the player as a turn boundary',
    async () => {
        const { first, second } = await prepareRunPastTheFirstStep();
        installUnreachableFloorObject(second[0], second[1]);
        await takeFirstRunStep(first);

        await assert.rejects(
            () => moveloop_core(),
            (error) => {
                assert.ok(
                    error instanceof UnsupportedTurnBoundaryError,
                    `${error.constructor.name} is not a turn boundary`,
                );
                assert.equal(
                    error.message,
                    'a continued move reached unsupported pickup: pickup() by '
                    + 'a hero who cannot reach the floor',
                );
                // The turn boundary carries no key. rhack() is off the stack
                // here, its finally has already deleted context.pendingCommand
                // and no retry could honour one, so this site must not raise
                // the command boundary the js/cmd.js half raises.
                assert.equal(error.key, undefined);
                return true;
            },
        );
        assert.deepEqual([game.u.ux, game.u.uy], second);
    });

test('the run loop leaves a class outside the refusal list as it found it',
    async () => {
        // The wrapper converts only what failClosedCommandRefusals() names.
        // UnsupportedHeroMoveBoundaryError is not on that list -- js/jsmain.js
        // breaks the segment on it directly -- so the seam's own refusal has
        // to arrive with its own type, reason and message.
        const { first, second } = await prepareRunPastTheFirstStep();
        // ICE is outside the terrain requireSimpleHeroDestination() admits,
        // and domove() calls that seam on every step, including this one.
        game.level.at(second[0], second[1]).typ = ICE;
        await takeFirstRunStep(first);

        await assert.rejects(
            () => moveloop_core(),
            (error) => {
                assert.ok(
                    error instanceof UnsupportedHeroMoveBoundaryError,
                    `${error.constructor.name} is not a hero move boundary`,
                );
                assert.equal(error.reason,
                    'door or special terrain movement');
                return true;
            },
        );
        // The refused step left the hero where the first one put him.
        assert.deepEqual([game.u.ux, game.u.uy], first);
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
    // The whole parsed command is retained, not the keystroke: parse() has
    // consumed any count and no retry resumes inside get_count().
    assert.deepEqual(game.context.pendingCommand, {
        key: searchKey,
        commandCount: 0,
        lastCommandCount: 0,
        multi: 0,
    });
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
    assert.deepEqual(game.context.pendingCommand, {
        key: searchKey,
        commandCount: 0,
        lastCommandCount: 0,
        multi: 0,
    });

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

// C ref: cmd.c count_bind_keys(), which options.c optfn_o_bind_keys() shows
// as the "bind keys" line's "(N currently set)".
test('count_bind_keys counts moved commands and orphaned default keys',
    async () => {
        const { count_bind_keys } = await import('../js/cmd.js');
        const { parseNethackrc } = await import('../js/options.js');
        const stateFor = (rc) => {
            const parsed = parseNethackrc(rc);
            return {
                flags: parsed.flags,
                iflags: parsed.iflags,
                commandOperations: parsed.commandOperations,
            };
        };
        // A stock game binds every extcmdlist[] row that carries a key to
        // that key and moves nothing, so both of the source's loops add zero.
        assert.equal(count_bind_keys(stateFor('')), 0);
        // Binding 'Z' to #apply is the first loop's term: cmdbinds gains a
        // userbind entry whose command's own key is 'a'. 'a' keeps its
        // default binding, so the second loop still adds nothing.
        assert.equal(count_bind_keys(stateFor('BINDINGS=Z:apply\n')), 1);
        // "nothing" is cmd.c bind_key()'s unbind, so it removes the entry
        // rather than adding one. That leaves #apply's own key 'a' held by no
        // entry, which the second loop counts on top of the moved command.
        assert.equal(
            count_bind_keys(stateFor('BINDINGS=Z:apply,a:nothing\n')), 2,
        );
        // bind_key() matches its command against extcmdlist[] and adds no
        // entry when nothing matches, so an unknown name contributes to
        // neither loop. This port's binding model keeps the key, which is
        // why the first loop has to look the command up before it compares.
        assert.equal(
            count_bind_keys(stateFor('BINDINGS=Z:notacommand\n')), 0,
        );
        // cmdbind_add() overwrites the entry a key already holds instead of
        // adding a second one, so rebinding a key leaves cmdbinds with one
        // entry to count. Both spellings reach that: parsebindings() recurses
        // into the comma suffix before applying the element ahead of it, so
        // one statement applies right to left and #apply is what survives
        // either way. #apply's 'a' and #eat's 'e' keep their own entries, so
        // the second loop adds nothing.
        assert.equal(count_bind_keys(stateFor('BINDINGS=Z:apply,Z:eat\n')), 1);
        assert.equal(
            count_bind_keys(stateFor('BINDINGS=Z:eat\nBINDINGS=Z:apply\n')), 1,
        );
        // Unbinding a key that an earlier statement rebound removes the one
        // entry both statements shared, so the first loop counts nothing and
        // only #attributes' orphaned '^X' reaches the second.
        assert.equal(
            count_bind_keys(
                stateFor('BINDINGS=^X:jump\nBINDINGS=^X:nothing\n'),
            ),
            1,
        );
        // bind_key() splits a parameter off at '(' before matching, so
        // "toggle(showexp)" reaches the CMD_PARAM row #toggle, whose own key
        // is NUL and therefore differs from '^X'. #toggle carries no key of
        // its own for the second loop to miss, and '^X' still holds an entry.
        assert.equal(
            count_bind_keys(stateFor('BINDINGS=^X:toggle(showexp)\n')), 1,
        );
    });
