#!/usr/bin/env node
/**
 * Candidate pipeline: ranks goal candidates and looks up cached metadata.
 *
 * The ranking is computed fresh from scan data + caps on every call.
 * Agent-produced metadata (witnesses, detail, owners, boundary description)
 * is cached in candidate-metadata.json, keyed by member string (the scan's
 * divergence boundary).
 *
 * Modes:
 *   --ready-winner     print the top candidate with metadata, or null
 *   --needs-capping    list sessions with stale caps
 *   --status           print readiness summary
 *   --advance          report what needs capping and witnessing
 *   --set-metadata     read JSON from stdin, store metadata for its member
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadAnnotatedRows, cappedRanking } from './scan-sessions.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, '..');
const CACHE_DIR = join(PROJECT_ROOT, '.cache');
const METADATA_PATH = join(CACHE_DIR, 'candidate-metadata.json');
const GOALS_PATH = join(PROJECT_ROOT, 'GOALS.json');

function readMetadata() {
    if (!existsSync(METADATA_PATH)) return {};
    try {
        return JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function writeMetadata(metadata) {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
        METADATA_PATH,
        JSON.stringify(metadata, null, 2) + '\n',
    );
}

function toKebab(member) {
    return member
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
}

function readClosedGoalIds() {
    if (!existsSync(GOALS_PATH)) return new Set();
    try {
        const data = JSON.parse(readFileSync(GOALS_PATH, 'utf8'));
        const goals = data.goals ?? data;
        return new Set(
            goals.filter((g) => g.status === 'closed').map((g) => g.id),
        );
    } catch {
        return new Set();
    }
}

function generateId(member, metadata) {
    const existing = metadata?.[member]?.id;
    if (existing) return existing;
    const base = toKebab(member);
    const closed = readClosedGoalIds();
    if (!closed.has(base)) return base;
    for (let i = 2; i <= 100; i++) {
        const suffixed = `${base.slice(0, 56)}-${i}`;
        if (!closed.has(suffixed)) return suffixed;
    }
    return base;
}

function annotateWithMetadata(candidate, metadata) {
    const meta = metadata[candidate.member];
    return {
        member: candidate.member,
        id: generateId(candidate.member, metadata),
        cappedForecast: candidate.cappedForecast,
        sessions: candidate.sessions,
        witnesses: meta?.witnesses ?? [],
        detail: meta?.detail ?? null,
        owners: meta?.owners ?? null,
        boundary: meta?.boundary ?? null,
    };
}

function isReady(annotated) {
    return annotated.witnesses.length > 0
        && annotated.detail
        && annotated.sessions.every(
            (s) => s.capStable || s.divergenceZeroed,
        );
}

async function readyWinner() {
    const rows = await loadAnnotatedRows();
    const ranked = cappedRanking(rows);
    const metadata = readMetadata();

    for (const candidate of ranked) {
        if (candidate.cappedForecast <= 0) continue;
        const annotated = annotateWithMetadata(candidate, metadata);
        if (isReady(annotated)) {
            console.log(JSON.stringify({ winner: annotated }, null, 2));
            return;
        }
    }

    const top = ranked.find((c) => c.cappedForecast > 0);
    const topCandidate = top
        ? annotateWithMetadata(top, metadata)
        : null;
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
    const metadata = readMetadata();

    const candidates = ranked.filter((c) => c.cappedForecast > 0);
    if (candidates.length === 0) {
        console.log('No candidates with nonzero forecast.');
        return;
    }

    for (const candidate of candidates) {
        const annotated = annotateWithMetadata(candidate, metadata);
        const ready = isReady(annotated);
        const allCapped = candidate.sessions.every(
            (s) => s.capStable || s.divergenceZeroed,
        );
        const label = ready ? 'ready'
            : allCapped ? 'needs witnesses'
            : 'needs capping';
        console.log(
            `  ${annotated.id}`
            + `  fc=${candidate.cappedForecast}`
            + `  sess=${candidate.sessions.length}`
            + `  wit=${annotated.witnesses.length}`
            + `  [${label}]`,
        );
    }
}

async function advance() {
    const rows = await loadAnnotatedRows();
    const ranked = cappedRanking(rows);
    const metadata = readMetadata();

    const candidates = ranked.filter((c) => c.cappedForecast > 0);
    const needsCappingList = [];
    const needsWitnessList = [];
    let readyCount = 0;

    for (const candidate of candidates) {
        const annotated = annotateWithMetadata(candidate, metadata);
        if (isReady(annotated)) {
            readyCount++;
            continue;
        }
        const allCapped = candidate.sessions.every(
            (s) => s.capStable || s.divergenceZeroed,
        );
        if (!allCapped) {
            for (const s of candidate.sessions) {
                if (!s.capStable && !s.divergenceZeroed) {
                    needsCappingList.push({
                        session: s.session,
                        boundary: candidate.member,
                    });
                }
            }
        } else {
            needsWitnessList.push({
                member: candidate.member,
                id: annotated.id,
                sessions: candidate.sessions.map((s) => s.session),
                cappedForecast: candidate.cappedForecast,
            });
        }
    }

    const activeMembers = new Set(candidates.map((c) => c.member));
    let purged = 0;
    for (const key of Object.keys(metadata)) {
        if (!activeMembers.has(key)) {
            delete metadata[key];
            purged++;
        }
    }
    if (purged > 0) writeMetadata(metadata);

    console.log(JSON.stringify({
        total: candidates.length,
        ready: readyCount,
        needsCapping: needsCappingList,
        needsWitness: needsWitnessList,
        purged,
    }, null, 2));
}

async function setMetadata() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());

    if (!input.member) throw new Error('metadata must include "member"');

    const metadata = readMetadata();
    metadata[input.member] = {
        id: input.id ?? generateId(input.member, metadata),
        witnesses: input.witnesses ?? [],
        detail: input.detail ?? null,
        owners: input.owners ?? null,
        boundary: input.boundary ?? null,
        producedAt: input.producedAt ?? null,
    };
    writeMetadata(metadata);
    console.log(JSON.stringify({
        stored: input.member,
        id: metadata[input.member].id,
    }));
}

async function main(args) {
    if (args.includes('--help') || args.includes('-h')) {
        console.log(
            'Usage: node scripts/pipeline-candidates.mjs <mode>\n'
            + '\n  --ready-winner     print the top candidate with'
            + ' metadata or {"winner": null}'
            + '\n  --needs-capping    list sessions with stale caps'
            + '\n  --status           print readiness summary'
            + '\n  --advance          report what needs capping'
            + ' and witnessing'
            + '\n  --set-metadata     read JSON from stdin, store'
            + ' metadata for its member',
        );
        return;
    }

    const modes = [
        '--ready-winner', '--needs-capping', '--status',
        '--advance', '--set-metadata',
    ];
    const selected = modes.filter((m) => args.includes(m));
    if (selected.length === 0) {
        throw new Error(
            'specify one mode: --ready-winner, --needs-capping,'
            + ' --status, --advance, or --set-metadata',
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
    case '--set-metadata': return setMetadata();
    }
}

main(process.argv.slice(2)).catch((err) => {
    console.error(`Pipeline failed: ${err.message}`);
    process.exitCode = 1;
});
