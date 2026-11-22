// Pins windows.c encglyph(), decode_glyph() and decode_mixed() (1427-1511)
// and utf8map.c mixed_to_utf8() (83-140), which are pure: they read only the
// string, svc.context.rndencode and the symbol table. Every expectation
// below is read from that C source.
import assert from 'node:assert/strict';
import test from 'node:test';

import { cmap_to_glyph } from '../js/display.js';
import { parseNethackrc } from '../js/options.js';
import {
    initialize_symbols_from_options, S_engroom, S_throne,
} from '../js/symbols.js';
import { mixed_to_utf8 } from '../js/utf8map.js';
import { decode_glyph, decode_mixed, encglyph } from '../js/windows.js';

// 0x1A2B (6699) is a key moveloop_preamble()'s rnd(9000) can draw, with
// four significant hexadecimal digits so the key fills its field.
const KEY = 0x1A2B;

function keyed(rndencode = KEY) {
    return { context: { rndencode } };
}

// Shows each decoded glyph as <glyph@column>, so a case can check the glyph
// value decode_glyph() read and where decode_mixed() put it.
const tagGlyph = (glyph, column) => `<${glyph}@${column}>`;

test('encglyph() writes \\G, the key and the glyph as %04X', () => {
    // 0x2A (42) needs zero padding; C's %X prints upper case.
    assert.equal(encglyph(0x2A, keyed()), '\\G1A2B002A');
    assert.equal(encglyph(0xFAC, keyed(0x12)), '\\G00120FAC');
});

test('decode_glyph() reads at most four key and four glyph digits', () => {
    // A fifth glyph digit ('9') is left for decode_mixed() to copy.
    assert.deepEqual(decode_glyph('1A2B002A9', keyed()),
        { count: 8, glyph: 0x2A });
    // hexdd[] holds both cases, so lower-case digits decode too.
    assert.deepEqual(decode_glyph('1a2b002a', keyed()),
        { count: 8, glyph: 0x2A });
    // A wrong key makes the sequence a forgery: retval 0.
    assert.deepEqual(decode_glyph('0001002A', keyed()),
        { count: 0, glyph: undefined });
    // The key loop stops at a non-digit. With key 0x12, "12" matches after
    // two digits and the glyph loop stops at 'x' at once: glyph 0, retval 2.
    assert.deepEqual(decode_glyph('12x', keyed(0x12)), { count: 2, glyph: 0 });
    // With key 0, no digits at all match, but retval stays 0: a forgery.
    assert.deepEqual(decode_glyph('z', keyed(0)), { count: 0, glyph: 0 });
    // The C string ends at a NUL, which is not a digit even though
    // strchr(hexdd, '\0') would find hexdd's terminator.
    assert.deepEqual(decode_glyph('1A2B00\x002A', keyed()),
        { count: 6, glyph: 0 });
});

test('decode_mixed() drops a backslash before anything but G or a backslash', () => {
    const state = keyed();
    // pager.c do_screen_description() 1273 for a typed '\': "%c        ".
    assert.equal(decode_mixed('\\        an opulent throne', state),
        '        an opulent throne');
    // A backslash inside a name before an ordinary character vanishes.
    assert.equal(decode_mixed('called a\\b', state), 'called ab');
    // A doubled backslash becomes one, which is not rescanned.
    assert.equal(decode_mixed('a\\\\b', state), 'a\\b');
    assert.equal(decode_mixed('\\\\\\', state), '\\\\');
    // A backslash that ends the string is copied.
    assert.equal(decode_mixed('named x\\', state), 'named x\\');
    // C stops at a NUL; a null string decodes to "".
    assert.equal(decode_mixed('ab\0\\cd', state), 'ab');
    assert.equal(decode_mixed(null, state), '');
    assert.equal(decode_mixed('', state), '');
});

test('decode_mixed() replaces a keyed \\G sequence and keeps a forgery', () => {
    const state = keyed();
    // The glyph lands where the output has reached, here column 3.
    assert.equal(decode_mixed('at \\G1A2B002A!', state, tagGlyph),
        'at <42@3>!');
    // A wrong key leaves the sequence as typed, backslash included.
    assert.equal(decode_mixed('\\G0001002A', state, tagGlyph), '\\G0001002A');
    // "\G" with no digits is a forgery under key 0 as well.
    assert.equal(decode_mixed('\\Gz', keyed(0), tagGlyph), '\\Gz');
    // The short-key case above decodes glyph 0 and copies the 'x'.
    assert.equal(decode_mixed('\\G12x', keyed(0x12), tagGlyph), '<0@0>x');
    // A callback that returns null falls back to gs.showsyms[].
    const symbols = { ...keyed(), u: { uz: { dnum: 0, dlevel: 1 } } };
    initialize_symbols_from_options(parseNethackrc(''), symbols);
    const throne = cmap_to_glyph(S_throne, symbols);
    assert.equal(decode_mixed(encglyph(throne, symbols), symbols, () => null),
        '\\');
});

test('a decoded throne glyph keeps its backslash symbol', () => {
    // gs.showsyms[S_throne] is '\' by default. decode_mixed() writes it to
    // the output and never rescans it, so pager.c's farlook of a throne
    // shows "\        a throne" while a typed '\' loses its backslash.
    const state = { ...keyed(), u: { uz: { dnum: 0, dlevel: 1 } } };
    initialize_symbols_from_options(parseNethackrc(''), state);
    const throne = cmap_to_glyph(S_throne, state);
    assert.equal(decode_mixed(`${encglyph(throne, state)}        a throne`,
        state), '\\        a throne');
});

test('mixed_to_utf8() writes a glyph\'s utf8str bytes, else its showsyms byte', () => {
    // dat/symbols gives Enhanced1 `S_engroom: U+03BE`, whose UTF-8 form is
    // CE BE, and no entry for S_throne, which keeps its default '\'.
    const state = { ...keyed(), u: { uz: { dnum: 0, dlevel: 1 } } };
    initialize_symbols_from_options(
        parseNethackrc('OPTIONS=symset:Enhanced1\n'), state);
    const engraving = cmap_to_glyph(S_engroom, state);
    const throne = cmap_to_glyph(S_throne, state);
    // gm.u->utf8str is copied byte for byte (utf8map.c 105-111).
    assert.equal(mixed_to_utf8(`<${encglyph(engraving, state)}>`, state),
        '<\xCE\xBE>');
    // A glyph without gm.u takes gs.showsyms[] (112-116).
    assert.equal(mixed_to_utf8(`<${encglyph(throne, state)}>`, state), '<\\>');
    // The rest of the loop is decode_mixed()'s: a backslash before an
    // ordinary character is dropped and a forgery is kept.
    assert.equal(mixed_to_utf8('a\\b \\G0001002A', state), 'ab \\G0001002A');
    assert.equal(mixed_to_utf8(null, state), '');
    // Every write tests put < buf + bufsz - 1 with bufsz BUFSZ (256), so a
    // two-byte glyph that starts at byte 254 keeps only its first byte.
    const long = mixed_to_utf8(
        `${'x'.repeat(254)}${encglyph(engraving, state)}yz`, state);
    assert.equal(long.length, 255);
    assert.equal(long.slice(-2), 'x\xCE');
});
