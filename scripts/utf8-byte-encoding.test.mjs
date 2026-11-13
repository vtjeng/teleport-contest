// The port holds a C byte string as decodeUtf8ByteString() of its bytes, so a
// typed byte that starts no UTF-8 sequence, such as the key 0xE9 that
// hooked_tty_getlin() stores, is the escape U+DCE9. encodeUtf8ByteString()
// gives that byte back; TextEncoder replaces the escape with U+FFFD's three
// bytes, which made "pommé" the fruit "pomm___" instead of "pomm_"
// (recordings/options.c/fruit-option-latin1-byte-sanitized.session.json).
// This check keeps every C byte count and byte copy on the escape-aware
// encoder. The one TextEncoder use left is encodeUtf8Text(), which reads the
// session's nethackrc as scripts/record-session.mjs writes it to disk.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { decodeUtf8ByteString, encodeUtf8ByteString } from '../js/hacklib.js';

// The scorer replaces these with its own copies (AGENTS.md, "Keep the game
// compatible with the scoring system"), so they are not the port's code.
const SCORER_FILES = new Set(['isaac64.js', 'storage.js', 'terminal.js']);

const sources = Object.fromEntries(readdirSync('js')
    .filter((file) => file.endsWith('.js') && !SCORER_FILES.has(file))
    .map((file) => [file, readFileSync(`js/${file}`, 'utf8')]));

function filesMatching(pattern) {
    return Object.keys(sources).filter((file) => pattern.test(sources[file])).sort();
}

test('only hacklib.js constructs a TextEncoder', () => {
    assert.deepEqual(filesMatching(/new TextEncoder\b/u), ['hacklib.js']);
});

test('only the nethackrc reader encodes with encodeUtf8Text()', () => {
    assert.deepEqual(filesMatching(/\bencodeUtf8Text\(/u), ['hacklib.js', 'options.js']);
    // options.js calls it once, in logicalConfigLines().
    assert.equal(sources['options.js'].match(/\bencodeUtf8Text\(/gu).length, 1);
    assert.match(sources['options.js'], /const input = encodeUtf8Text\(rc\);/u);
});

test('a typed byte outside any UTF-8 sequence stays one byte', () => {
    // 0xE9 alone, then 0xC3 0xA9, which is a sequence and decodes to U+00E9.
    const text = decodeUtf8ByteString([0x63, 0xE9, 0xC3, 0xA9]);
    assert.equal(text, 'c\uDCE9é');
    assert.deepEqual(encodeUtf8ByteString(text), [0x63, 0xE9, 0xC3, 0xA9]);
});
