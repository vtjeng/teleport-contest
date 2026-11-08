#!/usr/bin/env node
// Print a compact report of the archived checkpoint result for one commit:
// each check's verdict, the regression-recording and fixed-session totals,
// the synthetic totals, and every failing synthetic case with its metrics.
// Cases in challenges/invalid-references.json that fail exactly as listed are
// reported apart from port failures; see summarizeSynthetic().
//
// Usage: node scripts/checkpoint-report.mjs [revision] [--json]
//        node scripts/checkpoint-report.mjs --results <directory> [--json]
//
// Reads <git common dir>/checkpoint-results/<commit>/latest.json, which
// `npm run checkpoint` and `scripts/fetch-hosted-checkpoint.mjs` write.
// --results reads a combined checkpoint directory instead (summary.json
// beside synthetic/*.json), as the Checkpoint workflow's report job does.
// Synthetic results exist only for hosted runs.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkpointResultsDirectory } from './checkpoint-results.mjs';

const METRICS = ['screens', 'rng', 'cursors'];

// The single list of admitted synthetic cases whose recording, not the port,
// is wrong. Resolved from this script so every caller reads the same file.
export const INVALID_REFERENCES_PATH = 'challenges/invalid-references.json';
const INVALID_REFERENCES_URL = new URL(`../${INVALID_REFERENCES_PATH}`, import.meta.url);

export function readInvalidReferences(url = INVALID_REFERENCES_URL) {
    const list = JSON.parse(readFileSync(url, 'utf8'));
    if (list.version !== 1 || !Array.isArray(list.cases))
        throw new Error(`${INVALID_REFERENCES_PATH}: expected version 1 with a cases array`);
    const seen = new Set();
    for (const entry of list.cases) {
        const key = `${entry?.batch}/${entry?.id}`;
        const counts = METRICS.every((k) => Number.isSafeInteger(entry?.expected?.[k]?.matched)
            && Number.isSafeInteger(entry?.expected?.[k]?.total));
        if (typeof entry?.batch !== 'string' || typeof entry.id !== 'string' || !entry.cause
            || typeof entry.cause !== 'string' || !Array.isArray(entry.evidence) || !entry.evidence.length
            || !counts || seen.has(key))
            throw new Error(`${INVALID_REFERENCES_PATH}: malformed or duplicate entry ${key}`);
        seen.add(key);
    }
    return list.cases;
}

const sameMetrics = (metrics, expected) => METRICS.every((k) =>
    metrics?.[k]?.matched === expected[k].matched && metrics?.[k]?.total === expected[k].total);

// Recording stages each report "recordings: P/T passing, screens S/T, rng R/T";
// hosted runs join one such clause per shard with "; ".
export function parseRecordingSummary(text) {
    const total = { passing: 0, sessions: 0, screens: [0, 0], rng: [0, 0] };
    const pattern = /recordings: (\d+)\/(\d+) passing, screens (\d+)\/(\d+), rng (\d+)\/(\d+)/gu;
    let found = false;
    for (const m of String(text ?? '').matchAll(pattern)) {
        found = true;
        total.passing += Number(m[1]);
        total.sessions += Number(m[2]);
        total.screens[0] += Number(m[3]);
        total.screens[1] += Number(m[4]);
        total.rng[0] += Number(m[5]);
        total.rng[1] += Number(m[6]);
    }
    return found ? total : null;
}

