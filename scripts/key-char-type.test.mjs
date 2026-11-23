// C's plain `char` is signed on both recorder hosts, so cmd.c
// readchar_core()'s `return (char) sym` (line 5271) hands every caller a
// negative value for a byte above 0x7F. The port holds a key, and any other
// text byte, as the byte itself, 0 to 255. The two agree wherever C compares
// the char with another char (gc.Cmd.spkeys[] and dirchars[] are char too),
// masks it, or tests it against both ends of an ASCII range, which covers
// every use the callers of readchar() make: get_count(), parse(), getdir(),
// getobj(), tty_yn_function() and getpos().
//
// They differ where C compares the char with an unsigned value, orders it,
// or does arithmetic on it. Each such site calls js/global.js signed_char();
// the port once wrote the conversion out by hand in six files. These tests
// pin those sites, fail on a conversion written out by hand, and pin every
// one-sided range test on a key with the reason it matches C.
//
// Two tests of a key against C's EOF (-1) compare the byte with 0xFF
// instead, which is the same test: CHAR_EOF in js/cmd.js readchar_core()
// and EOF_BYTE in js/getline.js hooked_tty_getlin().

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { signed_char } from '../js/global.js';
import { strncmpi } from '../js/hacklib.js';
import { rangeTests, scanRepository } from './key-char-range-tests.mjs';

const JS_DIR = new URL('../js/', import.meta.url);

// 'file': the text of each signed_char() call the file must contain.
const SITES = {
    'getpos.js': [
        // getpos.c gather_symbols(): `c == defsyms[sidx].sym`, an int
        // assigned from readchar_poskey()'s char against a uchar.
        'const c = signed_char(key);',
    ],
    'pager.js': [
        // pager.c do_look():1857, `sym = out_str[0]`, an int from a char.
        'const sym = signed_char(answerBytes[0]);',
    ],
    'options.js': [
        // options.c optfn_boulder():1199, `opts[0] < \' \'` on a char, in
        // the configuration-file parser and in the in-game handler.
        'const signedByte = signed_char(byte);',
        'const signedByte = signed_char(byte);',
    ],
    'hacklib.js': [
        // hacklib.c strncmpi(): `char t1, t2` ordered with `>`.
        'const t1 = signed_char(lowc(c1).charCodeAt(0));',
        'const t2 = signed_char(lowc(c2).charCodeAt(0));',
    ],
    'glyphs.js': [
        // glyphs.c glyph_hash():441-446, `hash ^= ch` with `char ch`,
        // which sign-extends a high byte across the 32-bit hash.
        'const ch = byte >= 65 && byte <= 90 ? byte + 32 : signed_char(byte);',
    ],
};

const jsSources = () => readdirSync(JS_DIR)
    .filter((name) => name.endsWith('.js')).sort()
    .map((name) => [name, readFileSync(new URL(name, JS_DIR), 'utf8')]);

test('signed_char() is the value of a C char holding the byte', () => {
    // An ASCII byte is unchanged.
    assert.equal(signed_char(0), 0);
    assert.equal(signed_char(0x41), 0x41); // 'A'
    assert.equal(signed_char(0x7F), 127); // CHAR_MAX
    // 0x80 is CHAR_MIN, 0xE9 (M-i) is -23 and 0xFF is -1, C's EOF.
    assert.equal(signed_char(0x80), -128);
    assert.equal(signed_char(0xE9), -23);
    assert.equal(signed_char(0xFF), -1);
    // An int that already holds a negative char keeps it.
    assert.equal(signed_char(-23), -23);
});

test('strncmpi() orders a high byte below ASCII, as C\'s signed char does', () => {
    // hacklib.c strncmpi() returns `(t1 > t2) ? 1 : -1`: 0xE9 is -23 as a
    // char, below 'a' (97), where the bytes compare the other way round.
    assert.equal(strncmpi('\xE9', 'a', 1), -1);
    assert.equal(strncmpi('a', '\xE9', 1), 1);
    assert.equal(strncmpi('\xE9', '\xE9', 1), 0);
});

test('each site where C\'s char sign matters calls signed_char()', () => {
    for (const [name, calls] of Object.entries(SITES)) {
        const text = readFileSync(new URL(name, JS_DIR), 'utf8');
        const counts = new Map();
        for (const call of calls) counts.set(call, (counts.get(call) ?? 0) + 1);
        for (const [call, count] of counts) {
            assert.equal(text.split(call).length - 1, count,
                `${name}: \`${call}\``);
        }
    }
});

