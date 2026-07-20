import assert from 'node:assert/strict';
import test from 'node:test';

import { PATCHLEVEL, VERSION_MAJOR, VERSION_MINOR } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { isaac64_init, isaac64_next_uint64 } from '../js/isaac64.js';
import { runSegment } from '../js/jsmain.js';
import {
    d,
    enableRngLog,
    getRngLog,
    initRng,
    rn2,
    rn2_on_display_rng,
    rnd_on_display_rng,
    rnl,
} from '../js/rng.js';
import { vfsWriteFile } from '../js/storage.js';

function seedBytes(seed) {
    let remaining = BigInt(seed) & 0xFFFFFFFFFFFFFFFFn;
    const bytes = new Uint8Array(8);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number(remaining & 0xFFn);
        remaining >>= 8n;
    }
    return bytes;
}

function rawDraw(ctx, range) {
    return Number(isaac64_next_uint64(ctx) % BigInt(range));
}

test('core and display RNGs start from independent copies of the seed', () => {
    // The non-palindromic bytes catch accidental big-endian seed encoding.
    const seed = 0x0102030405060708n;
    const expectedCore = isaac64_init(seedBytes(seed));
    const expectedDisplay = isaac64_init(seedBytes(seed));

    resetGame();
    initRng(seed);
    enableRngLog();

    // 97 exercises a non-power-of-two modulus; 6 covers display rnd's +1.
    const coreFirst = rawDraw(expectedCore, 97);
    const displayFirst = rawDraw(expectedDisplay, 97);
    const coreSecond = rawDraw(expectedCore, 97);
    assert.equal(rn2(97), coreFirst);
    assert.equal(rn2_on_display_rng(97), displayFirst);
    assert.equal(rnd_on_display_rng(6), rawDraw(expectedDisplay, 6) + 1);
    assert.equal(rn2(97), coreSecond);

    assert.deepEqual(getRngLog(), [
        `rn2(97)=${coreFirst}`,
        `rn2(97)=${coreSecond}`,
    ]);
});

test('d uses raw core draws and logs one aggregate call', () => {
    // Three six-sided dice exercise repeated raw draws and the NdX base term.
    const seed = 0x8877665544332211n;
    const expectedCore = isaac64_init(seedBytes(seed));
    const expectedRoll = 3
        + rawDraw(expectedCore, 6)
        + rawDraw(expectedCore, 6)
        + rawDraw(expectedCore, 6);
    // A distinct prime modulus proves that d() left the core stream at the
    // draw immediately after its three raw die rolls.
    const expectedNext = rawDraw(expectedCore, 17);

    resetGame();
    initRng(seed);
    enableRngLog();

    assert.equal(d(3, 6), expectedRoll);
    assert.equal(rn2(17), expectedNext);
    assert.deepEqual(getRngLog(), [
        `d(3,6)=${expectedRoll}`,
        `rn2(17)=${expectedNext}`,
    ]);
});

test('rnl applies small-range Luck and logs its internal rn2 first', () => {
    // Luck -5 and range 10 exercise division rounded away from zero; NetHack
    // reduces -5 to an adjustment of -2 and uses rn2(39) for the luck check.
    const seed = 0x1020304050607080n;
    const expectedCore = isaac64_init(seedBytes(seed));
    const unadjusted = rawDraw(expectedCore, 10);
    const luckCheck = rawDraw(expectedCore, 39);
    const expected = luckCheck ? Math.min(unadjusted + 2, 9) : unadjusted;

    resetGame();
    game.u = { uluck: -5, moreluck: 0 };
    initRng(seed);
    enableRngLog();

    assert.equal(rnl(10), expected);
    assert.deepEqual(getRngLog(), [
        `rn2(39)=${luckCheck}`,
        `rnl(10)=${expected}`,
    ]);
});

test('runSegment preserves datetime and installs the supplied storage', async () => {
    const backing = new Map();
    const storage = {
        getItem(key) { return backing.has(key) ? backing.get(key) : null; },
        setItem(key, value) { backing.set(key, String(value)); },
        removeItem(key) { backing.delete(key); },
        get length() { return backing.size; },
        key(index) { return [...backing.keys()][index] ?? null; },
    };
    // Empty moves make the synthetic segment stop at its first input boundary.
    const datetime = '20401231235958';
    const nhGame = await runSegment({
        // The first six digits echo pi; the value is otherwise an arbitrary
        // seed independent of any development recording.
        seed: 314159,
        datetime,
        // False exercises fresh-recorder metadata plumbing independently of
        // the canonical official-session default.
        recorderIsDst: false,
        nethackrc: '',
        moves: '',
        storage,
    });

    assert.equal(nhGame._datetime, datetime);
    assert.equal(game.fixedDatetime, datetime);
    assert.equal(nhGame._recorderIsDst, false);
    assert.equal(game.recorderIsDst, false);
    assert.equal(vfsWriteFile('/runtime-foundation', 'installed'), true);
    assert.equal(backing.get('vfs:/runtime-foundation'), 'installed');
});

test('version constants match the pinned NetHack release', () => {
    assert.deepEqual(
        [VERSION_MAJOR, VERSION_MINOR, PATCHLEVEL],
        [5, 0, 0],
    );
});