// evaluations: parsed synthetic evaluation files ({batch, cases[{id, passed, metrics, error}]}).
// invalidReferences: the entries of challenges/invalid-references.json.
//
// A listed case is set apart (`invalid`) only while it fails with exactly the
// metrics its entry expects and no error. Otherwise it stays in the totals and
// is flagged in `listProblems`: 'matches' (it passes; remove the entry),
// 'changed' (a different failure, which also stays in `failing`), or
// 'missing' (no evaluation holds it). `totals` counts every case; `valid`
// leaves out only the `invalid` cases.
export function summarizeSynthetic(evaluations, invalidReferences = []) {
    const counts = () => ({ cases: 0, passing: 0, batches: evaluations.length,
        ...Object.fromEntries(METRICS.map((metric) => [metric, [0, 0]])) });
    const add = (into, c) => {
        into.cases++;
        if (c.passed) into.passing++;
        for (const metric of METRICS) {
            into[metric][0] += c.metrics?.[metric]?.matched ?? 0;
            into[metric][1] += c.metrics?.[metric]?.total ?? 0;
        }
    };
    const totals = counts();
    const valid = counts();
    const listed = new Map(invalidReferences.map((entry) => [`${entry.batch}/${entry.id}`, entry]));
    const found = new Set();
    const failing = [];
    const invalid = [];
    const listProblems = [];
    for (const evaluation of evaluations) {
        for (const c of evaluation.cases) {
            const result = { batch: evaluation.batch, id: c.id, metrics: c.metrics, error: c.error,
                segmentErrors: c.segmentErrors, terminationViolations: c.terminationViolations,
                planningLiveGameUses: c.planningLiveGameUses };
            const key = `${evaluation.batch}/${c.id}`;
            const entry = listed.get(key);
            let excluded = false;
            if (entry) {
                found.add(key);
                if (c.passed) listProblems.push({ ...result, problem: 'matches' });
                else if (c.error || !sameMetrics(c.metrics, entry.expected))
                    listProblems.push({ ...result, problem: 'changed', expected: entry.expected });
                else {
                    invalid.push({ ...result, cause: entry.cause, evidence: entry.evidence });
                    excluded = true;
                }
            }
            add(totals, c);
            if (!excluded) add(valid, c);
            if (!c.passed && !excluded) failing.push(result);
        }
    }
    for (const entry of invalidReferences)
        if (!found.has(`${entry.batch}/${entry.id}`))
            listProblems.push({ batch: entry.batch, id: entry.id, problem: 'missing' });
    for (const list of [failing, invalid, listProblems]) list.sort((a, b) => a.id.localeCompare(b.id));
    return { totals, valid, failing, invalid, listProblems };
}

// The list is read only when there are synthetic results to compare with it.
export function summarizeCheckpoint(summary, evaluations,
    invalidReferences = evaluations.length ? readInvalidReferences() : []) {
    return {
        commit: summary.commit,
        timestamp: summary.timestamp,
        hostedRun: summary.hostedRun ?? null,
        allPassed: summary.allPassed,
        checks: (summary.results ?? []).map(({ label, passed, informational, skipped }) =>
            ({ label, passed, informational, skipped })),
        recordings: parseRecordingSummary(summary.recordings?.summary),
        fixed: summary.score ?? null,
        synthetic: evaluations.length ? summarizeSynthetic(evaluations, invalidReferences) : null,
    };
}

// Older or partial summaries can lack a field; show '?' rather than fail.
const n = (value) => (typeof value === 'number' ? value.toLocaleString('en-US') : '?');
const pair = ([matched, total]) => `${n(matched)}/${n(total)}`;
const caseMetrics = (metrics) => METRICS.map((k) => `${k} ${metrics?.[k]?.matched}/${metrics?.[k]?.total}`).join(', ');
// scripts/scoring-workspace.mjs runScorer() names each crash the judge's
// runSegment() ended a segment on.
const crashText = (c) => (c.segmentErrors?.length
    ? `; crashed: ${c.segmentErrors.map(({ name, message }) => `${name}: ${message}`).join('; ')}` : '')
    + (c.terminationViolations?.length
        ? `; ran after termination: ${c.terminationViolations
            .map(({ kind, detail }) => `${kind}: ${detail}`).join('; ')}` : '')
    + (c.planningLiveGameUses?.length
        ? `; youprop.js argument uses: ${c.planningLiveGameUses
            .map(({ detail, count }) => `${detail} (${count}x)`).join('; ')}` : '');
const LIST_PROBLEMS = {
    matches: () => 'listed as an invalid reference but now matches; remove its entry',
    changed: (c) => `listed as an invalid reference but its result changed; expected ${caseMetrics(c.expected)}, `
        + `got ${caseMetrics(c.metrics)}${c.error ? `; error: ${c.error}` : ''}`,
    missing: () => 'listed as an invalid reference but no evaluation contains it',
};

