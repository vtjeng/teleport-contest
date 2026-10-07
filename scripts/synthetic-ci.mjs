#!/usr/bin/env node
// Hosted trial: fixed-size case groups, reassembled as normal per-batch evidence.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { challengeInputSnapshot, readChallengeBatches, saveEvaluation, totalsFor } from './challenge-results.mjs';
import { replayChallengeCases, scorerIdentity } from './score-challenges.mjs';
import { PROJECT_ROOT } from './scoring-workspace.mjs';
import { boundedMain } from './run-bounded.mjs';
import { requireCleanCheckpointTree } from './checkpoint-checks.mjs';

// A trial setting, not a runtime guarantee. Increase jobs as the corpus grows.
export const CASES_PER_JOB = 100;
const OUTPUT = '.cache/synthetic-ci';

export function groupCases(batches, count = CASES_PER_JOB) {
    const cases = [...batches].sort((a, b) => Number(a.batch.slice(1)) - Number(b.batch.slice(1)))
        .flatMap(batch => batch.cases.map(entry => ({ batch: batch.batch, id: entry.id })));
    const groups = [];
    for (let start = 0; start < cases.length; start += count)
        groups.push({ group: groups.length + 1, cases: cases.slice(start, start + count) });
    return groups;
}

function identity(batches) {
    return { sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        scorer: scorerIdentity(PROJECT_ROOT),
        batches: batches.map(batch => ({ batch: batch.batch, manifestSha256: batch.manifestSha256,
            inputsSha256: challengeInputSnapshot(PROJECT_ROOT, batch).sha256 })) };
}

function runGroup(group, batches) {
    requireCleanCheckpointTree();
    const selected = groupCases(batches).find(entry => entry.group === group);
    if (!selected) throw new Error('unknown synthetic group');
    const before = identity(batches);
    const utc = new Date().toISOString();
    const started = performance.now();
    const results = [];
    // Separate batches can reuse a case ID; replay each selected subset separately.
    for (const batch of batches) {
        const ids = new Set(selected.cases.filter(entry => entry.batch === batch.batch).map(entry => entry.id));
        if (!ids.size) continue;
        const cases = batch.cases.filter(entry => ids.has(entry.id));
        results.push(...replayChallengeCases(PROJECT_ROOT, cases).map(result => ({ batch: batch.batch, result })));
    }
    requireCleanCheckpointTree();
    if (!isDeepStrictEqual(before, identity(batches))) throw new Error('synthetic inputs changed during replay');
    mkdirSync(OUTPUT, { recursive: true });
    writeFileSync(`${OUTPUT}/${group}.json`, JSON.stringify({ group, identity: before, utc,
        durationMs: performance.now() - started, results }), { flag: 'wx' });
    console.log(`Synthetic group ${group}: ${results.length} cases in ${Math.round(performance.now() - started)} ms`);
}

export function combineCases(groups, parts, expectedIdentity) {
    if (groups.length !== parts.length) throw new Error('missing synthetic group');
    const results = new Map();
    for (const group of groups) {
        const matching = parts.filter(part => part.group === group.group);
        if (matching.length !== 1 || !isDeepStrictEqual(matching[0].identity, expectedIdentity))
            throw new Error('missing, duplicate, or stale synthetic group');
        const part = matching[0];
        const actual = part.results.map(({ batch, result }) => `${batch}/${result.id}`).sort();
        const expected = group.cases.map(({ batch, id }) => `${batch}/${id}`).sort();
        if (!isDeepStrictEqual(actual, expected)) throw new Error('synthetic group omitted or duplicated cases');
        for (const entry of part.results) results.set(`${entry.batch}/${entry.result.id}`, entry.result);
    }
    return results;
}

function combine(batches) {
    const groups = groupCases(batches);
    const expected = identity(batches);
    const parts = groups.map(({ group }) => JSON.parse(readFileSync(`${OUTPUT}/${group}.json`, 'utf8')));
    const results = combineCases(groups, parts, expected);
    mkdirSync('challenges/evaluations', { recursive: true });
    for (const batch of batches) {
        const snapshot = challengeInputSnapshot(PROJECT_ROOT, batch);
        const cases = batch.cases.map(entry => results.get(`${batch.batch}/${entry.id}`));
        const utc = parts.filter(part => part.results.some(entry => entry.batch === batch.batch))
            .map(part => part.utc).sort().at(-1);
        saveEvaluation(PROJECT_ROOT, `challenges/evaluations/ci-${batch.batch}.json`, {
            version: 1, batch: batch.batch, manifestPath: batch.manifestPath,
            sha: expected.sha, utc, status: 'complete', manifestSha256: batch.manifestSha256,
            scorerSha256: expected.scorer.sha256, scorerFiles: expected.scorer.files,
            inputsSha256: snapshot.sha256, inputFiles: snapshot.files.map(entry => entry.path),
            cases, totals: totalsFor(cases),
        });
    }
    console.log(`Complete synthetic evidence: ${batches.length} batches, ${results.size} cases`);
}

function main(args) {
    process.chdir(PROJECT_ROOT);
    const batches = readChallengeBatches(PROJECT_ROOT);
    if (!batches.length) throw new Error('no admitted synthetic batches');
    if (args.length === 1 && args[0] === 'plan') {
        console.log(JSON.stringify({ include: groupCases(batches).map(({ group, cases }) =>
            ({ group, cases: cases.length })) }));
    } else if (args.length === 1 && args[0] === 'combine') combine(batches);
    else if (args.length === 2 && args[0] === 'run' && /^[1-9]\d*$/u.test(args[1]))
        return runGroup(Number(args[1]), batches);
    else throw new Error('Usage: synthetic-ci.mjs plan | run <group> | combine');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2);
        if (args[0] === 'run') await boundedMain('full', () => main(args));
        else main(args);
    } catch (error) { console.error(`synthetic-ci: ${error.message}`); process.exitCode = 1; }
}
