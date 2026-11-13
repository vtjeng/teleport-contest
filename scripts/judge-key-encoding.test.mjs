// The judge's held-out sessions were recorded with one byte per key and one
// input boundary per key. On 12 November 2026 the port replayed a key at or
// above U+0080 as its UTF-8 bytes instead (d6d7de842), and the judge's score
// fell by 55 screens (davidbau/teleport-contest#23). These checks fail if the
// judge's runner, the port's replay or scripts/record-session.mjs stops
// using one byte per moves character.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { GameDisplay } from '../js/game_display.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import * as recorder from './record-session.mjs';

const RECORDER = readFileSync(
    new URL('./record-session.mjs', import.meta.url), 'utf8',
);
const PLAYABILITY_RUNNER = readFileSync(
    new URL('../frozen/playability_runner.mjs', import.meta.url), 'utf8',
);

test('the judge\'s runner pushes moves.charCodeAt(i) once per character', () => {
    // If the judge changes its runner, the port's replay and the recorder
    // must change with it.
    assert.match(PLAYABILITY_RUNNER,
        /for \(let i = 0; i < moves\.length; i\+\+\) \{\s*display\.pushKey\(moves\.charCodeAt\(i\)\);\s*\}/u);
});

test('runSegment() feeds one input code per moves character', async () => {
    // 'é' (0xE9) is M-i, #invoke, whose prompt Escape cancels; 's' then
    // searches. Each key is read at its own input boundary. The seed, date
    // and character are arbitrary; pettype:none and the disabled startup
    // messages keep every key a command.
    const moves = 'é\x1bs';
    const pushed = [];
    const original = GameDisplay.prototype.pushKey;
    GameDisplay.prototype.pushKey = function pushKey(code) {
        pushed.push(code);
        return original.call(this, code);
    };
    let replay;
    try {
        replay = await runSegment({
            seed: 51729,
            datetime: '20240312101500',
            nethackrc: 'OPTIONS=name:Elio,role:Valkyrie,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,!tips,!autopickup,pettype:none\n',
            moves,
        });
    } finally {
        GameDisplay.prototype.pushKey = original;
    }
    assert.deepEqual(pushed, [...moves].map((ch) => ch.charCodeAt(0)));
    // The startup boundary, then one per key.
    assert.equal(replay.getScreens().length, moves.length + 1);
    assert.equal(replay.segmentError, null);
});

test('the recorder writes one byte for each key up to U+00FF', () => {
    assert.equal(typeof recorder.keyByte, 'function',
        'record-session.mjs exports keyByte()');
    // 0x00..0xFF are every unit the recorder accepts.
    for (let unit = 0; unit <= 0xff; unit++) {
        assert.deepEqual([...recorder.keyByte(String.fromCharCode(unit))],
            [unit], `U+${unit.toString(16)}`);
    }
    // The recorder sends that byte to the game, after turning a carriage
    // return into a newline as a pty would.
    assert.match(RECORDER, /let k = moves\[nextKeyIdx\+\+\];/u);
    assert.match(RECORDER, /if \(k === '\\r'\) k = '\\n';/u);
    assert.match(RECORDER, /child\.stdin\.write\(keyByte\(k\)\);/u);
    assert.match(RECORDER, /expectedSteps = moves\.length \+ 1;/u);
});

test('the recorder refuses a key above U+00FF before starting the game', async () => {
    // What the judge's recorder sent for such a key is unknown. U+20AC ('€')
    // follows an ordinary key, so the refusal covers every position; the
    // binary does not exist, so reaching the game would fail differently.
    const dir = await mkdtemp(path.join(os.tmpdir(), 'judge-key-encoding-'));
    try {
        await assert.rejects(recorder.recordSegment({
            seg: { seed: 1, datetime: '20240312101500', nethackrc: '', moves: 's€' },
            isFirstSegment: false,
            binary: path.join(dir, 'no-such-nethack'),
            installDir: dir,
            rngLogPath: path.join(dir, 'rng.log'),
            homeDir: path.join(dir, 'home'),
            tz: 'America/New_York',
        }), /above U\+00FF/u);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('recordedInputCodes() replays the byte keyByte() writes', async () => {
    const { recordedInputCodes } = await import('../js/jsmain.js');
    assert.equal(typeof recordedInputCodes, 'function',
        'js/jsmain.js exports recordedInputCodes()');
    // Every unit the recorder accepts; the carriage return (0x0D) is the one
    // it first turns into a newline.
    for (let unit = 0; unit <= 0xff; unit++) {
        const k = unit === 0x0d ? '\n' : String.fromCharCode(unit);
        assert.deepEqual(recordedInputCodes(String.fromCharCode(unit)),
            [...recorder.keyByte(k)], `U+${unit.toString(16)}`);
    }
});
