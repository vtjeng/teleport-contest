#!/usr/bin/env node

// Census of where the JavaScript port first refuses each development session.
//
// The port ends a segment at a fail-closed boundary instead of guessing at
// unported behavior, so the boundary a session reaches names the upstream
// owner that the next implementation slice has to port. This script reports
// that census and nothing more. It deliberately reports no estimate of how
// many screens a candidate fix would earn: the keystrokes after a stop include
// prompt answers, count prefixes, and menu selections rather than commands,
// and a session blocked on one owner routinely blocks again on another, so
// only making the change and re-running this scan measures a delta.
//
// Sealed-holdout rule: DEVELOPMENT_DIR is fixed and this script accepts no
// path argument, so it cannot be aimed at sessions/holdout/.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeScreen } from '../frozen/screen-decode.mjs';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { commandForKey } from '../js/command_bindings.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PROJECT_ROOT, listSessionFiles } from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const DEVELOPMENT_DIR = join(PROJECT_ROOT, 'sessions');

// Keep routine scanning on the reviewed side of the fixed 33/11 split, the
// same guard scripts/score-development.mjs applies.
const EXPECTED_DEVELOPMENT_COUNT = 33;

// The judge builds each segment's input from exactly these fields; mirroring
// frozen/ps_test_runner.mjs replayInputFor() keeps the census aligned with the
// development score rather than with a slightly different replay.
function replayInputFor(segment) {
    return {
        seed: segment.seed,
        datetime: segment.datetime,
        nethackrc: segment.nethackrc,
        moves: segment.moves,
    };
}

function createStorageHandle() {
    const entries = new Map();
    return {
        getItem(k) { return entries.has(k) ? entries.get(k) : null; },
        setItem(k, v) { entries.set(k, String(v)); },
        removeItem(k) { entries.delete(k); },
        get length() { return entries.size; },
        key(i) {
            let n = 0;
            for (const k of entries.keys()) { if (n === i) return k; n++; }
            return null;
        },
        clear() { entries.clear(); },
    };
}

// The port emits one screen per input boundary, in the same order the recorder
// captured its steps, so the count of screens a segment emitted indexes the
// recorded step whose keystroke the port never consumed.
export function stopStepIndex(screensEmitted) {
    return screensEmitted;
}

// C's own top line at the stop step. It says what the reference program did
// with the refused keystroke, which is a diagnostic pointer to the upstream
// owner — never a specification. The specification is the C function.
export function recordedTopLine(step) {
    if (!step?.screen) return '';
    return decodeScreen(step.screen)[0].map(cell => cell.ch).join('').trimEnd();
}

// Resolve the refused keystroke through the port's own binding model for this
// session. Sessions rebind keys — seed2600 carries `BIND=v:inventory` — so
// matching raw characters against a fixed table misnames their commands.
function resolvedCommand(key) {
    const model = game?.commandBindings;
    if (!model || typeof key !== 'string' || key.length === 0) return null;
    // bindingAt() indexes by character code, not by character.
    return commandForKey(model, key.charCodeAt(0));
}

export function ceilingFor(row) {
    return row.recordedSteps - row.screensEmitted;
}

// Group rows by a caller-chosen field, carrying the summed ceiling so the
// output states how much of the set each boundary class stands in front of.
export function censusBy(rows, field) {
    const groups = new Map();
    for (const row of rows) {
        const key = row[field] ?? '(none)';
        const group = groups.get(key) ?? { key, sessions: 0, ceiling: 0 };
        group.sessions += 1;
        group.ceiling += ceilingFor(row);
        groups.set(key, group);
    }
    return [...groups.values()].sort(
        (a, b) => b.sessions - a.sessions || b.ceiling - a.ceiling,
    );
}

async function scanSession(file) {
    const data = normalizeSession(
        JSON.parse(readFileSync(join(DEVELOPMENT_DIR, file), 'utf8')),
    );
    const storage = createStorageHandle();
    const recordedSteps = data.segments.reduce(
        (total, segment) => total + (segment.steps || []).length,
        0,
    );

    let screensEmitted = 0;
    for (const segment of data.segments) {
        let boundary = null;
        const segmentGame = await runSegment(
            { ...replayInputFor(segment), storage },
            { onBoundary: (error) => { boundary ??= error; } },
        );
        const segmentScreens = segmentGame.getScreens?.() ?? [];
        if (boundary) {
            const steps = segment.steps || [];
            const step = steps[stopStepIndex(segmentScreens.length)];
            return {
                file,
                screensEmitted: screensEmitted + segmentScreens.length,
                recordedSteps,
                boundary: boundary.message,
                key: step?.key ?? null,
                // Read the bindings before the next session overwrites the
                // shared game singleton.
                command: resolvedCommand(step?.key),
                message: recordedTopLine(step),
            };
        }
        screensEmitted += segmentScreens.length;
    }

    return {
        file,
        screensEmitted,
        recordedSteps,
        boundary: null,
        key: null,
        command: null,
        message: '',
    };
}

function formatKey(key) {
    return key == null ? '-' : JSON.stringify(key);
}

function report(rows) {
    const nameWidth = Math.max(...rows.map(r => r.file.length));
    console.log('Where each development session first stops\n');
    for (const row of rows) {
        console.log(
            [
                row.file.padEnd(nameWidth),
                `${row.screensEmitted}/${row.recordedSteps}`.padStart(10),
                formatKey(row.key).padEnd(9),
                (row.command ?? '-').padEnd(14),
                row.boundary ?? 'no stop (input exhausted)',
                row.message ? `| C: ${JSON.stringify(row.message)}` : '',
            ].join('  ').trimEnd(),
        );
    }

    const emitted = rows.reduce((n, r) => n + r.screensEmitted, 0);
    const recorded = rows.reduce((n, r) => n + r.recordedSteps, 0);
    console.log(
        `\n${rows.length} sessions; ${emitted} screens emitted of ${recorded} `
        + 'recorded. scripts/score-development.mjs is the authority on how '
        + 'many of those emitted screens match.',
    );

    for (const [title, field] of [
        ['\nBoundary census (sessions, screens standing behind it)', 'boundary'],
        ['\nRefused command census', 'command'],
    ]) {
        console.log(title);
        for (const group of censusBy(rows, field)) {
            console.log(
                `  ${String(group.sessions).padStart(2)}  `
                + `${String(group.ceiling).padStart(5)}  ${group.key}`,
            );
        }
    }
}

export async function main(args) {
    const json = args.includes('--json');
    // Reject every other argument, including any path: this scan must not be
    // aimable at sessions/holdout/.
    if (args.some(arg => arg !== '--json')) {
        throw new Error('only --json is accepted');
    }

    const files = listSessionFiles(DEVELOPMENT_DIR);
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT) {
        throw new Error('development count changed');
    }

    const rows = [];
    for (const file of files) rows.push(await scanSession(file));

    if (json) console.log(JSON.stringify({ rows }, null, 2));
    else report(rows);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`Stop scan failed: ${error.message}`);
        process.exitCode = 1;
    });
}
