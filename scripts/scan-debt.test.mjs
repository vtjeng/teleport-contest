import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    MOVEMENT_INTENTS,
} from '../js/cmd.js';
import {
    ceilingFor,
    commandsIssued,
    cursorState,
    extendedCommandAt,
    rankCandidates,
    supportedCommands,
} from './scan-debt.mjs';

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
    assert.deepEqual(extendedCommandAt(steps, 0), { name: '#ride', nextIndex: 5 });
});

test('an ambiguous extended prefix keeps the text that was typed', () => {
    // `w` starts #wait, #wear, #wield and more, so no single entry owns it.
    // Reporting the raw prefix keeps the row honest; attributing it to one
    // command would put screens behind an owner nobody typed.
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
    // `travel` is bound and recorded by several sessions and is not ported, so
    // it must be absent or every travel session would show no debt.
    assert.equal(supported.has('travel'), false);
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
    assert.deepEqual(issued.commands, ['movenorth', 'eat']);
    assert.equal(issued.answers, 1);
    assert.equal(issued.ambiguous, 0);
});

test('the name answering a # prompt is not counted as a command', () => {
    // The bytes spelling `pray` answer the extended-command prompt. Counting
    // them again as commands would add four owners that nobody issued.
    const steps = [
        stepAt(HERO_ROW, HERO_COLUMN, '@'),
        { key: '#' },
        { key: 'p' }, { key: 'r' }, { key: 'a' }, { key: 'y' }, { key: '\r' },
    ];
    const issued = commandsIssued(steps, (key) => (key === '#' ? '#' : 'eat'));
    assert.deepEqual(issued.commands, ['#pray']);
    // Four name bytes and the terminator answered the prompt.
    assert.equal(issued.answers, 5);
});

test('a byte bound to no command is not debt', () => {
    // rhack()'s bad-command path is ported, so an unbound byte is dispatched
    // already and must not appear as an owner to port.
    const steps = [stepAt(HERO_ROW, HERO_COLUMN, '@'), { key: '\\' }];
    assert.deepEqual(commandsIssued(steps, () => null).commands, []);
});

test('a candidate earns only the sessions whose whole debt it is', () => {
    const rows = [
        // 60 unearned screens behind one owner: `eat` clears the session.
        { file: 'a', screensEmitted: 40, recordedSteps: 100, debt: ['eat'] },
        // 90 unearned screens behind two owners: neither clears it alone, so
        // both count as blocked-with and neither earns the screens.
        { file: 'b', screensEmitted: 10, recordedSteps: 100, debt: ['eat', 'down'] },
        // A session already complete contributes nothing to any candidate.
        { file: 'c', screensEmitted: 20, recordedSteps: 20, debt: [] },
    ];
    assert.equal(ceilingFor(rows[0]), 60);
    const ranking = rankCandidates(rows);
    assert.deepEqual(ranking, [
        { member: 'eat', sessions: 1, screens: 60, blockedWith: 1 },
        { member: 'down', sessions: 0, screens: 0, blockedWith: 1 },
    ]);
});
