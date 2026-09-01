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
    aheadMembers,
    aheadStretch,
    assembleBehaviors,
    attachBehaviors,
    ceilingAgainstSupports,
    ceilingFor,
    censusBy,
    commandsIssued,
    cursorState,
    refusedCommandKey,
    dedupeMessages,
    divergenceCandidates,
    divergenceStretches,
    executedCommands,
    extendedCommandAt,
    formatReplayContext,
    isCommandRefusal,
    isSerializeBugMismatch,
    legend,
    main,
    rankCandidates,
    recordedTopLine,
    reconcile,
    refusalsWithoutBehavior,
    silentDivergence,
    stopPointAgreement,
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

test('main rejects every argument outside its three options', async () => {
    // A path argument is the way this scan could be aimed at the holdout, so
    // it must be refused before any session is opened. Every accepted option
    // carries its value in the same token, so no bare argument is ever read.
    await assert.rejects(
        () => main(['sessions/holdout']),
        /only --json, --by=<unlocks\|supports>/,
    );
    await assert.rejects(
        () => main(['--json', '--sessions=/tmp/elsewhere']),
        /only --json, --by=<unlocks\|supports>/,
    );
    // `--by` takes only the two orders RANK_ORDERS defines; anything else is
    // a typo rather than a request, and must not reach the report.
    await assert.rejects(
        () => main(['--by=screens']),
        /only --json, --by=<unlocks\|supports>/,
    );
});

test('the legend says its sort order ranks nothing', () => {
    // .agents/selection.md gave up carrying this when its appendix stopped
    // restating the report. A reader who takes the top row of either table as
    // the selected candidate skips the capped forecast entirely, so the report
    // has to disown its own ordering.
    const text = legend(7765);
    assert.match(text, /sort for display alone/);
    assert.match(text, /Neither ordering ranks a row by priority/);
    assert.match(text, /\.agents\/selection\.md states/);
});

