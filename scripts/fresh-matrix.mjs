import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatReport,
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';

// Recorder runs stopped at a live prompt retain one game lock per segment.
// The installed recorder accepts ten such segments before rejecting another.
export const RECORDER_SEGMENT_LIMIT = 10;

// The judge's sessions were recorded on macOS, and the port prints what they
// show. A recorder built on another host prints that host's arm of the few
// strings NetHack chooses at compile time (eat.c fprefx()'s apple line,
// version.c's "Unix"/"MacOS" banner, mdlib.c's /dev/urandom). A matrix that
// reaches one lists [hostText, judgeText] pairs; on a host other than the
// judge's, substituteHostStrings() rewrites those pairs in every recorded
// screen before comparison and leaves everything else strict.
export const RECORDER_HOST_IS_JUDGE = process.platform === 'darwin';

export function substituteHostStrings(
    recording,
    substitutions,
    hostIsJudge = RECORDER_HOST_IS_JUDGE,
) {
    if (hostIsJudge) return recording;
    return {
        ...recording,
        segments: recording.segments.map((segment) => ({
            ...segment,
            steps: segment.steps.map((step) => {
                let screen = step.screen;
                for (const [hostText, judgeText] of substitutions) {
                    screen = screen.split(hostText).join(judgeText);
                }
                return screen === step.screen ? step : { ...step, screen };
            }),
        })),
    };
}

// A runDifferentialFn for runFreshMatrix() that applies substituteHostStrings().
export function runDifferentialAcceptingHostStrings(substitutions) {
    return (recipe) => runDifferential(recipe, process.env, {
        transformRecording: (recording) =>
            substituteHostStrings(recording, substitutions),
    });
}

export function chunkRecipe(recipe, limit = RECORDER_SEGMENT_LIMIT) {
    validateCleanRecipe(recipe, 'fresh matrix recipe');
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('fresh matrix chunk limit must be a positive integer');
    }
    const chunks = [];
    for (let start = 0; start < recipe.segments.length; start += limit) {
        chunks.push({
            version: recipe.version,
            segments: recipe.segments.slice(start, start + limit),
        });
    }
    return chunks;
}

function addLengths(totals, result, segmentCount) {
    totals.segments += segmentCount;
    totals.rng += result.lengths.rng.c;
    totals.screens += result.lengths.screens.c;
    totals.cursors += result.lengths.cursors.c;
    totals.animFrames += result.lengths.animFrames?.c ?? 0;
}

export async function runFreshMatrix({
    entries,
    summaryLabel,
    verifySegment,
    chunkLimit = RECORDER_SEGMENT_LIMIT,
    runDifferentialFn = runDifferential,
    write = (text) => process.stdout.write(text),
}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error('fresh matrix needs at least one recipe entry');
    }
    if (typeof summaryLabel !== 'string' || summaryLabel.length === 0) {
        throw new Error('fresh matrix needs a summary label');
    }
    if (verifySegment !== undefined && typeof verifySegment !== 'function') {
        throw new Error('fresh matrix segment verifier must be a function');
    }

    const totals = {
        segments: 0, rng: 0, screens: 0, cursors: 0, animFrames: 0,
    };
    for (const entry of entries) {
        if (!entry || typeof entry.label !== 'string'
            || entry.label.length === 0) {
            throw new Error('fresh matrix entries need labels');
        }
        const chunks = chunkRecipe(entry.recipe, chunkLimit);
        for (let index = 0; index < chunks.length; ++index) {
            const chunk = chunks[index];
            if (verifySegment) {
                for (const segment of chunk.segments) {
                    await verifySegment(segment);
                }
            }
            write(
                `[${entry.label} ${index + 1}/${chunks.length}] `
                + `${chunk.segments.length} segments\n`,
            );
            const result = await runDifferentialFn(chunk);
            if (!result.passed) {
                write(formatReport(result));
                return {
                    passed: false,
                    totals,
                    failure: {
                        entry: entry.label,
                        chunk: index + 1,
                        result,
                    },
                };
            }
            addLengths(totals, result, chunk.segments.length);
        }
    }

    write(
        `${summaryLabel}: PASS: ${totals.segments} segments, `
        + `${totals.rng} PRNG calls, ${totals.screens} screens, `
        + `${totals.cursors} cursors, ${totals.animFrames} animation frames\n`,
    );
    return { passed: true, totals };
}

// The command-line entry of a matrix script. A script calls this once at its
// end with its own module URL, its exported matrix runner, and the label its
// error lines carry; the call returns without running when the module was
// imported rather than executed. Exit status 0 is a passing matrix, 1 a
// failing one, and 2 an argument or a thrown error, the same statuses as
// scripts/diff-fresh.mjs.
export function runMatrixCli(moduleUrl, run, label, {
    argv = process.argv,
    write = (text) => process.stderr.write(text),
    setExitCode = (status) => { process.exitCode = status; },
} = {}) {
    if (!argv[1] || resolve(argv[1]) !== fileURLToPath(moduleUrl)) {
        return Promise.resolve(null);
    }
    if (argv.length > 2) {
        write(`${label}: arguments are not accepted\n`);
        setExitCode(2);
        return Promise.resolve(2);
    }
    return run().then((result) => {
        const status = result.passed ? 0 : 1;
        setExitCode(status);
        return status;
    }, (error) => {
        write(`${label}: ${error?.message || error}\n`);
        setExitCode(2);
        return 2;
    });
}
