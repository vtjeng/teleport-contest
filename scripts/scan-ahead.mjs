#!/usr/bin/env node

// Prints the recorded message line of every step between a session's current
// stop and its next unmet behavior, for the sessions stopped first on one
// candidate boundary. "Rank by the look-ahead forecast" in
// `.agents/selection.md` hands each session's stream to a classifier
// subagent, which caps the session's forecast at the first message implying
// an unported or partially ported behavior inside the stretch.
//
// Sealed-holdout rule: the scanned directory is fixed to the development
// sessions, the same as scripts/scan-debt.mjs, and this script accepts no
// path argument, so it cannot be aimed at sessions/holdout/.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeSession } from '../frozen/session_loader.mjs';
import {
    DEVELOPMENT_DIR,
    attachBehaviors,
    scanSession,
} from './scan-debt.mjs';
import { recordedTopLine } from './scan-stops.mjs';
import { listSessionFiles } from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

/** Every recorded step of one session, flattened across its segments. */
export function recordedStepsFor(file) {
    const data = normalizeSession(
        JSON.parse(readFileSync(join(DEVELOPMENT_DIR, file), 'utf8')),
    );
    return data.segments.flatMap((segment) => segment.steps || []);
}

/**
 * The stretch a session replays next if its current stop is ported: from its
 * earliest unmet behavior to its second, or to the recording's end when no
 * second one is visible. Returns null for a session with no unmet behavior.
 */
export function aheadStretch(row) {
    const [current, next] = row.behaviors;
    if (!current) return null;
    return {
        member: current.member,
        from: current.at,
        to: next ? next.at : row.recordedSteps,
    };
}

/** Collapse consecutive identical message lines into {line, count} runs. */
export function dedupeMessages(lines) {
    const runs = [];
    for (const line of lines) {
        const last = runs[runs.length - 1];
        if (last && last.line === line) last.count += 1;
        else runs.push({ line, count: 1 });
    }
    return runs;
}

async function main(args) {
    const target = args.find((arg) => !arg.startsWith('--'));
    if (!target) {
        throw new Error(
            'usage: scan-ahead.mjs <behavior>, a behaviors member as '
                + 'scripts/scan-debt.mjs names it',
        );
    }
    const files = listSessionFiles(DEVELOPMENT_DIR);
    const scanned = [];
    for (const file of files) scanned.push(await scanSession(file));
    const rows = attachBehaviors(scanned);
    const matched = rows.filter((row) => aheadStretch(row)?.member === target);
    if (matched.length === 0) {
        const members = [...new Set(rows.map((row) => aheadStretch(row)?.member)
            .filter(Boolean))].sort();
        console.log(`No session stops first on "${target}". Current first stops:`);
        for (const member of members) console.log(`  ${member}`);
        process.exitCode = 1;
        return;
    }
    let total = 0;
    for (const row of matched) {
        const stretch = aheadStretch(row);
        const steps = recordedStepsFor(row.file)
            .slice(stretch.from, stretch.to);
        total += steps.length;
        console.log(`== ${row.file}: steps ${stretch.from}..${stretch.to} `
            + `(${steps.length} ahead)`);
        for (const { line, count } of dedupeMessages(steps.map(recordedTopLine)))
            console.log(count > 1 ? `${line}  [x${count}]` : line);
        console.log('');
    }
    console.log(`${matched.length} session(s), ${total} recorded steps ahead `
        + `of "${target}".`);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    await main(process.argv.slice(2));
}
