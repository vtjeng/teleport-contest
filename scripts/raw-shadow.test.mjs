// Recorder patch 006 writes tty_raw_print() output straight into its shadow
// screen, and its nomux_enter_raw_mode() first blanks that screen. C's window
// port never learns of either, so js/tty_rawprint.js records the cells it
// writes in the screen overlay (js/display.js recordRawShadowCells()), which
// keeps them until C would print over them. A raw-mode write made anywhere
// else would reach the terminal grid without that record, and the next map
// flush would repaint the cells C leaves blank or overwritten. This test
// fails when code outside nomux_enter_raw_mode() starts raw mode, when code
// outside js/tty_rawprint.js moves the raw cursor, or when tty_rawprint.js
// writes a terminal cell outside nomux_raw_write().

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const RAW_PRINT_FILE = 'tty_rawprint.js';

function jsFiles() {
    return readdirSync(JS_DIR).filter((name) => name.endsWith('.js'));
}

// The source of the top-level function `name` in `source`, from its
// declaration to the closing brace at column 0.
function functionBody(source, name) {
    const start = source.search(
        new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'mu'));
    assert.ok(start >= 0, `${RAW_PRINT_FILE} defines ${name}()`);
    const end = source.indexOf('\n}\n', start);
    return source.slice(start, end + 2);
}

// Assignments to the recorder's raw-mode fields, through the display's
// nomuxRaw object or the `raw` alias tty_rawprint.js gives it.
const RAW_FIELD_WRITE =
    /\b(?:nomuxRaw|raw)\??\.(?:active|row|col)\s*(?:=(?!=)|\+=|-=|\+\+|--)/gu;

test('only js/tty_rawprint.js moves the recorder raw cursor', () => {
    const offenders = [];
    for (const name of jsFiles()) {
        if (name === RAW_PRINT_FILE) continue;
        const source = readFileSync(join(JS_DIR, name), 'utf8');
        for (const match of source.matchAll(RAW_FIELD_WRITE))
            offenders.push(`${name}: ${match[0]}`);
    }
    assert.deepEqual(offenders, []);
});

test('raw mode starts only in nomux_enter_raw_mode()', () => {
    const source = readFileSync(join(JS_DIR, RAW_PRINT_FILE), 'utf8');
    const enter = functionBody(source, 'nomux_enter_raw_mode');
    assert.match(enter, /recordRawShadowCells\(/u);
    const outside = source.replace(enter, '');
    assert.deepEqual(
        [...outside.matchAll(/\.active\s*=(?!=)/gu)].map((m) => m[0]), []);
});

test('tty_rawprint.js writes terminal cells only in nomux_raw_write()', () => {
    const source = readFileSync(join(JS_DIR, RAW_PRINT_FILE), 'utf8');
    const write = functionBody(source, 'nomux_raw_write');
    assert.match(write, /recordRawShadowCells\(/u);
    const outside = source.replace(write, '');
    assert.deepEqual(
        [...outside.matchAll(/\.(?:setCell|putstr|putChar)\(/gu)]
            .map((m) => m[0]),
        []);
});
