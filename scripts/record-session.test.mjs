import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    installDirTooLong,
    NETHACKDIR_MAX_LENGTH,
    successfulTerminalExit,
    terminalInputKey,
} from './record-session.mjs';

test('the NETHACKDIR limit is BUFSZ / 2 from the C source', () => {
    // options.c nh_getenv() keeps a value only while strlen(value) <= BUFSZ / 2,
    // so the limit the recorder script stages around must track global.h.
    const globalHeader = readFileSync('nethack-c/upstream/include/global.h', 'utf8');
    const bufsz = Number(globalHeader.match(/^#define BUFSZ (\d+)/mu)[1]);
    assert.equal(NETHACKDIR_MAX_LENGTH, bufsz / 2);
    const optionsSource = readFileSync('nethack-c/upstream/src/options.c', 'utf8');
    assert.match(optionsSource, /strlen\(getev\) <= \(BUFSZ \/ 2\)/u);
});

test('installDirTooLong flags only paths nh_getenv() would discard', () => {
    // 128 characters is the last length nh_getenv() accepts; 129 is the first
    // it discards. The main checkout's install path is 95 characters and a
    // .claude/worktrees/<name>/ path is about 130.
    assert.equal(installDirTooLong('/'.padEnd(128, 'a')), false);
    assert.equal(installDirTooLong('/'.padEnd(129, 'a')), true);
    assert.equal(installDirTooLong(
        '/home/vtjeng/development/vtjeng/teleport-contest/nethack-c/recorder/install/games/lib/nethackdir',
    ), false);
    assert.equal(installDirTooLong(
        '/home/vtjeng/development/vtjeng/teleport-contest/.claude/worktrees/recorder-wizards/nethack-c/recorder/install/games/lib/nethackdir',
    ), true);
});

test('terminal-input intent names exactly the recipe final key', () => {
    assert.equal(terminalInputKey({ moves: '#save\ny', terminalInputKey: 'y' }), 'y');
    assert.equal(terminalInputKey({ moves: '#save\ny' }), null);
    assert.throws(
        () => terminalInputKey({ moves: '#save\ny', terminalInputKey: 'n' }),
        /must match the segment final input key/u,
    );
    assert.throws(
        () => terminalInputKey({ moves: '#save\ny', terminalInputKey: 'yes' }),
        /must match the segment final input key/u,
    );
});

test('explicit terminal input accepts only successful natural process closure with real boundaries', () => {
    const expected = {
        exitCode: 0,
        signal: null,
        terminalKey: 'y',
        moves: '#save\ny',
        nextKeyIndex: 7,
        stepCount: 8,
        expectedSteps: 8,
    };
    assert.equal(successfulTerminalExit(expected), true);
    assert.equal(successfulTerminalExit({
        ...expected,
        stepCount: 7,
    }), true);

    for (const invalid of [
        { terminalKey: null },
        { exitCode: 1 },
        { exitCode: null, signal: 'SIGTERM' },
        { nextKeyIndex: 6 },
        { moves: '#save\nn' },
        { stepCount: 0 },
        { stepCount: 6 },
    ]) {
        assert.equal(successfulTerminalExit({ ...expected, ...invalid }), false);
    }
});
