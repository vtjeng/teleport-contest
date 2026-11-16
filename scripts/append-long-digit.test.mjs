// Enforces the AppendLongDigit() rule: each C site that accumulates a typed
// count with integer.h AppendLongDigit() is ported with js/hacklib.js
// appendLongDigit(), which overflows where the recorder's 64-bit long does.
// topl.c tty_yn_function() was ported with Number.isSafeInteger() instead, so
// a count of 16 to 19 digits that C accepts was refused at 2^53
// (recordings/topl.c/yn-count-past-2-to-the-53).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { appendLongDigit } from '../js/hacklib.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// The C file of each AppendLongDigit() call and the JS file that ports it.
const SITES = {
    'nethack-c/upstream/src/cmd.c': 'js/cmd.js',
    'nethack-c/upstream/win/tty/topl.c': 'js/topl.js',
    'nethack-c/upstream/win/tty/wintty.c': 'js/tty_menu.js',
};

test('every C AppendLongDigit() call has an appendLongDigit() port', () => {
    // One call per C file; a new C site fails here until it is listed.
    for (const [cFile, jsFile] of Object.entries(SITES)) {
        const calls = read(cFile).match(/= AppendLongDigit\(/gu)?.length ?? 0;
        assert.equal(calls, 1, `${cFile} AppendLongDigit() calls`);
        assert.match(read(jsFile), /appendLongDigit\(/u, jsFile);
    }
});

test('appendLongDigit() overflows past LONG_MAX, not 2^53', () => {
    // 2^53 + 1 is exact in a long but not in a Number.
    assert.equal(appendLongDigit(900719925474099n, 3), 9007199254740993n);
    // LONG_MAX = 9223372036854775807 is the last value accepted; one more
    // digit at the boundary overflows to C's -1.
    assert.equal(appendLongDigit(922337203685477580n, 7), 9223372036854775807n);
    assert.equal(appendLongDigit(922337203685477580n, 8), -1n);
});
