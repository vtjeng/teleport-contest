#!/usr/bin/env node
/**
 * Candidate pipeline: tracks goal candidates through readiness stages.
 *
 * Readiness levels:
 *   "uncapped"  — at least one session has a stale or missing cap
 *   "capped"    — all sessions capped, no witnesses yet
 *   "witnessed" — all sessions capped and witnessed, detail traced
 *
 * Modes:
 *   --ready-winner     deterministic: print the top witnessed candidate or null
 *   --needs-capping    deterministic: list sessions with stale caps
 *   --status           deterministic: print readiness summary for all candidates
 *   --advance          spawn agents to cap and witness (not yet implemented)
 *
 * Ported from scan-sessions.mjs --winner and --needs-capping.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadAnnotatedRows, cappedRanking } from './scan-sessions.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, '..');
const CACHE_DIR = join(PROJECT_ROOT, '.cache');
const PIPELINE_PATH = join(CACHE_DIR, 'candidate-pipeline.json');
const GOAL_CONTEXT_PATH = join(CACHE_DIR, 'goal-context.json');

function readPipeline() {
    if (!existsSync(PIPELINE_PATH)) return [];
    try {
        return JSON.parse(readFileSync(PIPELINE_PATH, 'utf8'));
    } catch {
        return [];
    }
}

function readGoalContext() {
    if (!existsSync(GOAL_CONTEXT_PATH)) return null;
    try {
        return JSON.parse(readFileSync(GOAL_CONTEXT_PATH, 'utf8'));
    } catch {
        return null;
    }
}

function writePipeline(entries) {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
        PIPELINE_PATH,
        JSON.stringify(entries, null, 2) + '\n',
    );
}

function toKebab(member) {
    return member
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
}

/**
 * Reconcile the pipeline file against a fresh capped ranking.  Seeds
 * from goal-context.json when a candidate matches its boundary and
 * sessions.  Returns the updated pipeline entries (not yet written).
 */
function reconcile(ranked, existing) {
    const byMember = new Map();
    for (const entry of existing) byMember.set(entry.member, entry);

    const goalCtx = readGoalContext();
    const goalSessions = (goalCtx?.sessions ?? []).sort().join(',');

    if (goalCtx?.witnesses?.length > 0) {
        for (const candidate of ranked) {
            const candidateSessions = candidate.sessions
                .map((s) => s.session).sort();
            if (candidateSessions.join(',') !== goalSessions)
                continue;
            const prev = byMember.get(candidate.member);
            if (prev?.readiness === 'witnessed') continue;
            byMember.set(candidate.member, {
                member: candidate.member,
                id: goalCtx.id ?? prev?.id ?? toKebab(candidate.member),
                cappedForecast: candidate.cappedForecast,
                sessions: candidate.sessions,
                witnesses: goalCtx.witnesses,
                detail: goalCtx.detail ?? prev?.detail ?? null,
                owners: goalCtx.owners ?? prev?.owners ?? null,
                boundary: goalCtx.boundary ?? prev?.boundary ?? null,
                readiness: 'witnessed',
                lastUpdatedSha: prev?.lastUpdatedSha ?? null,
            });
        }
    }

    const updated = [];
    for (const candidate of ranked) {
        if (candidate.cappedForecast <= 0) continue;

        const prev = byMember.get(candidate.member);

        // The current goal matches goal-context.json; preserve its
        // readiness regardless of cap stability.
        const candidateSessions = candidate.sessions
            .map((s) => s.session).sort().join(',');
        if (goalSessions && candidateSessions === goalSessions
            && prev?.readiness === 'witnessed') {
            updated.push(prev);
            continue;
        }

        const sessionNames = candidate.sessions.map((s) => s.session).sort();
        const allCapStable = candidate.sessions.every(
            (s) => s.capStable || s.divergenceZeroed,
        );

        if (!prev) {
            updated.push({
                member: candidate.member,
                id: toKebab(candidate.member),
                cappedForecast: candidate.cappedForecast,
                sessions: candidate.sessions,
                witnesses: [],
                detail: null,
                owners: null,
                boundary: null,
                readiness: allCapStable ? 'capped' : 'uncapped',
                lastUpdatedSha: null,
            });
            continue;
        }

        const prevSessionNames = (prev.sessions ?? [])
            .map((s) => (typeof s === 'string' ? s : s.session))
            .sort();
        const sessionsChanged = sessionNames.join(',')
            !== prevSessionNames.join(',');

        let readiness = prev.readiness;
        let witnesses = prev.witnesses ?? [];
        let detail = prev.detail;
        let owners = prev.owners;
        let boundary = prev.boundary;

        if (!allCapStable) {
            readiness = 'uncapped';
            witnesses = [];
            detail = null;
            owners = null;
            boundary = null;
        } else if (sessionsChanged) {
            const witnessedSessions = new Set(
                witnesses.map((w) => w.session),
            );
            const allWitnessed = sessionNames.every((s) =>
                witnessedSessions.has(s),
            );
            if (!allWitnessed || !detail) {
                readiness = 'capped';
            }
        }

        updated.push({
            member: candidate.member,
            id: prev.id ?? toKebab(candidate.member),
            cappedForecast: candidate.cappedForecast,
            sessions: candidate.sessions,
            witnesses,
            detail,
            owners,
            boundary,
            readiness,
            lastUpdatedSha: prev.lastUpdatedSha,
        });
    }

    return updated.sort(
        (a, b) => b.cappedForecast - a.cappedForecast
            || b.sessions.length - a.sessions.length
            || a.member.localeCompare(b.member),
    );
}

