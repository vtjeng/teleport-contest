import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    MOVEMENT_INTENTS,
    UnsupportedHeroCommandBoundaryError,
    UnsupportedHeroCommandBranchBoundaryError,
} from '../js/cmd.js';
import { UnsupportedHeroMoveBoundaryError } from '../js/hack.js';
import {
    DEVELOPMENT_DIR,
    commandsIssued,
    cursorState,
    extendedCommandAt,
    formatReplayContext,
    isCommandRefusal,
    isSerializeBugMismatch,
    main,
    recordedTopLine,
    silentDivergence,
    stopStepIndex,
    supportedCommands,
} from './scan-sessions.mjs';

// A recorded screen is rows joined by newlines, which frozen/screen-decode.mjs
// decodes directly, so a case can place one glyph without an escape sequence.
// Row 9 and column 68 are an ordinary map position: row 9 lies inside the map
// rows 1 to 21, and column 68 inside the 80-column terminal.
const HERO_ROW = 9;
const HERO_COLUMN = 68;

function screenWith(row, column, glyph) {
    return '\n'.repeat(row) + ' '.repeat(column) + glyph;
}

function stepAt(row, column, glyph, key = null) {
    return { key, cursor: [column, row, 1], screen: screenWith(row, column, glyph) };
}

test('the scan is pinned to the development set', () => {
    // AGENTS.md permits only score-holdout.mjs to touch sessions/holdout/.
    // This scan reads session contents, so its directory must be fixed rather
    // than supplied by a caller.
    assert.ok(DEVELOPMENT_DIR.endsWith('/sessions'));
    assert.ok(!DEVELOPMENT_DIR.includes('holdout'));
});

test('main rejects every argument outside its two options', async () => {
    await assert.rejects(
        () => main(['sessions/holdout']),
        /only --json and --debug-full-replay/,
    );
    await assert.rejects(
        () => main(['--json', '--sessions=/tmp/elsewhere']),
        /only --json and --debug-full-replay/,
    );
    await assert.rejects(
        () => main(['--by=screens']),
        /only --json and --debug-full-replay/,
    );
});

test('--help prints the options and replays nothing', async () => {
    const lines = [];
    const written = console.log;
    console.log = (line) => lines.push(String(line));
    try {
        await main(['--help']);
    } finally {
        console.log = written;
    }
    const printed = lines.join('\n');
    assert.match(printed, /--json/);
    assert.match(printed, /--debug-full-replay/);
    assert.doesNotMatch(printed, /first stops/);
});

test('a stop is attributed to the recorded step the port never consumed', () => {
    // The port emits one screen per input boundary in recorded order, so after
    // 11 emitted screens the refused keystroke is the one on recorded step 11.
    // 11 is seed8000-tourist-starter's emitted count, where step 11 is the 'i'
    // the repeated-command boundary refuses.
    assert.equal(stopStepIndex(11), 11);
    // A session refused before its first command emits only the opening
    // screen, which makes step 1 the refused keystroke.
    assert.equal(stopStepIndex(1), 1);
});

test('recordedTopLine reads C message line, trimmed', () => {
    // Wire format per frozen/screen-decode.mjs: plain bytes land at the cursor
    // and '\n' starts the next row, so row 0 is the message line. The recorder
    // pads rows toward 80 columns, which trimEnd() has to remove.
    assert.equal(
        recordedTopLine({ screen: "Unknown command ' '.        \nnext row" }),
        "Unknown command ' '.",
    );
    // A blank message line is normal: most movement steps print nothing.
    assert.equal(recordedTopLine({ screen: '\nmap starts here' }), '');
    // Defensive: a step index past the recorded steps yields no screen.
    assert.equal(recordedTopLine(undefined), '');
});

