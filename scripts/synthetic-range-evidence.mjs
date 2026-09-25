// Re-run only the prefix needed by source-completion citations. A challenge
// case may diverge later; later steps cannot invalidate an earlier match.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { normalizeSession } from '../frozen/session_loader.mjs';
import { runSegment } from '../js/jsmain.js';
import { challengePath, readChallengeBatches } from './challenge-results.mjs';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { PROJECT_ROOT } from './scoring-workspace.mjs';

function storageHandle() {
    const entries = new Map();
    return {
        getItem(key) { return entries.has(key) ? entries.get(key) : null; },
        setItem(key, value) { entries.set(key, String(value)); },
        removeItem(key) { entries.delete(key); },
        clear() { entries.clear(); },
        get length() { return entries.size; },
        key(index) { return [...entries.keys()][index] ?? null; },
    };
}

function citedRanges(evidence) {
    return [...(evidence.functions ?? []), ...(evidence.entryPoints ?? [])]
        .flatMap(entry => entry.synthetic ?? []);
}

/** Verify exact C/JS parity through every cited replay boundary at this checkout. */
export async function verifySyntheticRanges(evidence, {
    root = PROJECT_ROOT, replaySegment = runSegment,
} = {}) {
    const ranges = citedRanges(evidence);
    if (!ranges.length) return [];
    const batches = new Map(readChallengeBatches(root).map(batch => [batch.batch, batch]));
    const cases = new Map();
    for (const range of ranges) {
        const batch = batches.get(range.batch);
        const entry = batch?.cases.find(item => item.id === range.caseId);
        if (!entry) throw new Error(`synthetic evidence needs an admitted case: ${range.batch}/${range.caseId}`);
        const key = `${range.batch}/${range.caseId}`;
        if (!cases.has(key)) {
            const recording = normalizeSession(JSON.parse(readFileSync(
                challengePath(root, entry.recording), 'utf8')));
            cases.set(key, { recording, ranges: [] });
        }
        const { recording } = cases.get(key);
        const steps = recording.segments[range.segment]?.steps;
        if (!Array.isArray(steps) || range.throughStep >= steps.length)
            throw new Error(`synthetic evidence step is outside ${key}`);
        cases.get(key).ranges.push(range);
    }

    const verified = [];
    for (const [key, { recording, ranges: caseRanges }] of cases) {
        const farthest = caseRanges.reduce((latest, range) =>
            range.segment > latest.segment || (range.segment === latest.segment
                && range.throughStep > latest.throughStep) ? range : latest);
        const storage = storageHandle();
        for (let index = 0; index <= farthest.segment; index++) {
            const segment = recording.segments[index];
            const steps = index === farthest.segment
                ? segment.steps.slice(0, farthest.throughStep + 1) : segment.steps;
            const moves = steps.slice(1).map(step => step.key ?? '').join('');
            if (!steps.length || (index !== farthest.segment && moves !== segment.moves))
                throw new Error(`synthetic evidence has invalid recorded inputs: ${key} segment ${index}`);
            let boundary;
            let game;
            try {
                game = await replaySegment({ seed: segment.seed, datetime: segment.datetime,
                    nethackrc: segment.nethackrc, moves, storage },
                { onBoundary(error) { boundary ??= error; } });
            } catch (error) {
                throw new Error(`synthetic evidence stopped at ${key} segment ${index}: ${error.message}`);
            }
            const comparison = compareSessionOutputs({ version: 5,
                segments: [{ ...segment, steps, moves }] }, {
                rng: game.getRngLog?.() ?? [], screens: game.getScreens?.() ?? [],
                cursors: game.getCursors?.() ?? [],
            });
            if (boundary || comparison.error || comparison.segmentMismatch
                || comparison.rngMismatch || comparison.screenMismatch
                || comparison.cursorMismatch) {
                throw new Error(`synthetic evidence diverges at ${key} segment ${index} through step ${steps.length - 1}`);
            }
        }
        verified.push({ case: key, segment: farthest.segment, throughStep: farthest.throughStep });
    }
    return verified;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const path = process.argv[2];
    if (!path || process.argv.length !== 3) {
        console.error('usage: node scripts/synthetic-range-evidence.mjs <task-evidence.json>');
        process.exitCode = 2;
    } else {
        try {
            const verified = await verifySyntheticRanges(JSON.parse(readFileSync(path, 'utf8')));
            for (const item of verified)
                console.log(`${item.case} segment ${item.segment} through step ${item.throughStep}: matched`);
        } catch (error) {
            console.error(`synthetic-range-evidence: ${error.message}`);
            process.exitCode = 1;
        }
    }
}
