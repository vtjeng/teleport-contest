import assert from 'node:assert/strict';
import test from 'node:test';

import {
    commandForKey,
    commandKeyCode,
    createCommandBindingModel,
} from '../js/command_bindings.js';
import { parseCommand, rhack } from '../js/cmd.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { ttyPline } from '../js/tty_message.js';

// This non-Friday-the-13th, non-moon-boundary afternoon keeps command tests
// free of calendar messages while still exercising fixed-datetime startup.
const COMMAND_DATETIME = '20310314150926';

function parserState(keys) {
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
    for (const key of keys) game.nhDisplay.pushKey(key.charCodeAt(0));
    return game;
}

function topLine(state) {
    return state.nhDisplay.grid[0]
        .map(({ ch }) => ch).join('').trimEnd();
}

test('runtime bindings preserve option order, number-pad layout, and rest', () => {
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

test('parseCommand echoes a multi-digit count only at source boundaries', async () => {
    // Twelve is the smallest multi-digit count, so the first digit remains
    // silent and the second activates cmd.c get_count()'s Count message.
    const state = parserState('12.');
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

test('number-pad count prefix feeds the same saturating parser', async () => {
    // Five nines exceed NetHack's portable LARGEST_INT (32767), proving that
    // counts clamp rather than following JavaScript's larger integer range.
    const state = parserState('n99999.');
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
