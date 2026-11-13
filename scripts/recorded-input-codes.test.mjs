// js/jsmain.js recordedInputCodes() must queue the bytes the recorded C game
// read. scripts/record-session.mjs writes each moves character, one UTF-16
// code unit, as the single byte keyByte() returns, at one input boundary per
// key, the encoding of the judge's held-out sessions; frozen/
// playability_runner.mjs replays the same stream with moves.charCodeAt(i).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { recordedInputCodes } from '../js/jsmain.js';
import { keyByte } from './record-session.mjs';

const RECORDER = readFileSync(
    new URL('./record-session.mjs', import.meta.url), 'utf8',
);
const PLAYABILITY_RUNNER = readFileSync(
    new URL('../frozen/playability_runner.mjs', import.meta.url), 'utf8',
);

test('the recorder writes keyByte() of one unit per boundary', () => {
    // If any of these changes, recordedInputCodes() and the reference below
    // must change with it.
    assert.match(RECORDER, /let k = moves\[nextKeyIdx\+\+\];/u);
    assert.match(RECORDER, /if \(k === '\\r'\) k = '\\n';/u);
    assert.match(RECORDER, /child\.stdin\.write\(keyByte\(k\)\);/u);
    assert.match(RECORDER, /expectedSteps = moves\.length \+ 1;/u);
    // The judge's runner queues one code per UTF-16 unit.
    assert.match(PLAYABILITY_RUNNER,
        /display\.pushKey\(moves\.charCodeAt\(i\)\);/u);
});

test('every recordable unit is queued as the byte the recorder writes', () => {
    // 0x00..0xFF are every unit keyByte() accepts; the carriage return
    // (0x0D) is the one the recorder first turns into a newline.
    for (let unit = 0; unit <= 0xff; unit++) {
        const k = unit === 0x0d ? '\n' : String.fromCharCode(unit);
        assert.deepEqual(recordedInputCodes(String.fromCharCode(unit)),
            [...keyByte(k)], `U+${unit.toString(16)}`);
    }
    // 'é' (0xE9, M-i) then ';' is one code per key, so a later key keeps its
    // own boundary.
    assert.deepEqual(recordedInputCodes('é;'), [0xe9, 0x3b]);
    assert.deepEqual(recordedInputCodes(''), []);
});

test('the recorder refuses a key above U+00FF', () => {
    // U+0100 is the first unit past Latin-1, U+20AC ('€') a common one, and
    // U+D83D the first half of an astral character, which moves holds as two
    // units.
    for (const k of ['\u0100', '€', '\ud83d']) {
        assert.throws(() => keyByte(k), /above U\+00FF/u,
            `U+${k.charCodeAt(0).toString(16)}`);
    }
});
