import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    installDirTooLong,
    NETHACKDIR_MAX_LENGTH,
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
