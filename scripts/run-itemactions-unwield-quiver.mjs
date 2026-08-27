#!/usr/bin/env node

// Record the quivered-item IA_UNWIELD route against patched C, replay it with
// the scoring modules, and compare from the selected '-' action through the
// next input boundary. The earlier item-action menu has one known gap: C's
// pager.c ia_checkfile() adds a '/' encyclopedia row, while its separate
// filesystem-free JavaScript port remains deferred in QUALITY.json.

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
import {
    createScoringWorkspace,
    removeScoringWorkspace,
} from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const RECORD_SCRIPT = join(PROJECT_ROOT, 'scripts', 'record-session.mjs');
// This clock has no NetHack calendar event, so only the commands under test
// change the top line.
const DATETIME = '20310203040506';
const COMMON_OPTIONS =
    'OPTIONS=pettype:none,!acoustics,!autopickup,!legacy,!tutorial,!splash_screen';

function segment(seed, character, moves) {
    // The waits bracket the action so an incorrect turn cost changes the
    // following screen and random-number calls.
    return {
        seed,
        datetime: DATETIME,
        nethackrc: `OPTIONS=name:Quiver,${character}\n${COMMON_OPTIONS}\n`,
        moves,
    };
}

export function loadQuiverUnwieldRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Samurai start with ya at inventory letter d and in uquiver,
            // after the katana, wakizashi, and yumi.
            segment(8823203,
                'role:Samurai,race:human,gender:male,align:lawful', '.id-.'),
            // Rangers instead start with +2 arrows at letter c and in
            // uquiver, after the dagger and bow.
            segment(7710209,
                'role:Ranger,race:human,gender:male,align:neutral', '.ic-.'),
        ],
    }, 'quiver-unwield recipe');
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
    assert.ok(['c', 'd'].includes(result.screenMismatch?.location?.key));
    assert.equal(result.screenMismatch?.cCell?.ch, '/');
    assert.equal(result.screenMismatch?.jsCell?.ch, '(');
    assert.ok(['c', 'd'].includes(result.cursorMismatch?.location?.key));
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
    for (let index = 0; index < recording.segments.length; ++index) {
        const steps = recording.segments[index].steps;
        const actual = jsOutput.segments[index];
        const start = steps.findIndex((step) => step.key === '-');
        assert.ok(start >= 0, `segment ${index + 1} selects the '-' action`);
        assert.equal(actual.screens.length, steps.length);
        assert.equal(actual.cursors.length, steps.length);
        suffixRecording.segments.push({
            ...recording.segments[index],
            // Whole-recording parity above covers PRNG calls. Empty the per-
            // step logs here so this comparison isolates screens and cursors.
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
        screens: suffixSegments.flatMap((entry) => entry.screens),
        cursors: suffixSegments.flatMap((entry) => entry.cursors),
        // Neither fresh case calls nh_delay_output().
        animFrames: suffixSegments.flatMap(
            (entry) => entry.screens.map(() => []),
        ),
        segments: suffixSegments,
    };
    const result = compareSessionOutputs(suffixRecording, suffixOutput);
    assert.equal(result.passed, true,
        `post-selection differential mismatch: ${JSON.stringify(result)}`);
    return suffixOutput.screens.length;
}

export async function runQuiverUnwieldMatrix() {
    const recipe = loadQuiverUnwieldRecipe();
    const strict = await runDifferential(recipe);
    assertKnownMenuGap(strict);

    const workRoot = mkdtempSync(join(tmpdir(), 'quiver-unwield-'));
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
            `QUIVER UNWIELD: PASS: ${recipe.segments.length} segments, `
            + `${strict.lengths.rng.c} PRNG calls, `
            + `${suffixScreens} post-selection screens and cursors\n`,
        );
        if (!strict.passed) {
            process.stdout.write(
                'Known earlier difference: ia_checkfile() encyclopedia row\n',
            );
        }
        return true;
    } finally {
        if (scoringRoot) removeScoringWorkspace(scoringRoot);
        rmSync(workRoot, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    runQuiverUnwieldMatrix().catch((error) => {
        process.stderr.write(`${error.stack || error}\n`);
        process.exitCode = 1;
    });
}
