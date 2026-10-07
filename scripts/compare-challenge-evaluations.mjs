#!/usr/bin/env node
// Read-only comparison of saved evidence; never replay games or record scores.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareEvaluationCases, evaluationBatch, readChallengeBatches,
    validateEvaluation } from './challenge-results.mjs';

const USAGE = `Usage: node scripts/compare-challenge-evaluations.mjs <baseline-sha> <candidate-sha> <baseline-directory> <candidate-directory>

Use full measured commit SHAs and directories containing one saved evaluation
per admitted batch (for example, each checkpoint archive's synthetic directory).
Choose an accepted baseline explicitly; filenames and timestamps do not select it.
Run from the candidate repository with its admitted batch manifests.
Prints JSON listing changed cases, regressions and incomparable/missing evidence.
Exit 0: comparable, no regressions or error changes; 1: review required;
2: invalid invocation or artifacts. A clean comparison is not task acceptance.
Game input digests may differ across implementations; scorer, recordings and
metric denominators must match for comparable case measurements.`;

export function loadEvaluationDirectory(directory, sha) {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Expected full measured commit SHA');
    const evaluations = new Map();
    for (const file of readdirSync(directory).filter(name => name.endsWith('.json')).sort()) {
        const value = validateEvaluation(JSON.parse(readFileSync(join(directory, file), 'utf8')));
        if (value.sha !== sha) throw new Error(`${file}: expected commit ${sha}, found ${value.sha}`);
        const batch = evaluationBatch(value);
        if (evaluations.has(batch)) throw new Error(`duplicate evaluation for ${batch}`);
        evaluations.set(batch, value);
    }
    return evaluations;
}

export function compareChallengeBatches(before, after, admitted) {
    const issues = [];
    const changes = [];
    const regressions = [];
    let comparedCases = 0;
    const aggregateDelta = { sessions: 0, screens: 0, rng: 0, cursors: 0 };
    const expected = new Set(admitted.map(entry => entry.batch));
    for (const batch of new Set([...before.keys(), ...after.keys()]))
        if (!expected.has(batch)) issues.push({ batch, reason: 'batch is not admitted' });
    for (const { batch, manifestSha256 } of admitted) {
        const old = before.get(batch), current = after.get(batch);
        if (!old || !current) {
            issues.push({ batch, reason: 'missing evaluation', baseline: Boolean(old), candidate: Boolean(current) });
            continue;
        }
        if (old.status !== 'complete' || current.status !== 'complete') {
            issues.push({ batch, reason: 'failed evaluation', baseline: old.status, candidate: current.status });
            continue;
        }
        if (current.manifestSha256 !== manifestSha256)
            issues.push({ batch, reason: 'candidate does not cover the admitted manifest' });
        if (old.manifestSha256 !== current.manifestSha256)
            issues.push({ batch, reason: 'manifest changed' });
        if (old.scorerSha256 !== current.scorerSha256)
            issues.push({ batch, reason: 'scorer changed' });
        for (const row of compareEvaluationCases(old, current)) {
            if (row.status !== 'compared') {
                issues.push({ batch, ...row });
                continue;
            }
            comparedCases++;
            const losses = Object.keys(row.delta).filter(key => row.delta[key] < 0);
            for (const key of Object.keys(aggregateDelta)) aggregateDelta[key] += row.delta[key];
            if (losses.length) regressions.push({ batch, id: row.id, metrics: losses, delta: row.delta });
            if (row.errorChanged || Object.values(row.delta).some(value => value !== 0))
                changes.push({ batch, ...row });
        }
    }
    if (!admitted.length) issues.push({ reason: 'no admitted batches' });
    return { reviewRequired: Boolean(issues.length || regressions.length || changes.some(row => row.errorChanged)),
        batches: admitted.length, comparedCases, aggregateDelta, regressions, issues, changes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    try {
        if (args.length === 1 && args[0] === '--help') console.log(USAGE);
        else {
            if (args.length !== 4) throw new Error(USAGE);
            const [baseline, candidate, baselineDirectory, candidateDirectory] = args;
            const report = compareChallengeBatches(loadEvaluationDirectory(baselineDirectory, baseline),
                loadEvaluationDirectory(candidateDirectory, candidate), readChallengeBatches(process.cwd()));
            console.log(JSON.stringify({ baseline, candidate, baselineDirectory: resolve(baselineDirectory),
                candidateDirectory: resolve(candidateDirectory), ...report }, null, 2));
            process.exitCode = report.reviewRequired ? 1 : 0;
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}
