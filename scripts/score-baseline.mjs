#!/usr/bin/env node

// The per-session score ratchet.
//
// Every screen this port draws matches C, because it fail-closes rather than
// guessing at unported behavior: `scripts/scan-debt.mjs` and
// `scripts/score-development.mjs` agree on the emitted and matched counts. So a
// session's matched total can only fall by the port emitting fewer screens,
// which means stopping earlier than it used to. That is worth a human's
// attention whether the cause is a regression or a newly discovered refusal
// that is correct and expensive, so the checkpoint fails on it and names the
// sessions.
//
// The ratchet is per session rather than over the totals. A change that gains
// ten screens in one session and loses nine in another reports +1 over the
// totals and hides the loss; per session it reports the loss.
//
// Raising is monotone: `raiseBaseline()` takes the maximum, so running it after
// a checkpoint can only advance the ratchet. Lowering is deliberate and needs a
// reason, which `lowerBaseline()` appends to the session's own record. Nothing
// here is deferred work: a lowering is a closed fact, so it lives beside the
// number it explains rather than in `ROADMAP.md`.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECT_ROOT } from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const BASELINE_PATH = join(PROJECT_ROOT, 'score-baseline.json');

// The two metrics the ratchet holds. `screens` is what the scorer reports and
// `rngCalls` is the finer signal: a session can keep its screens while losing
// random-number matches, which means the state behind the screens drifted.
export const RATCHET_METRICS = Object.freeze(['screens', 'rngCalls']);

/** Per-session matched counts, read from score-development.mjs's JSON. */
export function currentFromResults(results) {
    const current = {};
    for (const result of results) {
        current[result.session] = {};
        for (const metric of RATCHET_METRICS)
            current[result.session][metric] = result.metrics?.[metric]?.matched ?? 0;
    }
    return current;
}

/**
 * Every session that matched fewer than its baseline, with the shortfall.
 *
 * A session absent from the baseline is new and cannot have dropped; a session
 * absent from the current run was not scored and is reported separately, since
 * silently passing a session that stopped being scored would defeat the point.
 */
export function compareToBaseline(current, baseline) {
    const drops = [];
    const missing = [];
    for (const [session, expected] of Object.entries(baseline)) {
        const actual = current[session];
        if (!actual) { missing.push(session); continue; }
        for (const metric of RATCHET_METRICS) {
            const was = expected[metric] ?? 0;
            const now = actual[metric] ?? 0;
            if (now < was) drops.push({ session, metric, was, now });
        }
    }
    return { drops, missing };
}

/** Advance the ratchet. Takes the maximum, so this can never lower a figure. */
export function raiseBaseline(baseline, current) {
    const next = {};
    for (const session of new Set([
        ...Object.keys(baseline), ...Object.keys(current),
    ])) {
        const was = baseline[session] ?? {};
        const now = current[session] ?? {};
        next[session] = { ...was };
        for (const metric of RATCHET_METRICS)
            next[session][metric] = Math.max(was[metric] ?? 0, now[metric] ?? 0);
    }
    return next;
}

/**
 * Lower one session's figures deliberately, recording why.
 *
 * The reason is stored beside the number rather than in `ROADMAP.md`, because a
 * lowering is not outstanding work: the port became more correct and a session
 * earns fewer screens. Someone later asking why a baseline sits below what the
 * history suggests finds the answer in the same record, and a session lowered
 * repeatedly shows that as a list.
 */
export function lowerBaseline(baseline, session, figures, reason, commit) {
    if (!baseline[session])
        throw new Error(`no baseline for session: ${session}`);
    if (typeof reason !== 'string' || reason.trim().length === 0)
        throw new Error('lowering the baseline needs a reason');
    const was = baseline[session];
    const lowerings = [...(was.lowerings ?? [])];
    for (const metric of RATCHET_METRICS) {
        const to = figures[metric];
        if (to === undefined || to === (was[metric] ?? 0)) continue;
        if (to > (was[metric] ?? 0))
            throw new Error(`${metric} would rise; use the raise path`);
        lowerings.push({
            metric, from: was[metric] ?? 0, to, commit, reason: reason.trim(),
        });
    }
    if (lowerings.length === (was.lowerings ?? []).length)
        throw new Error('nothing to lower');
    const next = { ...baseline };
    next[session] = { ...was, lowerings };
    for (const metric of RATCHET_METRICS)
        if (figures[metric] !== undefined) next[session][metric] = figures[metric];
    return next;
}

export function readBaseline(path = BASELINE_PATH) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        throw error;
    }
}

export function writeBaseline(baseline, path = BASELINE_PATH) {
    const ordered = {};
    for (const session of Object.keys(baseline).sort())
        ordered[session] = baseline[session];
    writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
}

/** One line per drop, for the checkpoint's summary line. */
export function describeDrops({ drops, missing }) {
    const parts = drops.map(
        ({ session, metric, was, now }) =>
            `${session} ${metric} ${was} -> ${now}`,
    );
    for (const session of missing) parts.push(`${session} was not scored`);
    return parts.join('; ');
}

function usage() {
    return 'usage: score-baseline.mjs raise <results.json>\n'
        + '       score-baseline.mjs lower <session> <screens> <rngCalls> '
        + '<commit> <reason...>';
}

export function main(args) {
    const [verb, ...rest] = args;
    if (verb === 'raise') {
        const [resultsPath] = rest;
        if (!resultsPath) throw new Error(usage());
        const { results } = JSON.parse(readFileSync(resultsPath, 'utf8'));
        const next = raiseBaseline(readBaseline(), currentFromResults(results));
        writeBaseline(next);
        console.log(`raised the baseline over ${Object.keys(next).length} session(s)`);
        return;
    }
    if (verb === 'lower') {
        const [session, screens, rngCalls, commit, ...reason] = rest;
        if (!session || !commit || reason.length === 0) throw new Error(usage());
        const next = lowerBaseline(readBaseline(), session,
            { screens: Number(screens), rngCalls: Number(rngCalls) },
            reason.join(' '), commit);
        writeBaseline(next);
        console.log(`lowered ${session}; the reason is recorded beside it`);
        return;
    }
    throw new Error(usage());
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 2;
    }
}
