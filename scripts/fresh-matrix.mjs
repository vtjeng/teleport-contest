import {
    formatReport,
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';

// Recorder runs stopped at a live prompt retain one game lock per segment.
// The installed recorder accepts ten such segments before rejecting another.
export const RECORDER_SEGMENT_LIMIT = 10;

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