export function formatCheckpointReport(report) {
    const lines = [];
    const where = report.hostedRun
        ? `hosted run ${report.hostedRun.id} attempt ${report.hostedRun.attempt}`
        : 'local run';
    lines.push(`Checkpoint ${report.commit.slice(0, 9)} (${where}, ${report.timestamp}): ${report.allPassed ? 'PASS' : 'FAIL'}`);
    const failed = report.checks.filter((c) => !c.passed && !c.skipped && !c.informational);
    const skipped = report.checks.filter((c) => c.skipped);
    lines.push(`Checks: ${report.checks.length - failed.length - skipped.length}/${report.checks.length} passed`
        + (failed.length ? `; FAILED: ${failed.map((c) => c.label).join(', ')}` : '')
        + (skipped.length ? `; skipped: ${skipped.map((c) => c.label).join(', ')}` : ''));
    const r = report.recordings;
    if (r) lines.push(`Recordings: ${n(r.passing)}/${n(r.sessions)} passing; screens ${pair(r.screens)}; rng ${pair(r.rng)}`);
    const f = report.fixed;
    if (f) lines.push(`Fixed sessions: ${n(f.passing)}/${n(f.sessions)} passing; screens ${n(f.screensMatched)}/${n(f.screensTotal)}; `
        + `rng ${n(f.rngMatched)}/${n(f.rngTotal)}; cursors ${n(f.cursorsMatched)}/${n(f.cursorsTotal)}`);
    const s = report.synthetic;
    if (!s) {
        lines.push('Synthetic: not in this result (local runs do not evaluate synthetic batches)');
    } else {
        const totals = (t) => `screens ${pair(t.screens)}; rng ${pair(t.rng)}; cursors ${pair(t.cursors)}`;
        const v = s.valid;
        lines.push(`Synthetic: ${n(v.passing)}/${n(v.cases)} valid cases passing in ${v.batches} batches; ${totals(v)}`);
        lines.push(`Synthetic, all admitted cases: ${n(s.totals.passing)}/${n(s.totals.cases)} passing; ${totals(s.totals)}`);
        for (const c of s.failing)
            lines.push(`  FAIL ${c.id}: ${caseMetrics(c.metrics)}${c.error ? `; error: ${c.error}` : ''}${crashText(c)}`);
        if (s.invalid.length) {
            lines.push(`${s.invalid.length} invalid references (host-recorded or corrupted recordings), `
                + `not port defects; see ${INVALID_REFERENCES_PATH}:`);
            for (const c of s.invalid) lines.push(`  INVALID ${c.id}: ${caseMetrics(c.metrics)}; ${c.cause}`);
        }
        if (s.listProblems.length) {
            lines.push(`Invalid-reference list needs attention: ${s.listProblems.length} `
                + `${s.listProblems.length === 1 ? 'entry' : 'entries'} in ${INVALID_REFERENCES_PATH}`);
            for (const c of s.listProblems) lines.push(`  CHECK ${c.id}: ${LIST_PROBLEMS[c.problem](c)}`);
        }
    }
    return lines.join('\n');
}

export function loadCheckpoint(revision = 'HEAD', root = process.cwd()) {
    const commit = execFileSync('git', ['rev-parse', '--verify', `${revision}^{commit}`],
        { cwd: root, encoding: 'utf8' }).trim();
    const latest = join(checkpointResultsDirectory(root), commit, 'latest.json');
    if (!existsSync(latest))
        throw new Error(`no archived checkpoint for ${commit}; run npm run checkpoint or import a hosted run`);
    const summary = JSON.parse(readFileSync(latest, 'utf8'));
    return summarizeCheckpoint(summary, readEvaluations(summary.artifacts && join(summary.artifacts, 'synthetic')));
}

// A combined checkpoint directory: summary.json beside synthetic/*.json.
export function loadCheckpointResults(directory) {
    const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
    return summarizeCheckpoint(summary, readEvaluations(join(directory, 'synthetic')));
}

function readEvaluations(syntheticDir) {
    return syntheticDir && existsSync(syntheticDir)
        ? readdirSync(syntheticDir).filter((f) => f.endsWith('.json')).sort()
            .map((f) => JSON.parse(readFileSync(join(syntheticDir, f), 'utf8')))
        : [];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const usage = 'usage: checkpoint-report.mjs [revision] [--json] | --results <directory> [--json]';
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const rest = args.filter((a) => a !== '--json');
    const results = rest[0] === '--results';
    if (results ? rest.length !== 2 : rest.length > 1) throw new Error(usage);
    const report = results ? loadCheckpointResults(rest[1]) : loadCheckpoint(rest[0]);
    console.log(json ? JSON.stringify(report, null, 1) : formatCheckpointReport(report));
}
