#!/usr/bin/env node

// Compares, input step by input step, the random-number calls a recording
// holds with the calls the port made in the same step.
//
// A recording stores the calls C made during each step. The judge
// (frozen/ps_test_runner.mjs) compares the whole log of a session, so a port
// that draws the right numbers in the wrong step still scores every call:
// when C prints a line and waits at its --More--, and the port prints that
// line later, the port draws before the key what C draws after it. This
// comparison finds those steps.
//
// The recordings corpus is checked on every replay: scripts/
// segment-error-preload.mjs compares each segment inside the judge's own
// worker, and scripts/score-recordings.mjs fails a recording that lags
// unless LAGGING_RECORDINGS below pins it, and fails a pinned recording
// that no longer lags. Run this file to compare other sessions by hand:
//
//   node scripts/rng-step-compare.mjs [--port <directory>] <session.json>...
//
// It prints one JSON line per file and exits 1 when a file lags or fails to
// replay. --port names a checkout whose js/jsmain.js replays instead of this
// one's.

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(SCRIPT_PATH, '..', '..');

// Recordings under recordings/ with a step whose calls differ, each with the
// reason the port still lags there. scripts/rng-step-compare.test.mjs pins
// the count; scripts/score-recordings.mjs fails when a recording here comes
// into step, so remove the entry and lower the count in the same commit.
// An entry is a path relative to recordings/ and a reason:
//   ['mon.c/some-recipe.session.json', 'why the port cannot wait there'],
export const LAGGING_RECORDINGS = new Map([]);

// The judge's own test for a log entry that is a random-number call
// (frozen/ps_test_runner.mjs isRngCall()), after its index prefix is removed.
const RNG_CALL = /^(?:rn2|rnd|rn1|rnl|rne|rnz|d)\(/u;

// A call as both logs spell it: no leading index, and no " @ caller" suffix,
// which only the C log has.
function rngCalls(entries) {
    const calls = [];
    for (const entry of entries ?? []) {
        if (typeof entry !== 'string') continue;
        const call = entry.replace(/^\d+\s+/u, '').replace(/\s*@\s.*$/u, '').trim();
        if (RNG_CALL.test(call)) calls.push(call);
    }
    return calls;
}

function sameCalls(a, b) {
    return a.length === b.length && a.every((call, index) => call === b[index]);
}

/**
 * Compare one segment. `steps` is the recording's segment.steps and `slices`
 * the port's getRngSlices() for the same segment (js/jsmain.js): one entry
 * for each time the port waited for a key.
 *
 * The recorder leaves `screen` empty for a step that ends on an all-blank
 * terminal, and the port's slices do not say which waits those were. A
 * recorded step without a screen therefore joins the next step that has one,
 * and the port's slice for that screen is compared with both steps' calls.
 * What C drew after its last screen is compared with every slice the port
 * has left. A blank screen in the middle of a segment thus shows as a
 * difference instead of passing unseen.
 *
 * Answers { steps, differing, first }: the steps compared, how many differ,
 * and the first that does as { step, recorded, port } (the step's index in
 * `steps` and the two call counts), or null.
 */
export function compareSegmentSteps(steps, slices) {
    const result = { steps: 0, differing: 0, first: null };
    const differ = (step, recorded, port) => {
        result.differing += 1;
        result.first ??= { step, recorded: recorded.length, port: port.length };
    };
    let pending = [];
    let next = 0;
    for (const [index, step] of (steps ?? []).entries()) {
        // Not push(...calls): one step can hold more calls than a call takes
        // arguments.
        pending = pending.concat(rngCalls(step.rng));
        if (!step.screen) continue;
        const port = rngCalls(slices[next++]);
        result.steps += 1;
        if (!sameCalls(pending, port)) differ(index, pending, port);
        pending = [];
    }
    const rest = rngCalls(slices.slice(next).flat());
    if (pending.length || rest.length) {
        result.steps += 1;
        if (!sameCalls(pending, rest)) differ((steps ?? []).length, pending, rest);
    }
    return result;
}

/** Totals over a session's segments; `first` gains the segment's index. */
export function combineSegments(segments) {
    const total = { steps: 0, differing: 0, first: null };
    for (const [segment, result] of segments.entries()) {
        total.steps += result.steps;
        total.differing += result.differing;
        if (result.first) total.first ??= { segment, ...result.first };
    }
    return total;
}

function memoryStorage() {
    const store = new Map();
    return {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)); },
        removeItem: (key) => { store.delete(key); },
        get length() { return store.size; },
        key: index => [...store.keys()][index] ?? null,
    };
}

async function compareFile(file, runSegmentStrict, normalizeSession) {
    const { segments } = normalizeSession(JSON.parse(readFileSync(file, 'utf8')));
    const storage = memoryStorage();
    const results = [];
    for (const segment of segments) {
        const game = await runSegmentStrict({ seed: segment.seed, datetime: segment.datetime,
            nethackrc: segment.nethackrc, moves: segment.moves, storage });
        results.push(compareSegmentSteps(segment.steps, game.getRngSlices()));
    }
    return combineSegments(results);
}

async function main(args) {
    let port = PROJECT_ROOT;
    if (args[0] === '--port') {
        port = resolve(args[1] ?? '');
        args = args.slice(2);
    }
    if (!args.length || args[0].startsWith('-')) {
        console.error('Usage: node scripts/rng-step-compare.mjs [--port <directory>] <session.json>...');
        return 2;
    }
    const { runSegmentStrict } = await import(pathToFileURL(join(port, 'js', 'jsmain.js')).href);
    const { normalizeSession } = await import(pathToFileURL(join(port, 'frozen', 'session_loader.mjs')).href);
    let failed = false;
    for (const file of args) {
        let line;
        try {
            line = { file, ...await compareFile(file, runSegmentStrict, normalizeSession) };
            // A file with nothing to compare was not checked.
            if (line.differing || !line.steps) failed = true;
        } catch (error) {
            line = { file, error: String(error?.message ?? error).slice(0, 300) };
            failed = true;
        }
        console.log(JSON.stringify(line));
    }
    return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH)
    process.exitCode = await main(process.argv.slice(2));
