// js/hacklib.js holds every text the game reads or builds as a byte string:
// one code unit per C char, from 0 to 0xFF. A nethackrc line, a getlin()
// answer and a data file's text become byte strings where they enter, so
// .length, indexing, slice() and comparison count and order C's bytes, and
// a ported site needs no conversion to match C. This check fails when a
// site brings decoded Unicode text back: a second UTF-8 decoder, a new
// encodeUtf8Text() caller, or a code point built from a byte.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
    bytesText, strcmpi, strncmpi, textBytes, truncateByteString, utf8Text,
} from '../js/hacklib.js';
import {
    recordedArgumentMisuses, resetArgumentMisuses, setArgumentMisuseRecording,
} from '../js/gstate.js';
import { parseNethackrc } from '../js/options.js';

// The scorer replaces these with its own copies (AGENTS.md, "Keep the game
// compatible with the scoring system"), so they are not the port's code.
const SCORER_FILES = new Set(['isaac64.js', 'storage.js', 'terminal.js']);

const sources = Object.fromEntries(readdirSync('js')
    .filter((file) => file.endsWith('.js') && !SCORER_FILES.has(file))
    .map((file) => [file, readFileSync(`js/${file}`, 'utf8')]));

// Each file's number of matches for `pattern`, leaving out files with none.
function countsMatching(pattern) {
    const counts = {};
    for (const file of Object.keys(sources).sort()) {
        const found = sources[file].match(pattern)?.length ?? 0;
        if (found) counts[file] = found;
    }
    return counts;
}

test('only hacklib.js encodes and only tty_rawprint.js decodes UTF-8', () => {
    assert.deepEqual(countsMatching(/new TextEncoder\b/gu), { 'hacklib.js': 1 });
    // nomux_raw_write() decodes the recorder's raw-print capture rows, which
    // the capture file holds as UTF-8; it writes screen cells, not text.
    assert.deepEqual(countsMatching(/new TextDecoder\b/gu), { 'tty_rawprint.js': 1 });
});

test('encodeUtf8Text() has only its three callers', () => {
    // hacklib.js: its definition, utf8Text() and textBytes()'s
    // recorded fallback for decoded text. options.js:
    // logicalConfigLines() reads the nethackrc as the recorder writes it.
    // wizcmds.js: wizcustom_callback() prints a glyph's UTF-8 bytes.
    assert.deepEqual(countsMatching(/\bencodeUtf8Text\(/gu), {
        'hacklib.js': 3, 'options.js': 1, 'wizcmds.js': 1,
    });
    assert.match(sources['options.js'], /const input = encodeUtf8Text\(rc\);/u);
});

test('no file builds a code point from a byte', () => {
    // The surrogate escapes (U+DC80-U+DCFF) that stood for undecodable
    // bytes before text was held as bytes.
    assert.deepEqual(countsMatching(/0xDC[0-9A-F]{2}\b|\\uDC[0-9A-F]{2}/giu), {});
    // glyphs.js unicodeCharacter() builds a G_ customization's display glyph
    // from its U+ value. hacklib.js textBytes() takes a decoded character
    // whole for its recorded fallback.
    assert.deepEqual(countsMatching(/\bfromCodePoint\(/gu), {
        'glyphs.js': 1, 'hacklib.js': 1,
    });
    // symbols.js names a UTF8 symbol set's glyph by its U+ value, and
    // wizcmds.js wizcustom_callback() prints it.
    assert.deepEqual(countsMatching(/\bcodePointAt\(/gu), {
        'hacklib.js': 1, 'symbols.js': 1, 'wizcmds.js': 1,
    });
});

test('a byte string holds one code unit per byte', () => {
    // 0xE9 alone (a typed Latin-1 key), then 0xC3 0xA9 (U+00E9 in UTF-8):
    // each byte stays one code unit, as each stays one C char.
    const text = bytesText([0x63, 0xE9, 0xC3, 0xA9]);
    assert.equal(text, 'c\u00E9\u00C3\u00A9');
    assert.equal(text.length, 4);
    assert.deepEqual(textBytes(text), [0x63, 0xE9, 0xC3, 0xA9]);
    // "%.2s" keeps the first two bytes.
    assert.equal(truncateByteString(text, 2), 'c\u00E9');
});

test('decoded text cannot reach a C byte operation', () => {
    // U+2502, a DECgraphics wall as the display shows it, has no byte value.
    // Tests and local replays throw on it.
    const previous = setArgumentMisuseRecording(false);
    try {
        assert.throws(() => textBytes('\u2502'), RangeError);
    } finally {
        setArgumentMisuseRecording(previous);
    }
    // A game the judge drives records it and goes on with its UTF-8 bytes,
    // E2 94 82; U+1F600, two code units, becomes its four bytes.
    setArgumentMisuseRecording(true);
    resetArgumentMisuses();
    try {
        assert.deepEqual(textBytes('a\u2502\u{1F600}'),
            [0x61, 0xE2, 0x94, 0x82, 0xF0, 0x9F, 0x98, 0x80]);
        assert.deepEqual(
            recordedArgumentMisuses().map(({ kind, count }) => [kind, count]),
            [['byteText', 1], ['byteText', 1]],
        );
    } finally {
        resetArgumentMisuses();
        setArgumentMisuseRecording(previous);
    }
    // 0x100 is the first value that is not a byte.
    assert.throws(() => bytesText([0x100]), RangeError);
    // utf8Text() writes the glyph as the UTF-8 bytes mixed_to_utf8() puts
    // in the text: E2 94 82.
    assert.equal(utf8Text('\u2502'), '\u00E2\u0094\u0082');
});

test('the nethackrc enters as the bytes the recorder writes', () => {
    // "Zo\u00EB" is Z, o and U+00EB, whose UTF-8 form is C3 AB: C's plname
    // holds four chars.
    const result = parseNethackrc('OPTIONS=name:Zo\u00EB\n');
    assert.equal(result.name, 'Zo\u00C3\u00AB');
    assert.equal(result.name.length, 4);
});

test('strncmpi() orders a high byte below ASCII, as a signed char', () => {
    // hacklib.c strncmpi() compares `char t1, t2`; 0xE9 is -23 there, so
    // "\xE9a" sorts before "b" (o_init.c discovered_cmp()).
    assert.equal(strcmpi('\u00E9a', 'b'), -1);
    assert.equal(strcmpi('b', '\u00E9a'), 1);
    // lowc() leaves the high byte alone, so 0xC9 and 0xE9 still differ, and
    // 0xC9 (-55) is below 0xE9 (-23).
    assert.equal(strncmpi('\u00C9', '\u00E9', 1), -1);
    // ASCII still folds case.
    assert.equal(strcmpi('ABC', 'abc'), 0);
});
