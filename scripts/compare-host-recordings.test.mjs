import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    compareDirectories,
    compareRecordings,
    formatReport,
    maskTempSuffix,
    wordHunks,
} from './compare-host-recordings.mjs';

// Fixture screens are plain text rows, which is how the recorder encodes a
// screen without colors or long runs of spaces.
const MAP = 'Dlvl:1 $:0 HP:12(12)';
// The first #version line on each host: global.h PORT_ID is "MacOS" under
// __APPLE__ and "Unix" otherwise.
const VERSION_MAC = 'MacOS NetHack Version 5.0.0 - last build May  2 2026 12:00:00.';
const VERSION_LINUX = 'Unix NetHack Version 5.0.0 - last build May  2 2026 12:00:00.';
// A build-options row from mdlib.c, wrapped where each host's DEV_RANDOM
// (unixconf.h) leaves it: the extra "u" pushes "restore" to the next row.
const OPTIONS_MAC = 'strong PRNG seed from /dev/random, restore saved\ngames via menu.';
const OPTIONS_LINUX = 'strong PRNG seed from /dev/urandom,\nrestore saved games via menu.';

function recording(steps) {
    return { version: 5, segments: [{ seed: 1, steps }] };
}

function step(screen, rng = ['rn2(12)=3'], cursor = [0, 0, 1]) {
    return { key: null, rng, screen, cursor };
}

test('maskTempSuffix hides the mkdtemp suffix, including a suffix cut at column 80', () => {
    // A full suffix, then one that the terminal cut after three characters.
    assert.equal(maskTempSuffix('/tmp/nh-rec-Ab12Cd/home/.nethackrc'),
        '/tmp/nh-rec-XXXXXX/home/.nethackrc');
    assert.equal(maskTempSuffix('/tmp/nh-rec-Ab1'), '/tmp/nh-rec-XXX');
});

test('wordHunks reports each run of unmatched words, ignoring where lines wrap', () => {
    assert.deepEqual(wordHunks(`${VERSION_MAC}\n${OPTIONS_MAC}`, `${VERSION_LINUX}\n${OPTIONS_LINUX}`), [
        { a: 'MacOS', b: 'Unix' },
        { a: '/dev/random,', b: '/dev/urandom,' },
    ]);
    // Identical words with different line breaks have no hunk.
    assert.deepEqual(wordHunks('a b\nc', 'a\nb c'), []);
});

test('compareRecordings compares screens only before the first RNG difference', () => {
    const a = recording([step(MAP), step(VERSION_MAC), step(MAP, ['rn2(4)=1'])]);
    const b = recording([step(MAP), step(VERSION_MAC), step('different map', ['rn2(4)=2'])]);
    const result = compareRecordings(a, b);
    assert.equal(result.rngIdentical, false);
    // The third step (index 2) holds the first differing call, its first.
    assert.deepEqual(result.firstRngDifference,
        { segment: 0, step: 2, call: 0, a: 'rn2(4)=1', b: 'rn2(4)=2' });
    // Steps 0 and 1 are compared; step 2's differing screen is not.
    assert.equal(result.screensCompared, 2);
    assert.deepEqual(result.screensDiffer, []);
});

test('compareRecordings treats a missing step as an RNG difference', () => {
    // Host b's game ended one step early: its RNG log is a prefix of a's.
    const result = compareRecordings(recording([step(MAP), step(MAP)]), recording([step(MAP)]));
    assert.equal(result.rngIdentical, false);
    assert.deepEqual(result.firstRngDifference, { segment: 0, step: 1, call: 0, a: null, b: null });
    assert.deepEqual(result.stepCounts, { a: [2], b: [1] });
});

test('compareRecordings reports attribute-only differences and cursor differences', () => {
    // \x1b[7m turns on inverse video for the "@"; the characters match.
    const a = recording([step('@', undefined, [0, 0, 1])]);
    const b = recording([step('\x1b[7m@\x1b[0m', undefined, [1, 0, 1])]);
    const result = compareRecordings(a, b);
    assert.deepEqual(result.screensDiffer.map((s) => s.hunks), [[{ a: '[attributes] @', b: '[attributes]' }]]);
    assert.deepEqual(result.cursorsDiffer, [{ segment: 0, step: 0, a: [0, 0, 1], b: [1, 0, 1] }]);
});

test('compareDirectories groups the same host difference across recipes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'compare-host-recordings-test-'));
    try {
        const dirA = path.join(root, 'macos');
        const dirB = path.join(root, 'linux');
        await mkdir(dirA);
        await mkdir(dirB);
        const write = (dir, id, rec) => writeFile(path.join(dir, `${id}.session.json`), JSON.stringify(rec));
        // g1: identical except the HOME suffix, which the comparison masks.
        await write(dirA, 'g1', recording([step('/tmp/nh-rec-aaaaaa/home/.nethackrc')]));
        await write(dirB, 'g1', recording([step('/tmp/nh-rec-bbbbbb/home/.nethackrc')]));
        // g2 and g3 both print the version text, so they share the
        // MacOS/Unix kind; only g3 also shows the build options.
        await write(dirA, 'g2', recording([step(MAP), step(VERSION_MAC)]));
        await write(dirB, 'g2', recording([step(MAP), step(VERSION_LINUX)]));
        await write(dirA, 'g3', recording([step(`${VERSION_MAC}\n${OPTIONS_MAC}`)]));
        await write(dirB, 'g3', recording([step(`${VERSION_LINUX}\n${OPTIONS_LINUX}`)]));
        // g4 recorded only on the first host, as when a recording fails.
        await write(dirA, 'g4', recording([step(MAP)]));
        // g5 was recorded on daylight time on one host only. The phrases
        // are the two night() / midnight() answers of the ^X attributes
        // screen; the differing screen is listed but adds no kind.
        const dst = (rec, isDst) => ({ ...rec, segments: rec.segments.map((s) => ({ ...s, recorderIsDst: isDst })) });
        await write(dirA, 'g5', dst(recording([step('It is nighttime.')]), true));
        await write(dirB, 'g5', dst(recording([step('It is the midnight hour.')]), false));
        const report = await compareDirectories(dirA, dirB);
        assert.deepEqual(report.onlyInA, ['g4']);
        assert.deepEqual(report.onlyInB, []);
        assert.deepEqual(report.recipes.map((r) => [r.id, r.dstMatches, r.screensDiffer.length]),
            [['g1', true, 0], ['g2', true, 1], ['g3', true, 1], ['g5', false, 1]]);
        assert.deepEqual(report.kinds.map((k) => [k.a, k.b, k.recipes, k.screens]), [
            ['MacOS', 'Unix', ['g2', 'g3'], 2],
            ['/dev/random,', '/dev/urandom,', ['g3'], 1],
        ]);
        const text = formatReport(report, ['macOS', 'Linux']);
        assert.match(text, /RNG logs identical: 4 of 4/u);
        assert.match(text, /Recorded with different recorderIsDst: 1 recipes/u);
        assert.match(text, /g5; recorderIsDst differs \(macOS: true; Linux: false\)/u);
        assert.match(text, /g2; RNG identical; screens differ: 0:1 of 2 compared/u);
        assert.match(text, /1\. 2 recipes, 2 screens; example g2 segment 0 step 1/u);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
