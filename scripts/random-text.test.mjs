import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { A_WIS } from '../js/const.js';
import { random_engraving } from '../js/random_engraving.js';
import {
    RANDOM_TEXT_FILES,
    RANDOM_TEXT_FILE_HASHES,
} from '../js/random_text_data.js';
import {
    get_rnd_line,
    getrumor,
    parseRumorHeader,
    xcrypt,
} from '../js/random_text.js';
import {
    buildRandomTextFiles,
    renderRandomTextData,
} from './generate-random-text-data.mjs';

function sha256(value, encoding = undefined) {
    return createHash('sha256').update(value, encoding).digest('hex');
}

function scriptedRandom(script) {
    const remaining = [...script];
    return {
        rn2(bound) {
            const next = remaining.shift();
            assert.ok(next, `unexpected rn2(${bound})`);
            assert.equal(next.bound, bound);
            assert.ok(next.result >= 0 && next.result < bound);
            return next.result;
        },
        done() {
            assert.deepEqual(remaining, []);
        },
    };
}

test('generated random-text data matches the pinned source and byte layout', () => {
    const sourceHashes = {
        // These hashes pin the four upstream data inputs at revision 16ff591.
        'rumors.tru': '86464822e8e09ca653f9e588f696b7af3d986fe17145454a5c101e2bdf98b012',
        'rumors.fal': '2f1ca072a66c1ee83aa3e87762f84721c91ea97dc1949fd01d65ecc55f6fda06',
        'engrave.txt': '9dbe56e0a14786d9a406778ddb1bcaba31fbba758b21149dff5210f32df93585',
        'epitaph.txt': '35e7176fa4cab2496c23b46b8ae39babcb8681c067750d491782e0497e1f7a1d',
    };
    for (const [filename, expected] of Object.entries(sourceHashes)) {
        const source = readFileSync(
            new URL(`../nethack-c/upstream/dat/${filename}`, import.meta.url),
        );
        assert.equal(sha256(source), expected, filename);
    }

    const generated = buildRandomTextFiles();
    assert.deepEqual(generated, RANDOM_TEXT_FILES);
    assert.equal(
        readFileSync(
            new URL('../js/random_text_data.js', import.meta.url),
            'utf8',
        ),
        renderRandomTextData(generated),
    );
    assert.deepEqual(RANDOM_TEXT_FILE_HASHES, {
        // These are the exact makedefs outputs used by the C recorder.
        rumors: '1e5958f52212d0792a5e62953f7a5f530dedd0f192bb4077d8faf2b848c94c30',
        engrave: '997a0b2ecc90a46f58e8c9df0682710fa3aaaacbe3464f12d0300d234159849d',
        epitaph: 'a5325ff6040e99103a245b90521dee0f47b0f64e4c628f75765e837ffcd56318',
    });
    for (const [filename, data] of Object.entries(RANDOM_TEXT_FILES))
        assert.equal(sha256(data, 'latin1'), RANDOM_TEXT_FILE_HASHES[filename]);
});

test('rumor header retains the generated section offsets and byte bounds', () => {
    assert.deepEqual(parseRumorHeader(RANDOM_TEXT_FILES.rumors), {
        // 109 is the byte immediately after the two generated header records.
        trueCount: 390,
        trueSize: 24924,
        trueStart: 109,
        falseCount: 397,
        falseSize: 25762,
        falseStart: 25033,
        eof: 50795,
        trueEnd: 25033,
        falseEnd: 50795,
    });
    // The random-access files have one 60-byte generated comment record.
    assert.equal(RANDOM_TEXT_FILES.engrave.length - 60, 2894);
    assert.equal(RANDOM_TEXT_FILES.epitaph.length - 60, 24075);
});

test('xcrypt resets its five-bit mask and decrypts its own output', () => {
    // This literal is the first ordinary engraving and appears encrypted as
    // these eight bytes in the generated file.
    assert.equal(xcrypt('Elbereth'), 'Dnfmbdvl');
    assert.equal(xcrypt(xcrypt('Elbereth')), 'Elbereth');
});

test('get_rnd_line retries a long-line prefix and then uses the next line', () => {
    // A 100-byte line leaves 101 bytes including newline at offset zero, but
    // exactly 61 at offset 40; 61 is padlength+1 and therefore accepted.
    const longLine = `${'A'.repeat(100)}\n`;
    const nextLine = `next${'_'.repeat(55)}\n`;
    const data = xcrypt(longLine) + xcrypt(nextLine);
    const random = scriptedRandom([
        { bound: 161, result: 0 },
        { bound: 161, result: 40 },
    ]);

    assert.equal(get_rnd_line(data, random, 0, 0, 60), 'next');
    random.done();
});

test('get_rnd_line stops after ten long-line retries', () => {
    const longLine = `${'A'.repeat(100)}\n`;
    const nextLine = `next${'_'.repeat(55)}\n`;
    const data = xcrypt(longLine) + xcrypt(nextLine);
    const random = scriptedRandom(
        // Offset zero leaves the 101-byte long line and exhausts every try.
        Array.from({ length: 10 }, () => ({ bound: 161, result: 0 })),
    );

    assert.equal(get_rnd_line(data, random, 0, 0, 60), 'next');
    random.done();
});

