import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ADMITTED_COMMANDS,
    MOVEMENT_INTENTS,
} from '../js/cmd.js';
import {
    assembleOwners,
    ceilingFor,
    commandsIssued,
    cursorState,
    extendedCommandAt,
    rankCandidates,
    stopPointAgreement,
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
    // `dispatchAt` is the terminator at index 4, where the command runs. The
    // port paints every frame up to it through `doextcmd()`, so the owner is
    // charged from there and not from the `#` at index 0.
    assert.deepEqual(extendedCommandAt(steps, 0),
        { name: '#ride', nextIndex: 5, dispatchAt: 4 });
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
    // The step index travels with each command, because the ranking needs the
    // first step at which a session needs an owner, not merely that it does.
    assert.deepEqual(issued.commands, [
        { index: 1, command: 'movenorth' },
        { index: 3, command: 'eat' },
    ]);
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
    // The owner sits at the terminator at index 6, where `doextcmd()` runs the
    // command. Every frame before it is painted by ported code.
    assert.deepEqual(issued.commands, [{ index: 6, command: '#pray' }]);
    // Four name bytes and the terminator answered the prompt.
    assert.equal(issued.answers, 5);
});

test('a byte bound to no command is not debt', () => {
    // rhack()'s bad-command path is ported, so an unbound byte is dispatched
    // already and must not appear as an owner to port.
    const steps = [stepAt(HERO_ROW, HERO_COLUMN, '@'), { key: '\\' }];
    assert.deepEqual(commandsIssued(steps, () => null).commands, []);
});

test('an owner is placed at its earliest use, and the list is ordered by it', () => {
    // `eat` is issued twice. A port without it diverges at step 4, not step 40,
    // so the later use must not displace the earlier one.
    const issued = [
        { index: 40, command: 'eat' },
        { index: 4, command: 'eat' },
        { index: 12, command: 'wait' },
        { index: 30, command: 'down' },
    ];
    // `wait` is dispatched today, so it is not an owner to port.
    const supported = new Set(['wait']);
    // The port stopped at step 20 on a behavior it has not ported, which places
    // that owner between `eat` at 4 and `down` at 30.
    const behavioral = { member: 'a behavioral stop', at: 20 };
    assert.deepEqual(assembleOwners(issued, supported, behavioral), [
        { member: 'eat', at: 4 },
        { member: 'a behavioral stop', at: 20 },
        { member: 'down', at: 30 },
    ]);
});

test('an owner is charged every screen that stands behind its first use', () => {
    const rows = [
        // 100 recorded steps, `eat` first needed at step 40, and nothing else
        // stands in the way: removing `eat` from a perfect port loses the 60
        // screens from step 40 on, and porting it earns all 60.
        { file: 'a', recordedSteps: 100, owners: [{ member: 'eat', at: 40 }] },
        // `eat` at step 10 and `down` at step 30. Removing `eat` loses 90 and
        // removing `down` loses 70, because each is needed for every screen
        // after its own first use. `eat` is the bottleneck, so porting it
        // advances this session the 20 steps to `down` and no further.
        {
            file: 'b',
            recordedSteps: 100,
            owners: [{ member: 'eat', at: 10 }, { member: 'down', at: 30 }],
        },
        // A session that needs nothing charges nothing to anybody.
        { file: 'c', recordedSteps: 20, owners: [] },
    ];
    assert.deepEqual(rankCandidates(rows), [
        // 60 + 90 gated, and 60 + 20 advance.
        { member: 'eat', gated: 150, gatedSessions: 2, advance: 80, bottleneckIn: 2 },
        // Gated in one session, and the bottleneck in none of them.
        { member: 'down', gated: 70, gatedSessions: 1, advance: 0, bottleneckIn: 0 },
    ]);
});

test('the two orders rank the same set differently', () => {
    // Within one session an earlier owner always gates more, so the two orders
    // can only disagree across sessions. This is the shape the real scan shows
    // for `takeoff`, which gates 2,609 screens and earns none.
    const rows = [
        // A long session where `deep` sits behind `blocker`, so `deep` gates
        // 980 of its 1,000 steps and can never be the one to port next.
        {
            file: 'a',
            recordedSteps: 1000,
            owners: [{ member: 'blocker', at: 10 }, { member: 'deep', at: 20 }],
        },
        // A short session blocked from its first step, so `near` gates only 99
        // but earns all 99 the moment it lands.
        { file: 'b', recordedSteps: 100, owners: [{ member: 'near', at: 1 }] },
    ];
    // What a perfect port would lose: blocker 990, deep 980, near 99.
    assert.deepEqual(
        rankCandidates(rows, 'gated').map((entry) => entry.member),
        ['blocker', 'deep', 'near'],
    );
    // What the next goal earns: near 99, blocker the 10-step gap to `deep`,
    // and `deep` nothing at all. This is the default, being the selection
    // question.
    assert.deepEqual(
        rankCandidates(rows, 'advance').map((entry) => entry.member),
        ['near', 'blocker', 'deep'],
    );
    assert.deepEqual(rankCandidates(rows), rankCandidates(rows, 'advance'));
    assert.throws(() => rankCandidates(rows, 'screens'), /unknown order/u);
});

test('a session whose earliest owner misses the stop point is reported', () => {
    const rows = [
        // Agrees: the port stopped at step 11 and the earliest owner is at 11.
        { file: 'a', screensEmitted: 11, owners: [{ member: 'x', at: 11 }] },
        // Disagrees: the classifier put the owner 5 steps before the stop,
        // which is the shape an extended command took when it was charged from
        // the `#` rather than from the terminator that runs it.
        { file: 'b', screensEmitted: 11, owners: [{ member: '#ride', at: 6 }] },
        // A finished session has no owner and is outside the check.
        { file: 'c', screensEmitted: 23, owners: [] },
    ];
    const agreement = stopPointAgreement(rows);
    assert.equal(agreement.total, 2);
    assert.equal(agreement.agree, 1);
    assert.deepEqual(agreement.mismatches.map((row) => row.file), ['b']);
});

test('the unearned screens of a session are its recorded steps less its own', () => {
    // The ceiling a session still stands to gain, used by the report's totals.
    assert.equal(ceilingFor({ screensEmitted: 40, recordedSteps: 100 }), 60);
});
