#!/usr/bin/env node
// Print a compact report of the archived checkpoint result for one commit:
// each check's verdict, the regression-recording and fixed-session totals,
// the synthetic totals, and every failing synthetic case with its metrics.
//
// Usage: node scripts/checkpoint-report.mjs [revision] [--json]
//
// Reads <git common dir>/checkpoint-results/<commit>/latest.json, which
// `npm run checkpoint` and `scripts/fetch-hosted-checkpoint.mjs` write.
// Synthetic results exist only for hosted runs.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkpointResultsDirectory } from './checkpoint-results.mjs';

const METRICS = ['screens', 'rng', 'cursors'];

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
export function summarizeSynthetic(evaluations) {
    const totals = { cases: 0, passing: 0, batches: evaluations.length };
    for (const metric of METRICS) totals[metric] = [0, 0];
    const failing = [];
    for (const evaluation of evaluations) {
        for (const c of evaluation.cases) {
            totals.cases++;
            if (c.passed) totals.passing++;
            else failing.push({ batch: evaluation.batch, id: c.id, metrics: c.metrics, error: c.error });
            for (const metric of METRICS) {
                totals[metric][0] += c.metrics?.[metric]?.matched ?? 0;
                totals[metric][1] += c.metrics?.[metric]?.total ?? 0;
            }
        }
    }
    failing.sort((a, b) => a.id.localeCompare(b.id));
    return { totals, failing };
}

export function summarizeCheckpoint(summary, evaluations) {
    return {
        commit: summary.commit,
        timestamp: summary.timestamp,
        hostedRun: summary.hostedRun ?? null,
        allPassed: summary.allPassed,
        checks: (summary.results ?? []).map(({ label, passed, informational, skipped }) =>
            ({ label, passed, informational, skipped })),
        recordings: parseRecordingSummary(summary.recordings?.summary),
        fixed: summary.score ?? null,
        synthetic: evaluations.length ? summarizeSynthetic(evaluations) : null,
    };
}

// Older or partial summaries can lack a field; show '?' rather than fail.
const n = (value) => (typeof value === 'number' ? value.toLocaleString('en-US') : '?');
const pair = ([matched, total]) => `${n(matched)}/${n(total)}`;

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
        const t = s.totals;
        lines.push(`Synthetic: ${n(t.passing)}/${n(t.cases)} cases passing in ${t.batches} batches; `
            + `screens ${pair(t.screens)}; rng ${pair(t.rng)}; cursors ${pair(t.cursors)}`);
        for (const c of s.failing) {
            const m = METRICS.map((k) => `${k} ${c.metrics?.[k]?.matched}/${c.metrics?.[k]?.total}`).join(', ');
            lines.push(`  FAIL ${c.id}: ${m}${c.error ? `; error: ${c.error}` : ''}`);
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
    const syntheticDir = summary.artifacts && join(summary.artifacts, 'synthetic');
    const evaluations = syntheticDir && existsSync(syntheticDir)
        ? readdirSync(syntheticDir).filter((f) => f.endsWith('.json')).sort()
            .map((f) => JSON.parse(readFileSync(join(syntheticDir, f), 'utf8')))
        : [];
    return summarizeCheckpoint(summary, evaluations);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const rest = args.filter((a) => a !== '--json');
    if (rest.length > 1) throw new Error('usage: checkpoint-report.mjs [revision] [--json]');
    const report = loadCheckpoint(rest[0]);
    console.log(json ? JSON.stringify(report, null, 1) : formatCheckpointReport(report));
}
