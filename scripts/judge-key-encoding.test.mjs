// The judge's held-out sessions were recorded with one byte per key and one
// input boundary per key. On 12 November 2026 the port replayed a key at or
// above U+0080 as its UTF-8 bytes instead (d6d7de842), and the judge's score
// fell by 55 screens (davidbau/teleport-contest#23). These checks fail if the
// judge's runner, the port's replay or scripts/record-session.mjs stops
// using one byte per moves character, or if a committed recipe or recording
// holds a key that one byte cannot carry.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
    assert.match(RECORDER, /expectedSteps = moves\.length \+ 1;/u);
});

test('every write to the game sends keyByte() output', () => {
    // Matching one keyByte() write would still pass if a second write sent a
    // key some other way, such as Buffer.from(k, 'utf8'), which is how
    // d6d7de842 sent UTF-8. So every write() call in the recorder is listed
    // here. recordSegment() has two: the controller's key and the replayed
    // key. A new write site changes the count and fails until it is checked
    // and the count updated.
    const writes = RECORDER.match(/\bwrite\s*\([^;]*/gu) ?? [];
    assert.deepEqual(writes, [
        'write(keyByte(k))',
        'write(keyByte(k))',
    ]);
    assert.equal(RECORDER.match(/child\.stdin\.write\(keyByte\(k\)\);/gu)?.length, 2);
    // end(data) writes data before closing, so every end() closes only.
    for (const end of RECORDER.match(/\bend\s*\([^)]*\)/gu) ?? [])
        assert.equal(end, 'end()');
});

// Every "moves" string in the committed JSON under `roots`, read from the raw
// bytes. The files total about 1.1 GB, mostly recordings. Parsing each with
// JSON.parse() took about two minutes on 12 November 2026; searching the
// Buffers took about 7 s with the files cached. Two committed recipes hold
// raw control characters in moves, which JSON.parse() rejects, so those are
// escaped before the literal is decoded.
function committedMoves(roots) {
    const root = new URL('..', import.meta.url);
    const files = execFileSync('git', ['ls-files', '-z', '--', ...roots], {
        cwd: root, encoding: 'utf8', maxBuffer: 1 << 28,
    }).split('\0').filter((file) => file.endsWith('.json'));
    const KEY = Buffer.from('"moves"');
    const space = (byte) => byte === 0x20 || byte === 0x09
        || byte === 0x0a || byte === 0x0d;
    const found = [];
    for (const file of files) {
        const buf = readFileSync(new URL(file, root));
        for (let at = buf.indexOf(KEY); at !== -1; at = buf.indexOf(KEY, at + 1)) {
            // A quote inside a JSON string is escaped, so an unescaped
            // "moves" followed by a colon is a key.
            let i = at + KEY.length;
            while (space(buf[i])) i++;
            if (buf[i] !== 0x3a) continue;
            i++;
            while (space(buf[i])) i++;
            if (buf[i] !== 0x22) continue;
            let j = i + 1;
            while (j < buf.length && buf[j] !== 0x22) j += buf[j] === 0x5c ? 2 : 1;
            const literal = buf.toString('utf8', i, j + 1).replace(/[\u0000-\u001f]/gu,
                (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
            found.push({ file, moves: JSON.parse(literal) });
        }
    }
    return found;
}

test('every committed recipe and recording has keys the recorder can send', () => {
    // A key above U+00FF has no byte the judge's recorder is known to have
    // sent, and keyByte() refuses it. These roots hold every recipe and
    // recording: the fixed workload (sessions/, sessions/holdout/), the
    // regression corpus and the synthetic cases.
    const roots = ['recipes', 'recordings', 'sessions', 'challenges'];
    const found = committedMoves(roots);
    for (const root of roots) {
        assert.ok(found.some(({ file }) => file.startsWith(`${root}/`)),
            `${root}/ supplies moves`);
    }
    const refused = [];
    for (const { file, moves } of found) {
        // The recorder writes moves[i], one UTF-16 code unit, per key.
        for (let i = 0; i < moves.length; i++) {
            try {
                recorder.keyByte(moves[i]);
            } catch (error) {
                refused.push(`${file} moves[${i}]: ${error.message}`);
            }
        }
    }
    assert.deepEqual(refused, []);
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
