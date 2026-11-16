// Enforces the C atoi() rule: every C atoi() call is ported as js/hacklib.js
// atoi(), which saturates to a 64-bit long and keeps the low 32 bits, as the
// recorder's glibc does. Number.parseInt() keeps the whole value, so a count
// such as "4294967298" became 4294967298 where C reads 2. The review that
// added this check found four such sites (read.js create_particular_parse,
// objnam_readobjnam.js scanCount, sit.js's throne-effect answer and
// options.js's boolean, color-index and versinfo values) and four private
// copies of the correct conversion (teleport.js, version.js, options.js,
// wizcmds.js); all now call hacklib.js atoi().
//
// glibc's sscanf() and fscanf() convert a %d field with the same strtol() and
// int store, and a %ld field with strtol() alone, so their ports call atoi()
// and atol() as well. A later review moved sounds.js add_sound_mapping(),
// topten.js readentry(), minion.js bribe() and files.js get_saved_games()
// off parseInt() and Number(), and folded four private saturating copies
// (coloratt.js colorAtoi(), display.js s_to_anything(), options.js atol() and
// wizcmds.js scanLevelArgument()) into hacklib.js.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { atoi, atol } from '../js/hacklib.js';
import { scanCount } from '../js/objnam_readobjnam.js';
import { add_sound_mapping } from '../js/sounds.js';
import { get_rnd_toptenentry } from '../js/topten.js';
import { InMemoryStorage } from '../js/storage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function jsSources() {
    return readdirSync(join(ROOT, 'js')).filter((name) => name.endsWith('.js'))
        .sort().map((name) => [name, readFileSync(join(ROOT, 'js', name), 'utf8')]);
}

// Code lines only: a comment may name parseInt() or atoi().
function codeLines(source) {
    return source.split('\n').filter((line) => !/^\s*(\/\/|\*)/u.test(line));
}

test('only js/hacklib.js defines an atoi() or atol()', () => {
    // Any function whose name ends in atoi or atol, such as the removed
    // coloratt.js colorAtoi().
    const definers = [];
    for (const [name, source] of jsSources()) {
        if (codeLines(source).some((line) =>
            /function\s+\w*ato[il]\s*\(/iu.test(line)))
            definers.push(name);
    }
    assert.deepEqual(definers, ['hacklib.js']);
});

test('only js/hacklib.js builds the long range strtol() saturates to', () => {
    // Each removed private conversion spelled LONG_MAX this way.
    const builders = [];
    for (const [name, source] of jsSources()) {
        if (/1n\s*<<\s*63n/u.test(codeLines(source).join('\n'))) builders.push(name);
    }
    assert.deepEqual(builders, ['hacklib.js']);
});

test('parseInt() appears only where C does not call atoi()', () => {
    // Each file's count is pinned so that a new parseInt() fails here. The
    // count must change only when a site is removed or a new exception is
    // justified below.
    //   options.js 5: is_ltgt_percentnumber() (its caller replaces the
    //     value with botl.c s_to_anything()'s atoi() or atol() result); four
    //     txt2key() escapes read at most three digits, so no value can
    //     overflow.
    //   glyphs.js 1: utf8map.c unicode_val() reads at most seven hex digits.
    //   rumors.js 2: rumors.c init_oracles() reads "%5d" and "%5lx"; a
    //     five-character field cannot overflow.
    const counts = {};
    for (const [name, source] of jsSources()) {
        const count = codeLines(source).join('\n').match(/parseInt\(/gu)?.length ?? 0;
        if (count) counts[name] = count;
    }
    assert.deepEqual(counts, {
        'glyphs.js': 1,
        'options.js': 5,
        'rumors.js': 2,
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

test('atol() saturates to C\'s signed 64-bit long', () => {
    // Expected values are glibc 2.39 atol() and sscanf("%ld") on x86_64,
    // printed by a C probe compiled on the recorder host.
    const cases = [
        ['4294967298', 4294967298n], // past int: a long keeps it whole
        ['9223372036854775807', 9223372036854775807n], // LONG_MAX itself
        ['9223372036854775808', 9223372036854775807n], // one past saturates
        ['-99999999999999999999', -9223372036854775808n], // saturates to LONG_MIN
        ['+12', 12n], // explicit plus sign
        ['-', 0n], // a sign with no digits converts nothing
    ];
    for (const [text, expected] of cases)
        assert.equal(atol(text), expected, text);
});

test('sscanf("%d") fields in SOUND mappings keep C\'s low 32 bits', () => {
    // sounds.c add_sound_mapping(): "%d %d" reads volume and idx. glibc
    // stores 4294967298 (2^32 + 2) as 2 and 4294967295 (2^32 - 1) as -1, so
    // the idx < 0 arm asks for a readable file; parseInt() kept 4294967295
    // and accepted the mapping without one.
    const state = {};
    const errors = [];
    const rawEnv = { rawPrint: (text) => errors.push(text), canReadFile: () => false };
    assert.equal(add_sound_mapping(
        'MESG "hello" "a.wav" 4294967298 4294967295', state, rawEnv), 0);
    assert.deepEqual(errors, ['cannot read ./a.wav']);
    // idx 4294967303 (2^32 + 7) is 7, so no file is needed.
    assert.equal(add_sound_mapping(
        'MESG "hello" "a.wav" 4294967298 4294967303', state, rawEnv), 1);
    assert.equal(state.soundmap.volume, 2);
    assert.equal(state.soundmap.idx, 7);
});

test('fscanf() record fields convert %d as int and %ld as long', () => {
    // topten.c readentry(): "%d.%d.%d %ld %d %d %d %d %d %d %ld %ld %d".
    // hp 4294967298 (2^32 + 2) reads as the int 2; points past LONG_MAX
    // saturate at LONG_MAX (the nearest double is 2^63); birthdate
    // 4294967298 is a long and stays whole.
    const mem = new InMemoryStorage();
    mem.setItem('vfs:record', '5.0.0 99999999999999999999 0 1 1 4294967298 4 0 '
        + '20260101 4294967298 501 Pri Hum Mal Law Alice,died\n');
    const entry = get_rnd_toptenentry({
        state: { mockStorage: mem, sysopt: { tt_oname_maxrank: 1 } },
        random: { rnd: () => 1 }, // the only rank the one-line file has
    });
    assert.equal(entry.hp, 2);
    assert.equal(entry.points, 2 ** 63);
    assert.equal(entry.birthdate, 4294967298);
});