test('--help prints the options and replays nothing', async () => {
    // .agents/selection.md documents --ahead alone and sends a reader here for
    // the rest, so --help has to be a real option rather than an unknown flag
    // whose rejection happens to list them. It must also return before the
    // replay: exercising it costs a full scan otherwise.
    const lines = [];
    const written = console.log;
    console.log = (line) => lines.push(String(line));
    try {
        await main(['--help']);
    } finally {
        console.log = written;
    }
    const printed = lines.join('\n');
    assert.match(printed, /--ahead=<behavior>/);
    assert.match(printed, /--ahead-all/);
    assert.match(printed, /--by=<unlocks\|supports>/);
    assert.match(printed, /--json/);
    // A replay prints this heading, so its absence shows --help returned first.
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

test('the ceiling is the recorded steps a session never reached', () => {
    // seed8000-tourist-starter: 23 recorded steps, 11 emitted screens. The
    // ceiling is what any fix to its boundary could earn at most, not a
    // prediction of what one would earn.
    assert.equal(ceilingFor({ recordedSteps: 23, screensEmitted: 11 }), 12);
    // A session the port replays to the end leaves nothing behind its stop.
    assert.equal(ceilingFor({ recordedSteps: 40, screensEmitted: 40 }), 0);
    // The ceiling the report's totals sum, on a session stopped mid-way.
    assert.equal(ceilingFor({ screensEmitted: 40, recordedSteps: 100 }), 60);
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

test('censusBy groups sessions and sums the screens behind each group', () => {
    const rows = [
        // Two sessions sharing one boundary, with ceilings 20 and 5.
        { boundary: 'unsupported hero command', recordedSteps: 30, screensEmitted: 10 },
        { boundary: 'unsupported hero command', recordedSteps: 10, screensEmitted: 5 },
        // One session on a different boundary, with a larger ceiling than
        // either of the two above, to pin that session count sorts first.
        { boundary: 'pet object pickup', recordedSteps: 100, screensEmitted: 10 },
    ];
    assert.deepEqual(censusBy(rows, 'boundary'), [
        { key: 'unsupported hero command', sessions: 2, ceiling: 25 },
        { key: 'pet object pickup', sessions: 1, ceiling: 90 },
    ]);
});

test('censusBy names an unbound keystroke rather than dropping it', () => {
    // A key with no binding is C's "Unknown command" path, which is a real
    // implementation target; it must not vanish from the census.
    const rows = [{ command: null, recordedSteps: 1953, screensEmitted: 1 }];
    assert.deepEqual(censusBy(rows, 'command'), [
        { key: '(none)', sessions: 1, ceiling: 1952 },
    ]);
});

test('the refused command census labels a byte that answered a prompt', () => {
    // seed0360 is the standing case: it stopped on "o" while answering the
    // apply prompt, and "o" is bound to `open`. Filing 699 screens under
    // `open` would offer a ranking candidate no session issued.
    assert.equal(
        refusedCommandKey({ command: 'open', keyCursor: 'answer' }),
        'open (the byte answered a prompt)',
    );
    // A byte whose role cannot be read is labelled apart from both, because a
    // polymorphed or engulfed hero draws a glyph the cursor test cannot match.
    assert.equal(
        refusedCommandKey({ command: 'open', keyCursor: 'ambiguous' }),
        "open (the byte's role could not be read)",
    );
    // A byte that did begin a command keeps its bare name, so the row stays
    // rankable.
    assert.equal(
        refusedCommandKey({ command: 'open', keyCursor: 'command' }),
        'open',
    );
    // An unbound key has no name to label; censusBy files it under (none).
    assert.equal(
        refusedCommandKey({ command: null, keyCursor: 'command' }),
        null,
    );
});

test('censusBy groups by a key function as well as a field name', () => {
    // Two sessions stopping on the same command, one of them answering a
    // prompt, must not share a row: ceilings 20 and 5 stay apart.
    const rows = [
        { command: 'open', keyCursor: 'command', recordedSteps: 30, screensEmitted: 10 },
        { command: 'open', keyCursor: 'answer', recordedSteps: 10, screensEmitted: 5 },
    ];
    assert.deepEqual(censusBy(rows, refusedCommandKey), [
        { key: 'open', sessions: 1, ceiling: 20 },
        { key: 'open (the byte answered a prompt)', sessions: 1, ceiling: 5 },
    ]);
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

test('an behavior is placed at its earliest use, and the list is ordered by it', () => {
    // `eat` is issued twice. A port without it diverges at step 4, not step 40,
    // so the later use must not displace the earlier one.
    const issued = [
        { index: 40, command: 'eat' },
        { index: 4, command: 'eat' },
        { index: 12, command: 'wait' },
        { index: 30, command: 'down' },
    ];
    // `wait` is dispatched today, so it is not an behavior to port.
    const supported = new Set(['wait']);
    // The port stopped at step 20 on a behavior it has not ported, which places
    // that behavior between `eat` at 4 and `down` at 30.
    const behavioral = { member: 'a behavioral stop', at: 20 };
    assert.deepEqual(assembleBehaviors(issued, supported, behavioral), [
        { member: 'eat', at: 4 },
        { member: 'a behavioral stop', at: 20 },
        { member: 'down', at: 30 },
    ]);
});

test('an behavior is charged every screen that stands behind its first use', () => {
    const rows = [
        // 100 recorded steps, `eat` first needed at step 40, and nothing else
        // stands in the way: removing `eat` from a perfect port loses the 60
        // screens from step 40 on, and porting it earns all 60.
        { file: 'a', recordedSteps: 100, behaviors: [{ member: 'eat', at: 40 }] },
        // `eat` at step 10 and `down` at step 30. Removing `eat` loses 90 and
        // removing `down` loses 70, because each is needed for every screen
        // after its own first use. `eat` is the bottleneck, so porting it
        // advances this session the 20 steps to `down` and no further.
        {
            file: 'b',
            recordedSteps: 100,
            behaviors: [{ member: 'eat', at: 10 }, { member: 'down', at: 30 }],
        },
        // A session that needs nothing charges nothing to anybody.
        { file: 'c', recordedSteps: 20, behaviors: [] },
    ];
    assert.deepEqual(rankCandidates(rows), [
        // 60 + 90 supports, and 60 + 20 unlocks.
        { member: 'eat', supports: 150, supportsSessions: 2, unlocks: 80, unlocksSessions: 2 },
        // Gated in one session, and the bottleneck in none of them.
        { member: 'down', supports: 70, supportsSessions: 1, unlocks: 0, unlocksSessions: 0 },
    ]);
});

test('the two orders rank the same set differently', () => {
    // Within one session an earlier behavior always gates more, so the two orders
    // can only disagree across sessions. This is the shape the real scan shows
    // for `takeoff`, which gates 2,609 screens and earns none.
    const rows = [
        // A long session where `deep` sits behind `blocker`, so `deep` gates
        // 980 of its 1,000 steps and can never be the one to port next.
        {
            file: 'a',
            recordedSteps: 1000,
            behaviors: [{ member: 'blocker', at: 10 }, { member: 'deep', at: 20 }],
        },
        // A short session blocked from its first step, so `near` gates only 99
        // but earns all 99 the moment it lands.
        { file: 'b', recordedSteps: 100, behaviors: [{ member: 'near', at: 1 }] },
    ];
    // What a perfect port would lose: blocker 990, deep 980, near 99.
    assert.deepEqual(
        rankCandidates(rows, 'supports').map((entry) => entry.member),
        ['blocker', 'deep', 'near'],
    );
    // What the next goal earns: near 99, blocker the 10-step gap to `deep`,
    // and `deep` nothing at all. This is the default, being the selection
    // question.
    assert.deepEqual(
        rankCandidates(rows, 'unlocks').map((entry) => entry.member),
        ['near', 'blocker', 'deep'],
    );
    assert.deepEqual(rankCandidates(rows), rankCandidates(rows, 'unlocks'));
    assert.throws(() => rankCandidates(rows, 'screens'), /unknown order/u);
});

test('a command the port ran before stopping counts as supported', () => {
    // `#ride` reaches its handler through `doextcmd()` and so never appears in
    // ADMITTED_COMMANDS, which gates only a command's first byte. Porting it
    // left both ride sessions reading it as debt at a step the port had already
    // run past. A command issued before the stop is one the port executed.
    const rows = [
        // Stopped at 26; `#ride` ran at 11 and `#pray` did not run at all.
        {
            screensEmitted: 26,
            issued: [
                { index: 11, command: '#ride' },
                { index: 40, command: '#pray' },
            ],
        },
    ];
    const executed = executedCommands(rows);
    assert.equal(executed.has('#ride'), true);
    assert.equal(executed.has('#pray'), false);

    // Attaching behaviors with that set leaves only the command the port has not
    // run, and its earliest behavior then agrees with the stop point.
    const [attached] = attachBehaviors([{ ...rows[0], recordedSteps: 100, behavioral: { member: 'b', at: 26 } }]);
    assert.deepEqual(attached.debt, ['#pray', 'b']);
    assert.equal(attached.behaviors[0].at, 26);
});

test('a session whose earliest behavior misses the stop point is reported', () => {
    const rows = [
        // Agrees: the port stopped at step 11 and the earliest behavior is at 11.
        { file: 'a', screensEmitted: 11, behaviors: [{ member: 'x', at: 11 }] },
        // Disagrees: the model put the behavior 5 steps before the stop,
        // which is the shape an extended command took when it was charged from
        // the `#` rather than from the terminator that runs it.
        { file: 'b', screensEmitted: 11, behaviors: [{ member: '#ride', at: 6 }] },
        // A finished session has no behavior and is outside the check.
        { file: 'c', screensEmitted: 23, behaviors: [] },
    ];
    const agreement = stopPointAgreement(rows);
    assert.equal(agreement.total, 2);
    assert.equal(agreement.agree, 1);
    assert.deepEqual(agreement.mismatches.map((row) => row.file), ['b']);
});

test('aheadMembers lists each earliest unmet behavior once, in unlocks order', () => {
    // Three unfinished sessions and one finished one. seed-a and seed-b stop
    // first on "wield": 70-10=60 and 90-40=50 steps ahead, so unlocks 110.
    // seed-c stops first on "quaff": 80-50=30. "close" appears only as a
    // second behavior, so it has no stream and must be omitted; the finished
    // session has no unmet behavior and must not appear under any member.
    const rows = [
        { file: 'seed-a', recordedSteps: 100,
            behaviors: [{ member: 'wield', at: 10 }, { member: 'close', at: 70 }] },
        { file: 'seed-b', recordedSteps: 90,
            behaviors: [{ member: 'wield', at: 40 }] },
        { file: 'seed-c', recordedSteps: 80,
            behaviors: [{ member: 'quaff', at: 50 }] },
        { file: 'seed-done', recordedSteps: 70, behaviors: [] },
    ];
    assert.deepEqual(aheadMembers(rows), ['wield', 'quaff']);
});

test('aheadStretch spans from the current stop to the next one', () => {
    // A session shape as attachBehaviors() emits it: stopped on `eat` at step
    // 40, with `pray` visible at step 120 and 300 recorded steps in total.
    const row = {
        recordedSteps: 300,
        behaviors: [
            { member: 'eat', at: 40 },
            { member: 'pray', at: 120 },
        ],
    };
    assert.deepEqual(aheadStretch(row),
        { member: 'eat', from: 40, to: 120 });
    // With no second behavior visible, the stretch runs to the recording's
    // end, which is what makes the forecast an upper bound.
    assert.deepEqual(aheadStretch({ recordedSteps: 300,
        behaviors: [{ member: 'eat', at: 40 }] }),
    { member: 'eat', from: 40, to: 300 });
    // A session with nothing unmet forecasts nothing.
    assert.equal(aheadStretch({ recordedSteps: 300, behaviors: [] }), null);
});

test('dedupeMessages collapses consecutive identical lines only', () => {
    // The two separated "You hit it." lines must stay separate runs: the
    // classifier reads order, and a global dedupe would erase the sequence.
    assert.deepEqual(
        dedupeMessages(['You hit it.', 'You hit it.', 'It bites!',
            'You hit it.']),
        [
            { line: 'You hit it.', count: 2 },
            { line: 'It bites!', count: 1 },
            { line: 'You hit it.', count: 1 },
        ],
    );
    assert.deepEqual(dedupeMessages([]), []);
});

// The cases below are the shapes the 33 development sessions produce. Two of
// them reach `carried`: a boundary raised outside any command, and one raised
// below a command the port dispatched, which isCommandRefusal() sorts with it
// because neither is derivable from the recorded input. How many sessions each
// shape holds moves with every behavior that gets ported, so the report prints
// those counts and this comment does not.
test('reconcile sorts each stop by how the two halves name it', () => {
    // The port's own message. A carried row carries it in both halves, and
    // reconcile() only ever compares it with itself, so the tail of the real
    // level-teleport message is abbreviated here.
    const branchBoundary = 'unsupported hero command: an unported branch of '
        + 'this command: unsupported level change';
    const rows = [
        // Carried. seed0004's shape: the port refuses inside a move, so the
        // boundary is its own message and the model has no way to derive it
        // from the recorded input. Its refused byte still resolves to
        // `movesouth`, which is a command the port dispatches.
        {
            file: 'carried',
            boundary: 'unsupported hero move: floor object pile',
            commandRefusal: false,
            command: 'movesouth',
            screensEmitted: 26,
            recordedSteps: 409,
            behaviors: [
                { member: 'unsupported hero move: floor object pile', at: 26 },
            ],
        },
        // Carried too, from inside a command the port did dispatch.
        // seed0373's shape: `#levelport` runs, and js/cmd.js
        // failClosedCommand() refuses the branch below it. The refused byte is
        // the `\n` that dispatches the extended command, which the binding
        // table names `rushsouth`, and no byte at all names the branch -- so
        // the port's own message is the only behavior available.
        {
            file: 'carried-branch',
            boundary: branchBoundary,
            commandRefusal: false,
            command: 'rushsouth',
            screensEmitted: 41,
            recordedSteps: 124,
            behaviors: [{ member: branchBoundary, at: 41 }],
        },
        // Alike. seed0016's shape: the refused byte `a` binds to `apply`, and
        // the model names `apply` at the same step.
        {
            file: 'alike',
            boundary: 'unsupported hero command: the repeated-command boundary',
            commandRefusal: true,
            command: 'apply',
            screensEmitted: 3,
            recordedSteps: 36,
            behaviors: [{ member: 'apply', at: 3 }],
        },
        // Differing. seed0017's shape: the refused byte is the `\n` that
        // terminates a `#pray` prompt, which the binding table names
        // `rushsouth`. The model reads the cursor, sees a prompt, and names
        // `#pray`.
        {
            file: 'differing',
            boundary: "unsupported hero command: the extended command 'pray' is not ported",
            commandRefusal: true,
            command: 'rushsouth',
            keyCursor: 'answer',
            screensEmitted: 46,
            recordedSteps: 67,
            behaviors: [{ member: '#pray', at: 46 }],
        },
        // Unreconciled. The port refused at step 12 and the model's earliest
        // behavior sits at 40, so it believes the port supports the refused
        // byte. A counted rush would land here: the port consumes the count
        // and refuses the rush the digits precede, while ADMITTED_RUN_MODES
        // admits that same rush uncounted and so reads it as supported.
        {
            file: 'unreconciled-late',
            boundary: 'unsupported hero command: the repeated-command boundary',
            commandRefusal: true,
            command: 'rushsouth',
            screensEmitted: 12,
            recordedSteps: 100,
            behaviors: [{ member: 'quaff', at: 40 }],
        },
        // Unreconciled. The model found no unmet behavior at all in a session
        // the port refused, so no row of the behavior table stands for it.
        {
            file: 'unreconciled-empty',
            boundary: 'unsupported hero command: the repeated-command boundary',
            commandRefusal: true,
            command: 'rushsouth',
            screensEmitted: 12,
            recordedSteps: 100,
            behaviors: [],
        },
        // Unreconciled. A behavioral stop the model did not carry: the two
        // name different behaviors for the same refusal.
        {
            file: 'unreconciled-behavioral',
            boundary: 'unsupported hero move: floor object pile',
            commandRefusal: false,
            command: 'movesouth',
            screensEmitted: 26,
            recordedSteps: 409,
            behaviors: [{ member: 'unsupported hero move: door', at: 26 }],
        },
        // A session the port replayed to the end is outside the check.
        {
            file: 'finished',
            boundary: null,
            commandRefusal: false,
            command: null,
            screensEmitted: 23,
            recordedSteps: 23,
            behaviors: [],
        },
    ];
    const { carried, alike, differing, unreconciled } = reconcile(rows);
    assert.deepEqual(carried.map((row) => row.file),
        ['carried', 'carried-branch']);
    assert.deepEqual(alike.map((row) => row.file), ['alike']);
    assert.deepEqual(differing.map((row) => row.file), ['differing']);
    assert.deepEqual(unreconciled.map((row) => row.file),
        ['unreconciled-late', 'unreconciled-empty', 'unreconciled-behavioral']);
});

test('refusalsWithoutBehavior groups the census rows nothing can rank', () => {
    // The `rushsouth` row of the real refused-command census: sessions whose
    // refused byte is a getlin terminator, so the cursor rested on a prompt and
    // the census labels the row rather than filing it under `rushsouth`. Two
    // are shown here, one standing behind 21 steps and one behind 83, both
    // naming `#levelchange`, plus a third naming a different behavior so the
    // count suffix is exercised. The unbound `\r` row groups under `(none)`,
    // having no command name to label.
    const differing = [
        {
            command: 'rushsouth',
            keyCursor: 'answer',
            screensEmitted: 46,
            recordedSteps: 67,
            behaviors: [{ member: '#levelchange', at: 46 }],
        },
        {
            command: 'rushsouth',
            keyCursor: 'answer',
            screensEmitted: 15,
            recordedSteps: 98,
            behaviors: [{ member: '#levelchange', at: 15 }],
        },
        {
            command: 'rushsouth',
            keyCursor: 'answer',
            screensEmitted: 13,
            recordedSteps: 303,
            behaviors: [{ member: '#wizwish', at: 13 }],
        },
        {
            command: null,
            keyCursor: 'answer',
            screensEmitted: 9,
            recordedSteps: 25,
            behaviors: [{ member: '#name', at: 9 }],
        },
    ];
    const groups = refusalsWithoutBehavior(differing);
    assert.deepEqual(groups.map((group) => group.key),
        ['rushsouth (the byte answered a prompt)', '(none)']);
    // 21 + 83 + 290 recorded steps stand behind the three rushsouth sessions.
    assert.equal(groups[0].sessions, 3);
    assert.equal(groups[0].ceiling, 394);
    assert.deepEqual([...groups[0].modeled.entries()],
        [['#levelchange', 2], ['#wizwish', 1]]);
    // A refused byte bound to no command still names its group.
    assert.equal(groups[1].key, '(none)');
    assert.equal(groups[1].ceiling, 16);
});

test('ceilingAgainstSupports separates the projections from the rest', () => {
    const rows = [
        // A behavioral boundary: only the session that stops on it can be
        // charged for it, so its ceiling of 383 must equal its supports.
        {
            file: 'a',
            boundary: 'unsupported hero move: floor object pile',
            screensEmitted: 26,
            recordedSteps: 409,
            behaviors: [
                { member: 'unsupported hero move: floor object pile', at: 26 },
            ],
        },
        // A command two sessions need but only this one stops on: its ceiling
        // of 21 is a fraction of the 62 screens that depend on it.
        {
            file: 'b',
            boundary: "the extended command 'pray' is not ported",
            screensEmitted: 46,
            recordedSteps: 67,
            behaviors: [{ member: '#pray', at: 46 }],
        },
        // A finished session contributes no ceiling to either column.
        {
            file: 'c',
            boundary: null,
            screensEmitted: 23,
            recordedSteps: 23,
            behaviors: [],
        },
    ];
    const ranking = [
        { member: 'unsupported hero move: floor object pile', supports: 383 },
        { member: '#pray', supports: 62 },
    ];
    const { same, differs } = ceilingAgainstSupports(rows, ranking);
    assert.deepEqual(same, [{
        member: 'unsupported hero move: floor object pile',
        ceiling: 383,
        supports: 383,
    }]);
    assert.deepEqual(differs, [{ member: '#pray', ceiling: 21, supports: 62 }]);
});

// silentDivergence() compares the replayed slice of a session against its
// recording through scripts/diff-fresh.mjs compareSessionOutputs(). A case
// needs one normalized segment and the port-side streams. Screens are plain
// strings, which frozen/screen-decode.mjs pads to the 24x80 cell grid, so
// two strings differing in one character differ in exactly one cell. Seed 1
// and the datetime are arbitrary: normalizeSession() requires the fields and
// the comparison never reads them.
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

test('rankCandidates zeroes unlocks for a session that diverges before its boundary', () => {
    const rows = [
        {
            // Session diverges at screen 42 and RNG at step 30; its boundary
            // behavior sits at step 137. The 63 screens between step 137 and
            // recordedSteps 200 cannot match because the output already differs
            // at step 30 (earliest of screen 42 and RNG step 30).
            file: 'divergent.session.json',
            recordedSteps: 200,
            behaviors: [{ member: 'puton', at: 137 }],
            divergence: {
                screen: { index: 42 },
                rng: { index: 2700, stepIndex: 30, cCaller: 'rndmonst_adj(makemon.c:1716)' },
                cursor: null,
            },
        },
        {
            // Clean session with no divergence — contributes 100 - 50 = 50
            // screens to unlocks.
            file: 'clean.session.json',
            recordedSteps: 100,
            behaviors: [{ member: 'puton', at: 50 }],
            divergence: null,
        },
    ];
    const [entry] = rankCandidates(rows);
    assert.equal(entry.member, 'puton');
    // Only the clean session's 50 screens count; the divergent session's 63
    // are zeroed because its output diverges before the boundary.
    assert.equal(entry.unlocks, 50);
    assert.equal(entry.unlocksSessions, 2);
    assert.equal(entry.divergentSessions.length, 1);
    assert.deepEqual(entry.divergentSessions[0], {
        file: 'divergent.session.json',
        behaviorAt: 137,
        screenDivergenceAt: 42,
        rngDivergenceAt: 30,
        rngCaller: 'rndmonst_adj(makemon.c:1716)',
        serializeBug: false,
        relation: 'before',
    });
});

test('rankCandidates marks relation as at when divergence equals the boundary', () => {
    const rows = [
        {
            // Divergence at screen 42 and behavior at step 42: the divergence
            // might be caused by the boundary itself, so the selector must
            // investigate rather than discount.
            file: 'at-boundary.session.json',
            recordedSteps: 200,
            behaviors: [{ member: 'levelgen', at: 42 }],
            divergence: {
                screen: { index: 42 },
                rng: null,
                cursor: null,
            },
        },
    ];
    const [entry] = rankCandidates(rows);
    // AT divergences keep their unlocks contribution because the boundary
    // itself may be the cause; only BEFORE divergences are zeroed.
    assert.equal(entry.unlocks, 200 - 42);
    assert.equal(entry.divergentSessions[0].relation, 'at');
    assert.equal(entry.divergentSessions[0].rngDivergenceAt, null);
    assert.equal(entry.divergentSessions[0].rngCaller, null);
    assert.equal(entry.divergentSessions[0].serializeBug, false);
});

test('rankCandidates omits divergentSessions when divergence is after the boundary', () => {
    const rows = [
        {
            // Divergence at screen 95 but behavior at step 50 — the session is
            // clean up to and past the boundary, so the unlocks figure is sound.
            file: 'late-divergence.session.json',
            recordedSteps: 200,
            behaviors: [{ member: 'eat', at: 50 }],
            divergence: {
                screen: { index: 95 },
                rng: null,
                cursor: null,
            },
        },
    ];
    const [entry] = rankCandidates(rows);
    assert.equal(entry.member, 'eat');
    assert.equal(entry.divergentSessions, undefined);
});

test('rankCandidates preserves backward compatibility for clean rows', () => {
    // Existing test rows carry no divergence property; verify that adding the
    // annotation logic did not change the shape for clean entries.
    const rows = [
        { file: 'a', recordedSteps: 100, behaviors: [{ member: 'eat', at: 40 }] },
    ];
    const [entry] = rankCandidates(rows);
    assert.equal(entry.divergentSessions, undefined);
    assert.deepEqual(entry, {
        member: 'eat', supports: 60, supportsSessions: 1,
        unlocks: 60, unlocksSessions: 1,
    });
});

// divergenceCandidates: surfaces each divergent session as a candidate to fix,
// priced by the screens emitted past the divergence point.

test('divergenceCandidates returns blocked screen counts for divergent sessions', () => {
    const rows = [
        {
            // RNG diverges at step 30 (screen at 42): the RNG desync is the root
            // cause, so this produces an rng-fix candidate from step 30.
            file: 'divergent.session.json',
            screensEmitted: 137,
            divergence: {
                screen: { index: 42 },
                rng: { index: 2700, stepIndex: 30, cCaller: 'rndmonst_adj(makemon.c:1716)' },
                cursor: null,
            },
        },
        {
            // No divergence — excluded.
            file: 'clean.session.json',
            screensEmitted: 100,
            divergence: null,
        },
        {
            // RNG-only divergence (no screen mismatch): still produces an
            // rng-fix candidate because RNG desync cascades.
            file: 'rng-only.session.json',
            screensEmitted: 80,
            divergence: {
                screen: null,
                rng: { index: 500, stepIndex: 40, cCaller: 'some_func()' },
                cursor: null,
            },
        },
        {
            // Serialize-bug-only screen divergence: excluded from candidates,
            // listed in serializeBugSessions instead.
            file: 'serialize-bug.session.json',
            screensEmitted: 50,
            divergence: {
                screen: { index: 20 },
                rng: null,
                cursor: null,
                serializeBug: true,
            },
        },
    ];
    const { candidates, serializeBugSessions } = divergenceCandidates(rows);
    assert.equal(candidates.length, 2);
    assert.deepEqual(candidates[0], {
        file: 'divergent.session.json',
        type: 'rng-fix',
        screensEmitted: 137,
        divergenceAt: 30,
        rngCaller: 'rndmonst_adj(makemon.c:1716)',
        blocked: 107,
    });
    assert.deepEqual(candidates[1], {
        file: 'rng-only.session.json',
        type: 'rng-fix',
        screensEmitted: 80,
        divergenceAt: 40,
        rngCaller: 'some_func()',
        blocked: 40,
    });
    assert.deepEqual(serializeBugSessions, ['serialize-bug.session.json']);
});

// divergenceStretches: the look-ahead read for divergence candidates, parallel
// to aheadStretches for boundary candidates. Tests verify the metadata fields
// only; messages require session files on disk, matching how aheadStretch tests
// verify from/to/member without testing message content.

test('divergenceStretches returns metadata for divergent sessions', () => {
    const rows = [
        {
            // RNG diverges at step 30 (cumulative), screen at 42: the stretch
            // starts from the RNG step (earlier), covering steps 30..137.
            file: 'seed0383-wizard-hallucinate.session.json',
            screensEmitted: 137,
            divergence: {
                screen: { index: 42 },
                rng: { index: 2700, stepIndex: 30, cCaller: 'rndmonst_adj(makemon.c:1716)' },
                cursor: null,
            },
        },
        {
            // No divergence — must not appear in the output.
            file: 'clean.session.json',
            screensEmitted: 100,
            divergence: null,
        },
    ];
    const stretches = divergenceStretches(rows.slice(0, 1));
    assert.equal(stretches.length, 1);
    assert.equal(stretches[0].file, 'seed0383-wizard-hallucinate.session.json');
    assert.equal(stretches[0].type, 'rng-fix');
    assert.equal(stretches[0].from, 30);
    assert.equal(stretches[0].to, 137);
    assert.equal(stretches[0].blocked, 107);
    assert.equal(stretches[0].rngCaller, 'rndmonst_adj(makemon.c:1716)');
    assert.ok(Array.isArray(stretches[0].messages));
});

test('divergenceStretches includes RNG-only divergences', () => {
    // RNG-only divergences now produce stretches (the RNG desync cascades
    // to all downstream screens). The stretch starts from rng.stepIndex.
    const rows = [
        {
            file: 'seed0030-ten-diverse-deaths.session.json',
            screensEmitted: 45,
            divergence: {
                screen: null,
                rng: { index: 10701, stepIndex: 36, cCaller: 'm_move(monmove.c:1963)' },
                cursor: null,
            },
        },
    ];
    const stretches = divergenceStretches(rows);
    assert.equal(stretches.length, 1);
    assert.equal(stretches[0].type, 'rng-fix');
    assert.equal(stretches[0].from, 36);
    assert.equal(stretches[0].blocked, 9);
});

test('divergenceStretches omits serialize-bug-only and clean sessions', () => {
    const rows = [
        {
            file: 'serialize-bug.session.json',
            screensEmitted: 50,
            divergence: {
                screen: { index: 20 },
                rng: null,
                cursor: null,
                serializeBug: true,
            },
        },
        {
            file: 'clean.session.json',
            screensEmitted: 50,
            divergence: null,
        },
    ];
    assert.deepEqual(divergenceStretches(rows), []);
});

// isSerializeBugMismatch: detect the frozen/terminal.js serialize() bug where
// attributes are dropped from leading spaces (issue #18).

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
