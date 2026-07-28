import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEVELOPMENT_DIR,
    censusBy,
    ceilingFor,
    main,
    recordedTopLine,
    stopStepIndex,
} from './scan-stops.mjs';

test('the scan is pinned to the development set', () => {
    // AGENTS.md permits only score-holdout.mjs to touch sessions/holdout/.
    // This scan reads session contents, so its directory must be fixed rather
    // than supplied by a caller.
    assert.ok(DEVELOPMENT_DIR.endsWith('/sessions'));
    assert.ok(!DEVELOPMENT_DIR.includes('holdout'));
});

test('main rejects every argument except --json', async () => {
    // A path argument is the way this scan could be aimed at the holdout, so
    // it must be refused before any session is opened.
    await assert.rejects(
        () => main(['sessions/holdout']),
        /only --json is accepted/,
    );
    await assert.rejects(
        () => main(['--json', '--sessions=/tmp/elsewhere']),
        /only --json is accepted/,
    );
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
