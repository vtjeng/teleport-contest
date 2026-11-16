// A tty menu count is C's long (wintty.c process_menu_window() builds it
// with AppendLongDigit()). js/tty_menu.js returns it as a Number while it is
// a safe integer and as an exact BigInt above Number.MAX_SAFE_INTEGER, so
// a reader of a menu item's count may compare it but must not pass it to a
// Number-only Math function. Math.max(0, count) threw for such a count in
// do.js menu_drop() and pickup.js menu_loot(); this check keeps that form
// out of js/.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_ROOT = fileURLToPath(new URL('../js/', import.meta.url));

// A Math call whose arguments, up to the first closing parenthesis, read a
// `.count` property.
const MATH_ON_COUNT = /Math\.\w+\([^()]*\.count\b/u;

export function mathOnCountLines(source) {
    return source.split('\n')
        .map((text, index) => ({ line: index + 1, text }))
        .filter(({ text }) => MATH_ON_COUNT.test(text))
        .map(({ line }) => line);
}

test('no js/ code applies a Math function to a menu count', () => {
    const findings = [];
    for (const name of readdirSync(JS_ROOT).filter((f) => f.endsWith('.js'))) {
        for (const line of mathOnCountLines(readFileSync(join(JS_ROOT, name), 'utf8')))
            findings.push(`js/${name}:${line}`);
    }
    assert.deepEqual(findings, []);
});

test('the scan finds the Math.max(0, choice.count) form it guards against', () => {
    // Line 1 is the form do.js and pickup.js used; line 2 is the fixed form.
    assert.deepEqual(mathOnCountLines([
        'count = Math.max(0, choice.count);',
        'count = choice.count > 0 ? choice.count : 0;',
        'const n = Math.min(item.count, obj.quan);',
    ].join('\n')), [1, 3]);
});

test('a count above 2^53 survives the comparison form exactly', () => {
    // 2^53 + 30: what a player types as 9007199254741022 in a tty menu.
    const count = 9007199254741022n;
    assert.equal(count > 0 ? count : 0, count);
    // The quantity tests that follow a menu count compare it with a Number.
    assert.equal(count > 21, true);
});