test('the signed_char() call count matches the listed sites', () => {
    let count = 0;
    for (const [name, text] of jsSources()) {
        if (name === 'global.js') continue;
        count += text.match(/(?<![\w.])signed_char\(/gu)?.length ?? 0;
    }
    // Seven: the calls in SITES. Add a new site there with its C line.
    assert.equal(count, Object.values(SITES).flat().length);
});

test('no file narrows a byte to a signed char by hand', () => {
    // `byte >= 0x80 ? byte - 0x100 : byte` and `byte - 256` are
    // signed_char() written out.
    const byHand = /-\s*(?:0x100|256)\b/u;
    const sites = [];
    for (const [name, text] of jsSources()) {
        if (name === 'global.js' || name.endsWith('_data.js')) continue;
        text.split('\n').forEach((line, index) => {
            const code = line.replace(/\/\/.*$/u, '');
            if (byHand.test(code)) sites.push(`${name}:${index + 1} ${code.trim()}`);
        });
    }
    assert.deepEqual(sites, []);
});

// Every one-sided range test on a key or text byte that
// scripts/key-char-range-tests.mjs finds, as [file, function, test], grouped
// by why the byte gives C's answer.
const TRACED_RANGE_TESTS = [
    // C tests an unsigned value: `(uchar) c` or `(unsigned char) c`.
    // cmd.c key2txt() and hacklib.c visctrl():142, `(uchar) c & 0200`.
    ['command_bindings.js', 'visibleCommandKey', 'byte >= 0x80'],
    // getline.c hooked_tty_getlin():128, `' ' <= (unsigned char) c`.
    ['getline.js', 'hooked_tty_getlin', 'c >= 0x20'],

    // C masks the high bit off first.
    // bones.c sanitize_name(): `c = *namebuf & 0177`.
    ['bones.js', 'sanitize_name', 'c < 0x20'],
    // visctrl():146, after `c &= 0177`; visibleCommandKey() follows it.
    ['command_bindings.js', 'visibleCommandKey', 'byte < 0x20'],
    ['hacklib.js', 'visctrl', 'byte < 0o40'],

    // Both ends of an ASCII range are tested, in a form the scan does not
    // pair: `||` in stripdigits() (hacklib.c digit()), and a second bound
    // that is not a literal in optfn_boulder() (options.c:1197,
    // `opts[0] >= '1' && opts[0] < WARNCOUNT + '0'`).
    ['hacklib.js', 'stripdigits', "ch < '0'"],
    ['hacklib.js', 'stripdigits', "ch > '9'"],
    ['options.js', 'optfn_boulder', 'byte >= 0x31'],
    ['options.js', 'boulder', 'byte >= 0x31'],

    // The recorder's capture rule, which is these tests: patch 006
    // nomux_putch() ignores `ch < 32` for a signed char, so a high byte is
    // skipped too (js/termcap.js nomux_putch_byte()), and nomux_raw_putch()
    // takes an unsigned byte. g_putch() strips the high bit before storing.
    ['termcap.js', 'nomux_putch_byte', 'byte >= 0x20'],
    ['termcap.js', 'nomux_putch_byte', 'byte < 0x80'],
    ['tty_menu.js', 'writeStyledText', 'byte >= 0x80'],
    ['tty_rawprint.js', 'nomux_raw_write', 'byte >= 32'],

    // Not a key: a loop over all 256 key codes (cmd.c keylist_putcmds()),
    // a check that a list holds bytes, and a menu selection's return value.
    ['cmd.js', 'keylist_func_has_key', 'key < 256'],
    ['cmd.js', 'keylist_putcmds', 'key < 256'],
    ['hacklib.js', 'bytesText', 'byte < 0'],
    ['hacklib.js', 'bytesText', 'byte > 0xFF'],
    ['restore.js', 'restore_menu', 'ch > 0'],
    ['restore.js', 'restore_menu', 'ch < 0'],
    ['restore.js', 'restore_menu', 'ch > 0'],
];

test('every one-sided range test on a key is traced to C', () => {
    const key = ([file, fn, text]) => `${file} ${fn} ${text}`;
    const found = scanRepository().map(({ file, fn, test: text }) => key([file, fn, text]));
    // 20 tests. A new one needs its C line here, or signed_char() if C makes
    // the test on a char.
    assert.equal(TRACED_RANGE_TESTS.length, 20);
    assert.deepEqual(found.sort(), TRACED_RANGE_TESTS.map(key).sort());
});

test('the scan finds one-sided tests and passes two-sided ones', () => {
    const lines = (source) => rangeTests(source).map(({ line }) => line);
    assert.deepEqual(lines([
        'async function f(state) {',
        '    const pressed = await readchar(state);',
        '    if (pressed < 0x20) return 1;', // 3: a sourced variable
        '    if (pressed >= 0x30 && pressed <= 0x39) return 2;', // both ends
        "    if (pressed >= 'a'.charCodeAt(0)) return 3;", // 5: one end
        '    return other < 0x20;', // not a key
        '}',
        'function g(key, c, count) {',
        '    if (key > 0x7e) return 1;', // 9: a key by name
        "    if (c < ' ') return 2;", // 10: a key held as text
        '    if (0x20 <= key && key < 0x7f) return 3;', // both ends, mirrored
        '    if (key >= 0x20 && key <= 0xff) return 4;', // 12, 12: an end past 0x7F
        '    return count < 5;', // not a key
        '}',
    ].join('\n')), [3, 5, 9, 10, 12, 12]);
});