test('get_rnd_line wraps at a section boundary instead of crossing it', () => {
    const firstLine = `first${'_'.repeat(54)}\n`;
    const outsideLine = `outside${'_'.repeat(52)}\n`;
    const data = xcrypt(firstLine) + xcrypt(outsideLine);
    const random = scriptedRandom([
        // The first padded line is exactly the whole 60-byte section.
        { bound: 60, result: 0 },
    ]);

    assert.equal(get_rnd_line(data, random, 0, 60, 60), 'first');
    random.done();
});

test('getrumor selects the adjusted truth section in source call order', () => {
    const random = scriptedRandom([
        // truth=0 plus one chooses the true-rumor section.
        { bound: 2, result: 1 },
        // Offset zero discards its first line and selects the second true rumor.
        { bound: 24924, result: 0 },
    ]);
    const exercises = [];

    assert.equal(
        getrumor(0, true, {
            random,
            state: { in_mklev: false },
            exercise: (...args) => exercises.push(args),
        }),
        'A candelabrum affixed with seven candles shows the way with a magical light.',
    );
    random.done();
    assert.deepEqual(exercises, [[A_WIS, true]]);
});

test('getrumor excludes a cookie marker by retrying both random choices', () => {
    const random = scriptedRandom([
        { bound: 2, result: 0 },
        // Relative byte 1457 begins the padded line before the first cookie.
        { bound: 25762, result: 1457 },
        { bound: 2, result: 0 },
        // Ten bytes into the long first false rumor makes its suffix acceptable;
        // the following line is the non-cookie result.
        { bound: 25762, result: 10 },
    ]);

    assert.equal(
        getrumor(-1, true, { random, state: { in_mklev: true } }),
        '1st Law of Hacking:  leaving is much more difficult than entering.',
    );
    random.done();
});

test('getrumor strips an allowed cookie marker after selection', () => {
    const random = scriptedRandom([
        { bound: 2, result: 0 },
        // This selects "[cookie] A wish?..." from the false section.
        { bound: 25762, result: 1457 },
    ]);

    assert.equal(
        getrumor(-1, false, { random, state: { in_mklev: true } }),
        'A wish?  Okay, make me a fortune cookie!',
    );
    random.done();
});

test('getrumor preserves the postfix 50-retry limit', () => {
    let phase = 0;
    let calls = 0;
    const messages = [];
    const random = {
        rn2(bound) {
            ++calls;
            if (phase++ % 2 === 0) {
                assert.equal(bound, 2);
                return 0;
            }
            assert.equal(bound, 25762);
            // Always select the same cookie-prefixed false rumor.
            return 1457;
        },
    };

    assert.match(
        getrumor(-1, true, {
            random,
            state: { in_mklev: true },
            impossible: (message) => messages.push(message),
        }),
        /^\[cookie\] /u,
    );
    // count++ < 50 allows 51 bodies, each with a truth and byte-offset draw.
    assert.equal(calls, 102);
    assert.deepEqual(messages, ["Can't find non-cookie rumor?"]);
});

test('random_engraving bypasses rumors and keeps pristine text', () => {
    const random = scriptedRandom([
        // Zero bypasses getrumor() and selects from the engraving file.
        { bound: 4, result: 0 },
        // Offset zero skips the generated default and selects "Elbereth".
        { bound: 2894, result: 0 },
        // Two wipe selections replace the first and last of eight bytes.
        { bound: 8, result: 0 }, { bound: 4, result: 0 },
        { bound: 8, result: 7 }, { bound: 4, result: 0 },
    ]);

    assert.deepEqual(
        random_engraving({ random, state: { in_mklev: true } }),
        { text: '?lberet?', pristine: 'Elbereth' },
    );
    random.done();
});

test('random_engraving short-circuits its file fallback for a rumor', () => {
    const random = scriptedRandom([{ bound: 4, result: 3 }]);
    const calls = [];
    const result = random_engraving({
        random,
        state: { in_mklev: true },
        getRumor(truth, excludeCookie) {
            calls.push(['rumor', truth, excludeCookie]);
            return 'abcd efgh';
        },
        getRandomText() {
            assert.fail('a nonempty rumor must bypass get_rnd_text');
        },
        wipeoutText(text, count, seed) {
            calls.push(['wipe', text, count, seed]);
            return 'wiped';
        },
    });

    assert.deepEqual(result, { text: 'wiped', pristine: 'abcd efgh' });
    assert.deepEqual(calls, [
        ['rumor', 0, true],
        // Nine source bytes use integer division to request two rubouts.
        ['wipe', 'abcd efgh', 2, 0],
    ]);
    random.done();
});

test('random_engraving falls back after an empty rumor', () => {
    const random = scriptedRandom([{ bound: 4, result: 2 }]);
    const calls = [];
    const result = random_engraving({
        random,
        state: { in_mklev: true },
        getRumor() {
            calls.push('rumor');
            return '';
        },
        getRandomText(filename, _rng, padlength) {
            calls.push(['file', filename, padlength]);
            return 'abcd';
        },
        wipeoutText(text, count, seed) {
            calls.push(['wipe', text, count, seed]);
            return 'abc?';
        },
    });

    assert.deepEqual(result, { text: 'abc?', pristine: 'abcd' });
    assert.deepEqual(calls, [
        'rumor',
        ['file', 'engrave', 60],
        // Four source bytes request one rubout.
        ['wipe', 'abcd', 1, 0],
    ]);
    random.done();
});
