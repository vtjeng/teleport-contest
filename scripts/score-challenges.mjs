#!/usr/bin/env node
// Evaluate the frozen synthetic local challenge cases at committed HEAD, then explicitly record
// the immutable artifact in SCORE.tsv. Dashboard builds never invoke this tool.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { localTmpdir } from './local-tmpdir.mjs';
import { appendRow, readRows } from './score-log.mjs';
import { challengeInputSnapshot, challengePath, corpusDigest, digest, evaluationBatch,
    evaluationFields, readChallengeBatches, readEvaluation, saveEvaluation, totalsFor } from './challenge-results.mjs';
import { PROJECT_ROOT, createScoringWorkspace, parseRunnerBundle, removeScoringWorkspace,
    runScorer } from './scoring-workspace.mjs';

export function scorerIdentity(root) {
    const files = Object.fromEntries(readdirSync(join(root, 'frozen'), { withFileTypes: true })
        .filter(entry => entry.isFile() && /\.(?:m?js)$/u.test(entry.name))
        .map(entry => entry.name).sort().map(name => [`frozen/${name}`, digest(readFileSync(join(root, 'frozen', name)))]));
    return { files, sha256: digest(JSON.stringify(files)) };
}

function git(root, args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function committedInputs(root, batch) {
    const snapshot = challengeInputSnapshot(root, batch);
    const paths = ['js', 'frozen', 'package.json', 'package-lock.json',
        'scripts/challenge-results.mjs', 'scripts/score-challenges.mjs',
        'scripts/scoring-workspace.mjs', batch.manifestPath,
        ...batch.cases.flatMap(entry => [entry.recipe, entry.recording])];
    if (git(root, ['status', '--porcelain', '--untracked-files=all', '--', ...paths]))
        throw new Error('commit challenge inputs, scorer, and game changes before evaluating');
    return { sha: git(root, ['rev-parse', 'HEAD']), snapshot };
}

export function measuredCases(root, manifest, bundle) {
    if (bundle.results.length !== manifest.cases.length) throw new Error('runner did not return every challenge');
    const results = new Map(bundle.results.map(result => [result.session, result]));
    if (results.size !== manifest.cases.length) throw new Error('runner returned duplicate challenges');
    return manifest.cases.map(entry => {
        const result = results.get(`${entry.id}.session.json`);
        const recording = normalizeSession(JSON.parse(readFileSync(challengePath(root, entry.recording), 'utf8')));
        const screensTotal = recording.segments.flatMap(segment => segment.steps).filter(step => step.screen).length;
        if (!result || !screensTotal || result.metrics?.screens?.total !== screensTotal
            || result.metrics?.cursors?.total !== screensTotal)
            throw new Error(`runner did not measure ${entry.id}: ${result?.error || 'incomplete output'}`);
        return { id: entry.id, recordingSha256: entry.recordingSha256, passed: result.passed,
            metrics: { screens: result.metrics.screens, rng: result.metrics.rngCalls, cursors: result.metrics.cursors },
            error: result.error ?? null };
    });
}

export function recordEvaluation(root, relative) {
    const evaluation = readEvaluation(root, relative);
    const rows = readRows(join(root, 'SCORE.tsv'));
    const batch = evaluationBatch(evaluation);
    const previous = rows.filter(row => row.event === 'challenge')
        .map(row => ({ row, evaluation: readEvaluation(root, row.challenge_evaluation) }))
        .filter(entry => evaluationBatch(entry.evaluation) === batch).at(-1)?.evaluation;
    if (previous && Date.parse(previous.utc) > Date.parse(evaluation.utc))
        throw new Error('record evaluations in measurement order so first results remain first');
    if (rows.some(row => row.challenge_evaluation === relative)) throw new Error('evaluation is already recorded');
    const manifest = readChallengeBatches(root).find(entry => entry.batch === batch);
    if (!manifest) throw new Error('evaluation references an unadmitted challenge batch: ' + batch);
    const known = new Map(manifest.cases.map(entry => [entry.id, entry.recordingSha256]));
    for (const row of rows.filter(row => row.event === 'challenge')) {
        const rowEvaluation = readEvaluation(root, row.challenge_evaluation);
        if (evaluationBatch(rowEvaluation) !== batch) continue;
        if (rowEvaluation.cases.some(entry => known.get(entry.id) !== entry.recordingSha256))
            throw new Error('a previously measured challenge was removed or changed; restore it and add a new case');
    }
    if (evaluation.cases.some(entry => known.get(entry.id) !== entry.recordingSha256))
        throw new Error('evaluation contains an unknown or changed challenge');
    // First imported pilot evidence predates admission. Preserve its actual SHA
    // and measurement time; ledger utc separately records when it was admitted.
    const note = evaluation.status === 'complete'
        ? `Challenges ${evaluation.totals.screens.matched}/${evaluation.totals.screens.total} screens; ${evaluation.totals.sessions.matched}/${evaluation.totals.sessions.total} sessions. Measured ${evaluation.utc}.`
        : `Challenge evaluation failed. Measured ${evaluation.utc}; see saved artifact.`;
    return appendRow({ ...evaluationFields(relative, evaluation), note }, join(root, 'SCORE.tsv'));
}

export function evaluateChallenges(root, relative, batchId = 'v1') {
    const manifest = readChallengeBatches(root).find(entry => entry.batch === batchId);
    if (!manifest) throw new Error('unknown challenge batch: ' + batchId);
    const inputs = committedInputs(root, manifest);
    const sha = inputs.sha;
    if (!manifest.cases.length) throw new Error('no challenges in the manifest');
    const output = challengePath(root, relative);
    if (!/^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/u.test(relative) || existsSync(output))
        throw new Error('choose a new challenges/evaluations/<name>.json path');
    mkdirSync(challengePath(root, 'challenges/evaluations'), { recursive: true });
    const scorer = scorerIdentity(root);
    const evaluation = { version: 1, batch: batchId, manifestPath: manifest.manifestPath,
        sha, utc: new Date().toISOString(), status: 'complete',
        manifestSha256: manifest.manifestSha256, scorerSha256: scorer.sha256, scorerFiles: scorer.files,
        inputsSha256: inputs.snapshot.sha256,
        inputFiles: inputs.snapshot.files.map(entry => entry.path),
        cases: [], totals: null };
    const flat = mkdtempSync(join(localTmpdir(), 'teleport-challenges-'));
    let workspace;
    try {
        for (const entry of manifest.cases)
            cpSync(challengePath(root, entry.recording), join(flat, `${entry.id}.session.json`));
        workspace = createScoringWorkspace(flat, manifest.cases.map(entry => `${entry.id}.session.json`));
        const child = runScorer(workspace);
        if (child.error || child.status !== 0) throw new Error(`runner failed: ${child.error?.message || child.stderr}`);
        evaluation.cases = measuredCases(root, manifest, parseRunnerBundle(child.stdout));
        evaluation.totals = totalsFor(evaluation.cases);
    } catch (error) {
        evaluation.status = 'failed';
        evaluation.error = error.message;
        evaluation.cases = manifest.cases.map(({ id, recordingSha256 }) => ({ id, recordingSha256 }));
    } finally {
        if (workspace) removeScoringWorkspace(workspace);
        rmSync(flat, { recursive: true, force: true });
    }
    const after = committedInputs(root, manifest);
    if (after.sha !== sha || after.snapshot.sha256 !== inputs.snapshot.sha256
        || corpusDigest(manifest.cases) !== manifest.manifestSha256)
        throw new Error('inputs changed during scoring; no evidence was saved');
    saveEvaluation(root, relative, evaluation);
    return evaluation;
}

export function runAllBatches(root, outputDir, {
    batches = readChallengeBatches(root),
    evaluate = evaluateChallenges,
    readHead = () => git(root, ['rev-parse', 'HEAD']),
    stamp = new Date().toISOString().replaceAll(/[-:TZ.]/gu, '').slice(0, 14),
} = {}) {
    if (!batches.length) throw new Error('no admitted challenge batches to evaluate');
    const expectedHead = readHead();
    const results = [];
    const failures = [];
    for (const selected of batches) {
        const before = readHead();
        if (before !== expectedHead)
            throw new Error('repository HEAD changed during --all; no mixed-batch evaluation is valid');
        const relative = outputDir.replace(/\/$/u, '') + '/' + stamp + '-' + selected.batch + '.json';
        try {
            const result = evaluate(root, relative, selected.batch);
            if (result.sha !== expectedHead)
                throw new Error('batch evaluation used a different HEAD: ' + selected.batch);
            results.push({ batch: selected.batch, relative, result });
            if (result.status === 'failed')
                failures.push({ batch: selected.batch, relative, error: result.error ?? 'evaluation failed' });
        } catch (error) {
            failures.push({ batch: selected.batch, relative, error: error.message });
        }
        if (readHead() !== expectedHead)
            throw new Error('repository HEAD changed during --all; no mixed-batch evaluation is valid');
    }
    return { expectedHead, results, failures };
}

function main(args) {
    if (args.length === 1 && args[0] === '--help') {
        console.log('score-challenges --output challenges/evaluations/<name>.json\n'
            + 'score-challenges --batch vN --output challenges/evaluations/<name>.json\n'
            + 'score-challenges --all --output-dir challenges/evaluations\n'
            + 'score-challenges --record challenges/evaluations/<name>.json\n'
            + 'Commit inputs before scoring. --record appends saved evidence to SCORE.tsv.');
        return;
    }
    if (args[0] === '--record') {
        if (args.length !== 2) throw new Error('use --record <saved artifact>; see --help');
        const row = recordEvaluation(PROJECT_ROOT, args[1]);
        console.log(row.note);
        return;
    }
    let batch = 'v1';
    let output = null;
    let outputDir = null;
    let all = false;
    for (let index = 0; index < args.length; index++) {
        if (args[index] === '--batch') batch = args[++index];
        else if (args[index] === '--output') output = args[++index];
        else if (args[index] === '--output-dir') outputDir = args[++index];
        else if (args[index] === '--all') all = true;
        else throw new Error('unknown option: ' + args[index] + '; see --help');
    }
    if (all) {
        if (batch !== 'v1' || output || !outputDir) throw new Error('--all requires --output-dir only');
        const run = runAllBatches(PROJECT_ROOT, outputDir);
        for (const item of run.results)
            console.log(item.result.status + ': ' + item.relative + ' at ' + item.result.sha);
        for (const failure of run.failures)
            console.error(failure.batch + ': ' + failure.error + ' (' + failure.relative + ')');
        if (run.failures.length) process.exitCode = 1;
        return;
    }
    if (!output || outputDir) throw new Error('use --output <new artifact>; see --help');
    const result = evaluateChallenges(PROJECT_ROOT, output, batch);
    console.log(result.status + ': ' + output + ' at ' + result.sha);
    if (result.status === 'failed') { console.error(result.error); process.exitCode = 1; }
    else console.log(JSON.stringify(result.totals));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(`score-challenges: ${error.message}`); process.exitCode = 1; }
}