test('the look-ahead context exposes the inputs needed for a C-path witness', () => {
    const text = formatReplayContext({
        segments: [{
            // A completed earlier segment can persist state into the stopped
            // segment, so its distinct configuration and input must survive.
            segment: 0,
            seed: 3,
            datetime: '20260414170000',
            nethackrc: 'OPTIONS=autopickup\n',
            inputThroughStop: '@S',
        }, {
            // Seed 4 and this timestamp are the exact recorded inputs for the
            // pony session whose 61-step object-pile forecast exposed the gate.
            segment: 1,
            seed: 4,
            datetime: '20260414173108',
            nethackrc: 'OPTIONS=symset:DECgraphics\n',
            // The prefix includes the stop key so toggles and prompt answers
            // that change dynamic state cannot disappear behind the message.
            inputThroughStop: 'Tetra\ryy  nkkklLuujjllnnJj',
        }],
    });
    assert.match(text, /segment: 0[\s\S]*OPTIONS=autopickup/u);
    assert.match(text, /segment: 1/u);
    assert.match(text, /seed: 4/u);
    assert.match(text, /datetime: 20260414173108/u);
    assert.match(text, /OPTIONS=symset:DECgraphics/u);
    assert.match(text, /input through stop: "Tetra\\ryy  n/u);
    assert.match(text, /verify the exact C branch/u);
});

test('the cursor resting on the hero marks the next byte a command', () => {
    // The state NetHack leaves while it waits for a command: cursor on the
    // hero's own glyph, on a map row.
    assert.equal(
        cursorState(stepAt(HERO_ROW, HERO_COLUMN, '@')),
        'command',
    );
});

test('a cursor off the map rows marks the next byte an answer', () => {
    // Row 0 is the top line, where a --More-- or a yes/no prompt parks the
    // cursor; row 22 is the first status line. Neither can be read as a
    // command position, whatever glyph sits under the cursor.
    assert.equal(cursorState(stepAt(0, 40, '@')), 'answer');
    assert.equal(cursorState(stepAt(22, 40, '@')), 'answer');
});

test('a cursor on a blank map cell marks the next byte an answer', () => {
    // A text window or menu drawn over the map parks the cursor inside itself,
    // where the cell is blank. seed0004 reaches this at its `Do you want a
    // tutorial?` prompt, and misreading it as a command would invent debt.
    assert.equal(cursorState(stepAt(6, 27, ' ')), 'answer');
});

test('a cursor on some other map glyph is reported, not guessed', () => {
    // A polymorphed or engulfed hero draws a glyph that is neither `@` nor
    // blank. Classifying it either way would be a guess, so it counts as
    // ambiguous and the report states the total.
    assert.equal(cursorState(stepAt(HERO_ROW, HERO_COLUMN, 'r')), 'ambiguous');
});

test('a step with no recorded screen is not read as a command', () => {
    // The first recorded step carries the opening screen and a null key, and a
    // segment boundary can leave a step without one. Neither is a command
    // position, and reading `undefined` as one would shift every later byte.
    assert.equal(cursorState(undefined), 'answer');
    assert.equal(cursorState({ key: 'k', cursor: [1, 1, 1] }), 'answer');
});

test('an extended command is read from the prefix its prompt records', () => {
    // `doextcmd()` autocompletes, so `rid` is the whole of what a session
    // recording of `#ride` holds before the terminator. Exactly one entry of
    // extcmdlist[] starts with `rid`, so the prefix names it.
    const steps = [
        stepAt(HERO_ROW, HERO_COLUMN, '@', '#'),
        { key: 'r' }, { key: 'i' }, { key: 'd' }, { key: '\r' },
        { key: 'k' },
    ];
    // `dispatchAt` is the terminator at index 4, where the command runs. The
    // port paints every frame up to it through `doextcmd()`, so the behavior is
    // charged from there and not from the `#` at index 0.
    assert.deepEqual(extendedCommandAt(steps, 0),
        { name: '#ride', nextIndex: 5, dispatchAt: 4 });
});

test('an ambiguous extended prefix keeps the text that was typed', () => {
    // `w` starts #wait, #wear, #wield and more, so no single entry owns it.
    // Reporting the raw prefix keeps the row honest; attributing it to one
    // command would put screens behind an behavior nobody typed.
    const steps = [
        stepAt(HERO_ROW, HERO_COLUMN, '@', '#'),
        { key: 'w' }, { key: '\r' },
    ];
    assert.equal(extendedCommandAt(steps, 0).name, '#w');
});

test('the supported set is every command the port dispatches', () => {
    const supported = supportedCommands();
    for (const command of ADMITTED_COMMANDS)
        assert.equal(supported.has(command), true, command);
    // Every MOVEMENT_INTENTS entry carries run mode 0, 1 or 3 today, so all 24
    // are admitted: 8 move, 8 run and 8 rush. The run-mode filter guards a
    // future entry rather than excluding a present one, which is why this
    // asserts the count instead of a filtered subset.
    assert.equal(Object.keys(MOVEMENT_INTENTS).length, 24);
    assert.equal(supported.size, ADMITTED_COMMANDS.length + 24);
    // `travel` is now admitted through its ordinary keyboard route. Its
    // target-selection slice stops at findtravelpath(), so the command is
    // supported here even though later travel steps still carry debt.
    assert.equal(supported.has('travel'), true);
});

// isCommandRefusal() reads the class js/cmd.js raised and never the message,
// so each case below carries the shortest reason that identifies the seam it
// stands for. 0x71 is `q`, an admitted command byte, and is the same in the
// first two cases on purpose: nothing in the recording tells them apart.
test('isCommandRefusal separates a refused command from a refused branch',
    () => {
    // The dispatch seam. admitParsedCommand() refuses a byte ADMITTED_COMMANDS
    // does not admit, and supportedCommands() reads that same set, so the
    // model derives this stop from the recording by itself.
    assert.equal(
        isCommandRefusal(new UnsupportedHeroCommandBoundaryError(
            'the repeated-command boundary', 0x71)),
        true,
    );
    // failClosedCommand()'s seam, below a command that was dispatched. The
    // gate admits the first byte, so the model reads the command as supported
    // and can name nothing at the step the port stopped on.
    assert.equal(
        isCommandRefusal(new UnsupportedHeroCommandBranchBoundaryError(
            'an unported branch of this command: quaffing a potion', 0x71)),
        false,
    );
    // A boundary raised outside any command was never derivable either, and
    // is the case the branch refusal joins.
    assert.equal(
        isCommandRefusal(new UnsupportedHeroMoveBoundaryError('engraving')),
        false,
    );
});

test('only the bytes read at a command position count as commands', () => {
    // Every recorded step carries the byte consumed and the screen that byte
    // produced, so the state a byte was read in is the previous step's screen.
    // Here `k` opens a window, `y` dismisses it, and `e` is read back at the
    // hero: two commands around one answer, and `y` resolves to a real command
    // so the case turns on position rather than on the byte.
    const steps = [
        stepAt(HERO_ROW, HERO_COLUMN, '@'),
        stepAt(6, 27, ' ', 'k'),
        stepAt(HERO_ROW, HERO_COLUMN, '@', 'y'),
        stepAt(HERO_ROW, HERO_COLUMN, '@', 'e'),
    ];
    const resolve = (key) => ({ k: 'movenorth', y: 'movenorthwest', e: 'eat' }[key]
        ?? null);
    const issued = commandsIssued(steps, resolve);
    // The step index travels with each command, because the ranking needs the
    // first step at which a session needs an behavior, not merely that it does.
    assert.deepEqual(issued.commands, [
        { index: 1, command: 'movenorth' },
        { index: 3, command: 'eat' },
    ]);
    assert.equal(issued.answers, 1);
    assert.equal(issued.ambiguous, 0);
});

test('the name answering a # prompt is not counted as a command', () => {
    // The bytes spelling `pray` answer the extended-command prompt. Counting
    // them again as commands would add four behaviors that nobody issued.
    const steps = [
        stepAt(HERO_ROW, HERO_COLUMN, '@'),
        { key: '#' },
        { key: 'p' }, { key: 'r' }, { key: 'a' }, { key: 'y' }, { key: '\r' },
    ];
    const issued = commandsIssued(steps, (key) => (key === '#' ? '#' : 'eat'));
    // The behavior sits at the terminator at index 6, where `doextcmd()` runs the
    // command. Every frame before it is painted by ported code.
    assert.deepEqual(issued.commands, [{ index: 6, command: '#pray' }]);
    // Four name bytes and the terminator answered the prompt.
    assert.equal(issued.answers, 5);
});

test('a byte bound to no command is not debt', () => {
    // rhack()'s bad-command path is ported, so an unbound byte is dispatched
    // already and must not appear as an behavior to port.
    const steps = [stepAt(HERO_ROW, HERO_COLUMN, '@'), { key: '\\' }];
    assert.deepEqual(commandsIssued(steps, () => null).commands, []);
});

function divergenceSegment(steps) {
    return {
        seed: 1,
        datetime: '20260101000000',
        nethackrc: '',
        moves: '',
        steps,
    };
}

test('silentDivergence reports nothing when replayed output matches', () => {
    // Two steps whose screens, cursors, and single RNG call the port
    // reproduces exactly; both the stopped and the finished reading must
    // return null.
    const steps = [
        { key: null, screen: 'same', cursor: [0, 0, 1], rng: ['rn2(4)=1'] },
        { key: 'j', screen: 'other', cursor: [1, 2, 1], rng: [] },
    ];
    const jsOutput = {
        rng: ['rn2(4)=1'],
        screens: ['same', 'other'],
        cursors: [[0, 0, 1], [1, 2, 1]],
    };
    assert.equal(silentDivergence([divergenceSegment(steps)], jsOutput, true),
        null);
    assert.equal(silentDivergence([divergenceSegment(steps)], jsOutput, false),
        null);
});

test('silentDivergence localizes the first differing screen', () => {
    // The second screen differs in one character, 'y' for the recorded 'x'
    // at string index 4, so the first mismatch is screen index 1, cell row 0
    // column 4, while the RNG stream (empty on both sides) stays aligned.
    const steps = [
        { key: null, screen: 'same', cursor: [0, 0, 1], rng: [] },
        { key: 'j', screen: 'cellx', cursor: [0, 0, 1], rng: [] },
    ];
    const jsOutput = {
        rng: [],
        screens: ['same', 'celly'],
        cursors: [[0, 0, 1], [0, 0, 1]],
    };
    const divergence = silentDivergence(
        [divergenceSegment(steps)], jsOutput, true,
    );
    assert.equal(divergence.screen.index, 1);
    assert.equal(divergence.screen.row, 0);
    assert.equal(divergence.screen.column, 4);
    assert.equal(divergence.screen.location.stepIndex, 1);
    assert.equal(divergence.rng, null);
});

test('silentDivergence reports an RNG value mismatch either way', () => {
    // The port's first call disagrees in value, rn2(4)=2 against the
    // recorded rn2(4)=1 at call index 0. A value mismatch inside the common
    // prefix is a real desynchronization whether or not the session stopped.
    const steps = [
        { key: null, screen: 's', cursor: [0, 0, 1], rng: ['rn2(4)=1'] },
    ];
    const jsOutput = {
        rng: ['rn2(4)=2'], screens: ['s'], cursors: [[0, 0, 1]],
    };
    for (const stopped of [true, false]) {
        const divergence = silentDivergence(
            [divergenceSegment(steps)], jsOutput, stopped,
        );
        assert.equal(divergence.rng.index, 0);
        assert.equal(divergence.rng.cEntry, 'rn2(4)=1');
        assert.equal(divergence.rng.jsEntry, 'rn2(4)=2');
        assert.equal(divergence.screen, null);
    }
});

test('a shorter RNG log reports only when the session finished', () => {
    // C recorded two calls and the port made one, with screen and cursor
    // matching. For a stopped session the missing rnd(6)=2 at call index 1
    // is a truncation artifact -- the port stops before consuming randomness
    // at the refused step -- so the reading is null. For a finished session
    // nothing was truncated, so the same tail is a real divergence.
    const steps = [
        {
            key: null,
            screen: 's',
            cursor: [0, 0, 1],
            rng: ['rn2(4)=1', 'rnd(6)=2'],
        },
    ];
    const jsOutput = {
        rng: ['rn2(4)=1'], screens: ['s'], cursors: [[0, 0, 1]],
    };
    assert.equal(silentDivergence([divergenceSegment(steps)], jsOutput, true),
        null);
    const finished = silentDivergence(
        [divergenceSegment(steps)], jsOutput, false,
    );
    assert.equal(finished.rng.index, 1);
    assert.equal(finished.rng.cEntry, 'rnd(6)=2');
    assert.equal(finished.rng.jsEntry, undefined);
});

test('a longer JS RNG log reports only when the session finished', () => {
    // Symmetric to the previous test: C recorded one call and the port made
    // two. For a stopped session the extra rnd(6)=2 at call index 1 is a
    // truncation artifact, so the reading is null.
    const steps = [
        {
            key: null,
            screen: 's',
            cursor: [0, 0, 1],
            rng: ['rn2(4)=1'],
        },
    ];
    const jsOutput = {
        rng: ['rn2(4)=1', 'rnd(6)=2'], screens: ['s'], cursors: [[0, 0, 1]],
    };
    assert.equal(silentDivergence([divergenceSegment(steps)], jsOutput, true),
        null);
    const finished = silentDivergence(
        [divergenceSegment(steps)], jsOutput, false,
    );
    assert.equal(finished.rng.index, 1);
    assert.equal(finished.rng.cEntry, undefined);
    assert.equal(finished.rng.jsEntry, 'rnd(6)=2');
});

// rankCandidates divergence annotations: a session whose screens diverge
// before its boundary step cannot deliver matched screens for that candidate,
// so its unlocks contribution is zeroed and the annotation records why.

test('isSerializeBugMismatch detects attr-only mismatch on a space', () => {
    // Inverse attribute on a space: C has attr=1 (inverse), JS has attr=0.
    // Both render as space. This is the serialize bug.
    assert.equal(isSerializeBugMismatch({
        kind: 'attr',
        row: 2,
        column: 20,
        cCell: { ch: ' ', color: 8, attr: 1, decgfx: 0 },
        jsCell: { ch: ' ', color: 8, attr: 0, decgfx: 0 },
    }), true);
});

test('isSerializeBugMismatch rejects character mismatches', () => {
    // Different characters are a real rendering bug, not serialize bug.
    assert.equal(isSerializeBugMismatch({
        kind: 'ch',
        row: 3,
        column: 21,
        cCell: { ch: ' ', color: 8, attr: 0, decgfx: 0 },
        jsCell: { ch: '~', color: 4, attr: 0, decgfx: 0 },
    }), false);
});

test('isSerializeBugMismatch rejects attr mismatch on non-space', () => {
    // Attribute mismatch on a non-space character is a real bug.
    assert.equal(isSerializeBugMismatch({
        kind: 'attr',
        row: 5,
        column: 10,
        cCell: { ch: 'a', color: 8, attr: 2, decgfx: 0 },
        jsCell: { ch: 'a', color: 8, attr: 0, decgfx: 0 },
    }), false);
});

test('isSerializeBugMismatch returns false for null', () => {
    assert.equal(isSerializeBugMismatch(null), false);
});
