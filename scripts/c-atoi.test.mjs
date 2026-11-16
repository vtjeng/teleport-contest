// Enforces the C atoi() rule: every C atoi() call is ported as js/hacklib.js
// atoi(), which saturates to a 64-bit long and keeps the low 32 bits, as the
// recorder's glibc does. Number.parseInt() keeps the whole value, so a count
// such as "4294967298" became 4294967298 where C reads 2. The review that
// added this check found four such sites (read.js create_particular_parse,
// objnam_readobjnam.js scanCount, sit.js's throne-effect answer and
// options.js's boolean, color-index and versinfo values) and four private
// copies of the correct conversion (teleport.js, version.js, options.js,
// wizcmds.js); all now call hacklib.js atoi().

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { atoi } from '../js/hacklib.js';
import { scanCount } from '../js/objnam_readobjnam.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function jsSources() {
    return readdirSync(join(ROOT, 'js')).filter((name) => name.endsWith('.js'))
        .sort().map((name) => [name, readFileSync(join(ROOT, 'js', name), 'utf8')]);
}

// Code lines only: a comment may name parseInt() or atoi().
function codeLines(source) {
    return source.split('\n').filter((line) => !/^\s*(\/\/|\*)/u.test(line));
}

test('only js/hacklib.js defines an atoi()', () => {
    const definers = [];
    for (const [name, source] of jsSources()) {
        if (codeLines(source).some((line) =>
            /function\s+(c[A-Z]?)?atoi\s*\(|function\s+cAtoi\s*\(/iu.test(line)))
            definers.push(name);
    }
    assert.deepEqual(definers, ['hacklib.js']);
});

test('parseInt() appears only where C does not call atoi()', () => {
    // Each file's count is pinned so that a new parseInt() fails here. The
    // count must change only when a site is removed or a new exception is
    // justified below.
    //   minion.js 1: bribe() reads sscanf("%ld"), a long, not atoi().
    //   options.js 5: is_ltgt_percentnumber() (botl.c s_to_anything() reads
    //     the field as int or long by its type); four txt2key() escapes read
    //     at most three digits, so no value can overflow.
    //   glyphs.js 1, rumors.js 2, sounds.js 4, topten.js 13: C sscanf() on
    //     hex glyph text, the rumor/oracle file header, SOUND mappings and
    //     the record file, not atoi().
    const counts = {};
    for (const [name, source] of jsSources()) {
        const count = codeLines(source).join('\n').match(/parseInt\(/gu)?.length ?? 0;
        if (count) counts[name] = count;
    }
    assert.deepEqual(counts, {
        'glyphs.js': 1,
        'minion.js': 1,
        'options.js': 5,
        'rumors.js': 2,
        'sounds.js': 4,
        'topten.js': 13,
    });
});

test('atoi() keeps C\'s low 32 bits after long saturation', () => {
    // Each input is the decimal text one of the call sites can receive; the
    // expected values are what glibc atoi() returns on the LP64 recorder.
    const cases = [
        ['4294967298 newts', 2], // 2^32 + 2: create_particular count wraps to 2
        ['2147483648', -2147483648], // 2^31: the sign bit
        ['  -7', -7], // leading space and sign
        ['99999999999999999999', -1], // saturates to LONG_MAX, low 32 bits all ones
        ['-99999999999999999999', 0], // saturates to LONG_MIN, low 32 bits zero
        ['x5', 0], // no leading digits
    ];
    for (const [text, expected] of cases)
        assert.equal(atoi(text), expected, text);
});

test('a wished count past 2^31 reads as C\'s int', () => {
    // objnam.c 3983 atoi(d->bp): "4294967298 arrows" asks for 2 arrows, and
    // the digit loop still stops after the ten digits.
    assert.deepEqual(scanCount('4294967298 arrows', 0), { value: 2, end: 10 });
});
