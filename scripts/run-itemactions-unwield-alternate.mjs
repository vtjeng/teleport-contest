#!/usr/bin/env node

// Record the alternate-weapon IA_UNWIELD route against patched C, replay it
// with the scoring modules, and compare from the selected '-' action through
// the next input boundary. The earlier item-action menu has one known gap:
// C's pager.c ia_checkfile() adds a '/' encyclopedia row, while its separate
// filesystem-free JS port remains deferred in QUALITY.json.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    assertRecordingMatchesRecipe,
    compareSessionOutputs,
    runDifferential,
    runJsSession,
    validateCleanRecipe,
} from './diff-fresh.mjs';
import { runMatrixCli } from './fresh-matrix.mjs';
import {
    createScoringWorkspace,
    removeScoringWorkspace,
} from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const RECORD_SCRIPT = join(PROJECT_ROOT, 'scripts', 'record-session.mjs');
// This clock has no NetHack calendar event, so only the command under test
// changes the top line.
const DATETIME = '20310203040506';
const NETHACKRC = [
    // The Samurai starts with a katana in uwep and a wakizashi in uswapwep;
    // inventory letter b therefore selects the alternate weapon naturally.
    'OPTIONS=name:Alt,role:Samurai,race:human,gender:male,align:lawful',
    'OPTIONS=pettype:none,!acoustics,!autopickup,!legacy,!tutorial,!splash_screen',
    '',
].join('\n');

function segment(seed, moves) {
    return { seed, datetime: DATETIME, nethackrc: NETHACKRC, moves };
}

export function loadAlternateUnwieldRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // 8823101 was chosen independently for the ordinary message.
            // The waits bracket the action so an incorrect turn cost changes
            // the following screen and random-number calls.
            segment(8823101, '.ib-.'),
            // 7710103 is the established replayable Samurai seed from the
            // two-weapon matrix. #twoweapon is used because direct 'X'
            // remains outside the port's admitted-command boundary.
            segment(7710103, '.#twoweapon\nib-.'),
        ],
    }, 'alternate-unwield recipe');
}

function assertKnownMenuGap(result) {
    if (result.passed) return;
    assert.equal(result.error, null);
    assert.equal(result.rngMismatch, null);
    assert.equal(result.segmentMismatch, null);
    assert.equal(result.animMismatch, null);
    assert.equal(result.lengths.rng.c, result.lengths.rng.js);
    assert.equal(result.lengths.screens.c, result.lengths.screens.js);
    assert.equal(result.lengths.cursors.c, result.lengths.cursors.js);
    assert.equal(result.screenMismatch?.location?.key, 'b');
    assert.equal(result.screenMismatch?.cCell?.ch, '/');
    assert.equal(result.cursorMismatch?.location?.key, 'b');
}

function recordRecipe(recipe, workRoot) {
    const recipePath = join(workRoot, 'recipe.session.json');
    const recordingPath = join(workRoot, 'recorded.session.json');
    writeFileSync(recipePath, JSON.stringify(recipe));
    const run = spawnSync(
        process.execPath,
        [RECORD_SCRIPT, recipePath, recordingPath],
        {
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            timeout: 10 * 60 * 1000,
            maxBuffer: 64 * 1024 * 1024,
        },
    );
    if (run.error || run.status !== 0) {
        throw new Error(run.error?.message
            ?? `C recorder exited ${run.status}: ${run.stderr.trim()}`);
    }
    return {
        recordingPath,
        recording: JSON.parse(readFileSync(recordingPath, 'utf8')),
    };
}

function assertSelectedActionSuffix(recording, jsOutput) {
    assert.equal(jsOutput.error, null);
    assert.equal(jsOutput.segments.length, recording.segments.length);
    const suffixRecording = { ...recording, segments: [] };
    const suffixSegments = [];
    for (let i = 0; i < recording.segments.length; ++i) {
        const steps = recording.segments[i].steps;
        const actual = jsOutput.segments[i];
        const start = steps.findIndex((step) => step.key === '-');
        assert.ok(start >= 0, `segment ${i + 1} selects the '-' action`);
        assert.equal(actual.screens.length, steps.length);
        assert.equal(actual.cursors.length, steps.length);
        suffixRecording.segments.push({
            ...recording.segments[i],
            // PRNG parity was checked over the whole recording above. Empty
            // it here so this second comparison isolates screens and cursors.
            steps: steps.slice(start).map((step) => ({ ...step, rng: [] })),
        });
        suffixSegments.push({
            rng: [],
            screens: actual.screens.slice(start),
            cursors: actual.cursors.slice(start),
        });
    }
    const suffixOutput = {
        error: null,
        rng: [],
        screens: suffixSegments.flatMap((segment) => segment.screens),
        cursors: suffixSegments.flatMap((segment) => segment.cursors),
        // Neither fresh case calls nh_delay_output(), so every retained input
        // boundary has an empty animation-frame list.
        animFrames: suffixSegments.flatMap(
            (segment) => segment.screens.map(() => []),
        ),
        segments: suffixSegments,
    };
    const result = compareSessionOutputs(suffixRecording, suffixOutput);
    assert.equal(result.passed, true,
        `post-selection differential mismatch: ${JSON.stringify(result)}`);
    return suffixOutput.screens.length;
}

export async function runAlternateUnwieldMatrix() {
    const recipe = loadAlternateUnwieldRecipe();
    const strict = await runDifferential(recipe);
    assertKnownMenuGap(strict);

    const workRoot = mkdtempSync(join(tmpdir(), 'alternate-unwield-'));
    let scoringRoot = null;
    try {
        const { recordingPath, recording } = recordRecipe(recipe, workRoot);
        assertRecordingMatchesRecipe(recording, recipe);
        scoringRoot = createScoringWorkspace(
            workRoot,
            [basename(recordingPath)],
        );
        const jsOutput = await runJsSession(recording, scoringRoot);
        const suffixScreens = assertSelectedActionSuffix(recording, jsOutput);
        process.stdout.write(
            `ALTERNATE UNWIELD: PASS: ${recipe.segments.length} segments, `
            + `${strict.lengths.rng.c} PRNG calls, `
            + `${suffixScreens} post-selection screens and cursors\n`,
        );
        if (!strict.passed) {
            process.stdout.write(
                'Known earlier difference: ia_checkfile() encyclopedia row\n',
            );
        }
        return { passed: true };
    } finally {
        if (scoringRoot) removeScoringWorkspace(scoringRoot);
        rmSync(workRoot, { recursive: true, force: true });
    }
}

runMatrixCli(import.meta.url, runAlternateUnwieldMatrix, 'alternate unwield');
