import assert from 'node:assert/strict';
import test from 'node:test';

import {
    commandForKey,
    commandKeyCode,
    createCommandBindingModel,
} from '../js/command_bindings.js';
import { moveloop_core } from '../js/allmain.js';
import {
    MAX_COMMAND_COUNT,
    parseCommand,
    resetCommandVars,
    rhack,
} from '../js/cmd.js';
import {
    COLNO,
    FAST,
    INTRINSIC,
    ROOM,
    STONE,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import {
    enableRngLog,
    getRngLog,
    initRng,
} from '../js/rng.js';
import { CLR_GRAY } from '../js/terminal.js';
import { ttyPline } from '../js/tty_message.js';

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

test('a counted wait repeats without reading another command key', async () => {
    const replay = await runSegment({
        // This independent seed has no fixture role; it exercises three waits
        // while the residual turn scaffold is still responsible for turn RNG.
        seed: 840003,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:CountTest,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '3.',
    });

    assert.equal(game.moves, 4);
    assert.equal(game.multi, 0);
    assert.equal(game.lastCommandCount, 3);
    assert.equal(game._commandDispatchCount, 3);
    // Input is read for the digit, the command, then the next live prompt;
    // the two repeated waits introduce no input boundary of their own.
    assert.equal(replay.getScreens().length, 3);
});

test('the segment runner completes counts around and at the portable limit', async () => {
    // 1023 and 1024 exercise values immediately below and at the former
    // effective 1024-iteration limit for these short recipes. 1100 exceeds
    // that limit, and MAX_COMMAND_COUNT exercises the source ceiling.
    for (const count of [1023, 1024, 1100, MAX_COMMAND_COUNT]) {
        const replay = await runSegment({
            seed: 840003,
            datetime: COMMAND_DATETIME,
            nethackrc: 'OPTIONS=name:CountLimit,role:Healer,race:human,'
                + 'gender:female,align:neutral,!legacy,!tutorial,'
                // Keep rare ambient More prompts from consuming the finite
                // input recipe in this command-count boundary test.
                + '!splash_screen,!acoustics',
            moves: `${count}.`,
        });

        // Source turn progression is intentionally bounded by the ten-row
        // residual replay; this test owns command-count completion, not the
        // later gameplay turn counter.
        assert.equal(game.multi, 0, `count ${count}`);
        assert.equal(game._commandDispatchCount, count, `count ${count}`);
        assert.ok(replay.getScreens().length > 0, `count ${count}`);
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

test('counted movement repeats intent without extra dispatch or input', async () => {
    const replay = await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MoveCount,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen\n'
            + 'BINDINGS=x:movewest',
        moves: '',
    });
    const start = [game.u.ux, game.u.uy];
    const initialScreens = replay.getScreens().length;
    for (let distance = 1; distance <= 3; ++distance) {
        const square = game.level.at(start[0] - distance, start[1]);
        square.typ = ROOM;
        square.flags = square.doormask = 0;
    }
    game.nhDisplay.pushKey(commandKeyCode('3'));
    game.nhDisplay.pushKey(commandKeyCode('x'));

    for (let turn = 0; turn < 3; ++turn) await moveloop_core();
    await assert.rejects(moveloop_core(), /Input queue empty/u);

    assert.deepEqual([game.u.ux, game.u.uy], [start[0] - 3, start[1]]);
    assert.equal(game.moves, 4);
    assert.equal(game.multi, 0);
    assert.equal(game.context.mv, 0);
    assert.equal(game.context.run, 0);
    assert.equal(game._commandDispatchCount, 1);
    assert.equal(replay.getScreens().length - initialScreens, 3);
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
    initRng(918273);
    enableRngLog();

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.deepEqual(getRngLog(), []);
    assert.equal(game.moves, 1);

    // Tilde has no default binding in the upstream command table.
    game.nhDisplay.pushKey(commandKeyCode('~'));
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
    assert.deepEqual(
        getRngLog().map((entry) => entry.replace(/=.*/u, '')),
        // This generated level has a fountain but no sink, so dosounds()
        // owns the 1-in-400 gate in place of the old fixed 1-in-300 draw.
        // Its Dexterity 9 makes engraving wear use 40 + 9 * 3 = 67.
        ['rn2(12)', 'rn2(12)', 'rn2(70)', 'rn2(400)', 'rn2(20)', 'rn2(67)'],
    );

    const elapsedLog = [...getRngLog()];
    const elapsedMovement = [head.movement, tail.movement];
    const west = game.level.at(game.u.ux - 1, game.u.uy);
    west.typ = STONE;
    game.nhDisplay.pushKey(commandKeyCode('h'));
    await moveloop_core();
    assert.equal(game.context.move, 0);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.moves, 2);
    assert.equal(game.hero_seq, 17);
    assert.deepEqual([head.movement, tail.movement], elapsedMovement);
    assert.deepEqual(getRngLog(), elapsedLog);

    // A later elapsed command must still select residual step 2; neither the
    // unbound command nor blocked movement advanced the source turn counter.
    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.equal(game.moves, 2);
    assert.deepEqual(getRngLog(), elapsedLog);
    game.nhDisplay.pushKey(commandKeyCode('~'));
    await moveloop_core();
    assert.equal(game.moves, 3);
    assert.equal(game.hero_seq, 25);
    assert.deepEqual(
        getRngLog().slice(elapsedLog.length, elapsedLog.length + 4)
            .map((entry) => entry.replace(/=.*/u, '')),
        // Residual step 2 uniquely begins with four rn2(5) calls.
        ['rn2(5)', 'rn2(5)', 'rn2(5)', 'rn2(5)'],
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

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    game.nhDisplay.pushKey(commandKeyCode('~'));
    await moveloop_core();

    const created = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        created.push(monster);
    assert.ok(created.length > 0);
    assert.equal(getRngLog()[0], 'rn2(70)=0');
    assert.ok(created.every((monster) => !monster.mgenmklev));
    assert.ok(created.every((monster) => monster.movement === 0));

    // The unbound command consumed no time. A following wait, then another
    // unbound command, reaches the next allocation round for the same nodes.
    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    game.nhDisplay.pushKey(commandKeyCode('~'));
    await moveloop_core();
    assert.ok(created.every((monster) => monster.movement > 0));
});

test('a fast hero spends surplus movement without allocating a new turn', async () => {
    await runSegment({
        seed: 840015,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:FastSurplus,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        // Dismiss startup, then let the test drive each command boundary.
        moves: ' ',
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

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.equal(game.moves, 2);
    assert.equal(game.u.umovement, 24);
    assert.equal(game.hero_seq, 17);
    assert.ok(getRngLog().includes('rn2(3)=0'));
    const allocatedLog = [...getRngLog()];

    game.nhDisplay.pushKey(commandKeyCode('.'));
    await moveloop_core();
    assert.equal(game.moves, 2);
    assert.equal(game.u.umovement, 12);
    assert.equal(game.hero_seq, 18);
    assert.deepEqual(getRngLog(), allocatedLog);
});

test('movement repeat counts preserve the COLNO sentinel threshold', async () => {
    await runSegment({
        seed: 840004,
        datetime: COMMAND_DATETIME,
        nethackrc: 'OPTIONS=name:MoveSentinel,role:Healer,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
    });
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

    for (const [mode, keyCode, expectedRun] of modes) {
        for (const [key, dx, dy] of directions) {
            resetCommandVars(game);
            game.u.ux = start[0];
            game.u.uy = start[1];
            const square = game.level.at(start[0] + dx, start[1] + dy);
            square.typ = ROOM;
            square.flags = square.doormask = 0;

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

test('a first-time altmeta number-pad run establishes run state', async () => {
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

    await rhack(0, game);

    assert.deepEqual([game.u.dx, game.u.dy, game.u.dz], [-1, 0, 0]);
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
    assert.equal(game.context.move, 1);
    assert.equal(game._commandDispatchCount, 1);
});
