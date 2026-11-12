// js/jsmain.js recordedInputBytes() must queue the bytes the recorded C game
// read. scripts/record-session.mjs writes moves[i], one UTF-16 code unit, as
// Buffer.from(k, 'utf8') at each input boundary, and the game reads one byte
// per boundary, so the reference is that encoding, unit by unit. The game
// reads every byte written, including those still in the pipe after the
// recorder's last kept boundary, recordedBoundaryLimit().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { recordedBoundaryLimit, recordedInputBytes } from '../js/jsmain.js';

const RECORDER = readFileSync(
    new URL('./record-session.mjs', import.meta.url), 'utf8',
);

// What the recorder sends for moves, as one byte stream: a carriage return
// becomes a newline, and every other unit goes through Node's UTF-8 encoder.
function recorderStream(moves) {
    const bytes = [];
    for (let i = 0; i < moves.length; i++) {
        const k = moves[i] === '\r' ? '\n' : moves[i];
        bytes.push(...Buffer.from(k, 'utf8'));
    }
    return bytes;
}

test('the recorder still writes one UTF-16 unit of moves as UTF-8 per boundary', () => {
    // If either changes, recordedInputBytes() and this file's reference must
    // change with it.
    assert.match(RECORDER, /let k = moves\[nextKeyIdx\+\+\];/u);
    assert.match(RECORDER, /if \(k === '\\r'\) k = '\\n';/u);
    assert.match(RECORDER, /child\.stdin\.write\(Buffer\.from\(k, 'utf8'\)\);/u);
    assert.match(RECORDER, /expectedSteps = moves\.length \+ 1;/u);
});

test('every code unit is queued as the recorder encodes it', () => {
    // The units cover each UTF-8 length boundary (7F/80, 7FF/800, FFFF), both
    // surrogate halves, which Node writes as U+FFFD, and the carriage return
    // the recorder turns into a newline. The two ASCII units after each show
    // that the stream continues past it unchanged.
    const units = [0x00, 0x0d, 0x1b, 0x7f, 0x80, 0xe9, 0xff, 0x7ff, 0x800,
        0x20ac, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfffd, 0xffff];
    for (const unit of units) {
        const moves = String.fromCharCode(unit) + 'ss';
        assert.deepEqual(recordedInputBytes(moves),
            recorderStream(moves), `U+${unit.toString(16)}`);
    }
    // Every unit at once, as one replay.
    const all = String.fromCharCode(...Array.from({ length: 0x10000 }, (_, i) => i));
    assert.deepEqual(recordedInputBytes(all), recorderStream(all));
});

test('the queue keeps the bytes read after the last kept boundary', () => {
    // '€' is three bytes, so "€ab" reaches the recorder's last kept boundary,
    // its fourth, after E2 82 AC; the game still reads 'a' and 'b', which the
    // recorder wrote at its second and third boundaries.
    assert.deepEqual(recordedInputBytes('€ab'), [0xe2, 0x82, 0xac, 0x61, 0x62]);
    assert.equal(recordedBoundaryLimit('€ab'), 4);
    // An astral character is two units, each written as EF BF BD.
    assert.deepEqual(recordedInputBytes('😀'),
        [0xef, 0xbf, 0xbd, 0xef, 0xbf, 0xbd]);
    assert.equal(recordedBoundaryLimit('😀'), 3);
    // ASCII is unchanged except for the carriage return.
    assert.deepEqual(recordedInputBytes('s\r.'), [0x73, 0x0a, 0x2e]);
    assert.deepEqual(recordedInputBytes(''), []);
    assert.equal(recordedBoundaryLimit(''), 1);
});
