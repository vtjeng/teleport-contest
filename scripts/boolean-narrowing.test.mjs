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
//   unsigned u.ucreamed
//   (recipes/apply.c/use-cream-pie-ucreamed-256-low-byte-zero).
//
// C also narrows an int to a variable or result declared schar; SITES lists
// those with their C lines.
//
// This check fails when one of those sites stops calling schar(), when the
// number of schar() calls in js/ changes (add the C site above with the new
// call, or remove its entry with the call), and when a file writes the
// conversion out by hand as `(x << 24) >> 24`.

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
    'sp_lev_object.js': [
        // sp_lev.c create_object():2231, `otmp->spe = (schar) o->spe`: not a
        // boolean, but the same narrowing of an int to schar.
        'obj.spe = schar(specification.spe);',
    ],
    'do_wear.js': [
        // attrib.h:39-41 struct attribs holds each ABON() as schar.
        // do_wear.c Helmet_on():458 and Helmet_off():538, cornuthaum:
        // `ABON(A_CHA) += (Role_if(PM_WIZARD) ? 1 : -1)` and its reverse.
        'abon[A_CHA] = schar((abon[A_CHA] ?? 0)\n            + (state.urole?.mnum === PM_WIZARD ? 1 : -1));',
        'abon[A_CHA] = schar((abon[A_CHA] ?? 0)\n                + (state.urole?.mnum === PM_WIZARD ? -1 : 1));',
        // do_wear.c adj_abon():3319, the parameter `schar delta`, and
        // 3324, 3331 and 3332, `ABON(...) += (delta)`.
        'delta = schar(delta);',
        'abon[A_DEX] = schar((abon[A_DEX] ?? 0) + delta);',
        'abon[A_INT] = schar((abon[A_INT] ?? 0) + delta);',
        'abon[A_WIS] = schar((abon[A_WIS] ?? 0) + delta);',
    ],
    'dungeon.js': [
        // dungeon.c depth():1430-1434 returns
        // `(schar) (depth_start + lev->dlevel - 1)`.
        'return schar(result);',
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
    // Eleven: the calls in SITES.
    assert.equal(count, Object.values(SITES).flat().length);
});

test('no file narrows to schar by hand', () => {
    // `(x << 24) >> 24` is schar() written out; js/global.js holds the two
    // functions that may spell it.
    const byHand = /<<\s*24\s*\)*\s*>>\s*24/u;
    const sites = [];
    for (const name of readdirSync(JS_DIR)) {
        if (!name.endsWith('.js') || name === 'global.js') continue;
        readFileSync(new URL(name, JS_DIR), 'utf8').split('\n').forEach((line, index) => {
            const code = line.replace(/\/\/.*$/u, '');
            if (byHand.test(code)) sites.push(`${name}:${index + 1} ${code.trim()}`);
        });
    }
    assert.deepEqual(sites, []);
    // The pattern finds the conversion as the port wrote it before.
    assert.ok(byHand.test('abon[A_DEX] = (((abon[A_DEX] ?? 0) + delta) << 24) >> 24;'));
    assert.ok(byHand.test('return (result << 24) >> 24;'));
});