async function readyWinner() {
    const rows = await loadAnnotatedRows();
    const ranked = cappedRanking(rows);
    const pipeline = reconcile(ranked, readPipeline());
    writePipeline(pipeline);

    const winner = pipeline.find(
        (e) => e.readiness === 'witnessed' && e.cappedForecast > 0,
    ) ?? null;
    if (winner) {
        console.log(JSON.stringify({ winner }, null, 2));
        return;
    }
    const topCandidate = pipeline.find(
        (e) => e.cappedForecast > 0,
    ) ?? null;
    console.log(JSON.stringify({ winner: null, topCandidate }, null, 2));
}

async function needsCapping() {
    const rows = await loadAnnotatedRows();
    const ranked = cappedRanking(rows);
    const list = ranked.flatMap((c) =>
        c.sessions
            .filter((s) => !s.capStable && !s.divergenceZeroed)
            .map((s) => ({ session: s.session, boundary: c.member })),
    );
    console.log(JSON.stringify({ needsCapping: list }, null, 2));
}

async function status() {
    const rows = await loadAnnotatedRows();
    const ranked = cappedRanking(rows);
    const pipeline = reconcile(ranked, readPipeline());
    writePipeline(pipeline);

    if (pipeline.length === 0) {
        console.log('No candidates with nonzero forecast.');
        return;
    }

    const label = { witnessed: 'ready', capped: 'needs witnesses', uncapped: 'needs capping' };
    for (const entry of pipeline) {
        const sessCount = entry.sessions.length;
        const witCount = (entry.witnesses ?? []).length;
        console.log(
            `  ${entry.id}`
            + `  fc=${entry.cappedForecast}`
            + `  sess=${sessCount}`
            + `  wit=${witCount}`
            + `  [${label[entry.readiness] ?? entry.readiness}]`,
        );
    }
}

async function advance() {
    const rows = await loadAnnotatedRows();
    const ranked = cappedRanking(rows);
    const pipeline = reconcile(ranked, readPipeline());
    writePipeline(pipeline);

    const uncapped = pipeline.filter((e) => e.readiness === 'uncapped');
    const capped = pipeline.filter((e) => e.readiness === 'capped');

    console.log(JSON.stringify({
        total: pipeline.length,
        uncapped: uncapped.length,
        capped: capped.length,
        witnessed: pipeline.length - uncapped.length - capped.length,
        needsCapping: uncapped.flatMap((e) =>
            e.sessions
                .filter((s) => !s.capStable && !s.divergenceZeroed)
                .map((s) => ({ session: s.session, boundary: e.member })),
        ),
        needsWitness: capped.slice(0, 3).map((e) => e.member),
    }, null, 2));
}

async function main(args) {
    if (args.includes('--help') || args.includes('-h')) {
        console.log(
            'Usage: node scripts/pipeline-candidates.mjs <mode>\n'
            + '\n  --ready-winner     print the top witnessed candidate'
            + ' or {"winner": null}'
            + '\n  --needs-capping    list sessions with stale caps'
            + '\n  --status           print readiness summary and'
            + ' reconcile the pipeline file'
            + '\n  --advance          reconcile, report what needs'
            + ' capping and witnessing',
        );
        return;
    }

    const modes = ['--ready-winner', '--needs-capping', '--status', '--advance'];
    const selected = modes.filter((m) => args.includes(m));
    if (selected.length === 0) {
        throw new Error(
            'specify one mode: --ready-winner, --needs-capping,'
            + ' --status, or --advance',
        );
    }
    if (selected.length > 1) {
        throw new Error('specify exactly one mode');
    }

    switch (selected[0]) {
    case '--ready-winner': return readyWinner();
    case '--needs-capping': return needsCapping();
    case '--status': return status();
    case '--advance': return advance();
    }
}

main(process.argv.slice(2)).catch((err) => {
    console.error(`Pipeline failed: ${err.message}`);
    process.exitCode = 1;
});
