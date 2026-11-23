// C's `boolean` is `schar` (include/global.h:83), so a wider value stored in
// one keeps its low byte alone. js/global.js schar() reproduces that at each
// site where C narrows a value that is not already 0 or 1.
//
// The sites come from compiling every file under the recorder tree's src/
// with `clang -fsyntax-only -Wimplicit-int-conversion` and reading each of the
// 83 conversions to `boolean` it reports. Three have a source that can hold
// a value whose low byte is zero while the value is not:
// - detect.c:1430 do_mapping() and detect.c:1504 do_vicinity_map() pass
//   Confusion, the long HConfusion, to show_map_spot()'s `boolean cnf`
//   (recipes/detect.c/do-mapping-confusion-timeout-*, do-vicinity-map-*);
// - apply.c:3571 use_cream_pie() initialises `boolean wascreamed` from the
//   unsigned u.ucreamed.
//
// This check fails when one of those sites stops calling schar(), and when
// the number of schar() calls in js/ changes: add the C site above with the
// new call, or remove its entry with the call.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { schar } from '../js/global.js';

const JS_DIR = new URL('../js/', import.meta.url);

// 'file': the text of each schar() call the file must contain.
const SITES = {
    'detect.js': [
        // do_mapping()
        'const confused = schar(Confusion(state.u));',
        // do_vicinity_map()
        'schar(Confusion(state.u)),',
    ],
    'apply.js': [
        // use_cream_pie()
        'const wascreamed = schar(state.u.ucreamed);',
    ],
};

test('schar() keeps the low byte, sign-extended', () => {
    // A value that fits is unchanged.
    assert.equal(schar(0), 0);
    assert.equal(schar(1), 1);
    assert.equal(schar(127), 127); // SCHAR_MAX
    assert.equal(schar(-1), -1);
    // 128 (0x80) and 384 (0x180) read back as -128: negative, still true.
    assert.equal(schar(128), -128);
    assert.equal(schar(384), -128);
    assert.equal(schar(255), -1);
    // A zero low byte reads as false: the timeouts 256, 512 and 768.
    assert.equal(schar(256), 0);
    assert.equal(schar(512), 0);
    assert.equal(schar(768), 0);
    // 257 (0x101) keeps its 1.
    assert.equal(schar(257), 1);
    // prop.h FROMEXPER (0x01000000) alone has a zero low byte too.
    assert.equal(schar(0x01000000), 0);
    // A long above 32 bits narrows by its low byte as well.
    assert.equal(schar(2 ** 40 + 5), 5);
    // The port's true and false stand for C's 1 and 0.
    assert.equal(schar(true), 1);
    assert.equal(schar(false), 0);
});

test('each C narrowing site calls schar()', () => {
    for (const [name, calls] of Object.entries(SITES)) {
        const text = readFileSync(new URL(name, JS_DIR), 'utf8');
        for (const call of calls) {
            assert.ok(text.includes(call), `${name} lost \`${call}\``);
        }
    }
});

test('the schar() call count matches the listed sites', () => {
    let count = 0;
    for (const name of readdirSync(JS_DIR)) {
        if (!name.endsWith('.js') || name === 'global.js') continue;
        const text = readFileSync(new URL(name, JS_DIR), 'utf8');
        count += text.match(/(?<![\w.])schar\(/gu)?.length ?? 0;
    }
    // Three: the calls in SITES.
    assert.equal(count, Object.values(SITES).flat().length);
});
