#!/usr/bin/env node
// recipe-host.mjs -- Which host may record a recipe.
//
// A few recipes record differently on Linux than on macOS, the judge's host:
// a key binding that depends on uninitialized memory, the C library's regex
// and qsort(), APFS file names, and paths on which macOS ends the process in
// SIGABRT (docs/testing.md, "Local recordings and the judge's host"). Their
// committed recordings come from the macOS recorder, and a Linux recording
// of them cannot equal the committed one. Such a recipe says so with the
// top-level field
//
//     "recordOn": "macos"
//
// beside its comment. scripts/record-session.mjs copies top-level recipe
// fields into the recording, so the recording carries the field too. The
// judge's scorer reads only each segment's seed, datetime, nethackrc and
// moves (frozen/ps_test_runner.mjs replayInputFor()), so the field does not
// affect scoring. A recipe without the field records alike on every host.
//
// Everything that decides whether a recipe is macOS-only calls
// isMacosOnly(): experiments/host-parity/check-changed-recordings.sh through
// the command line below, scripts/record-session.mjs, and the tests that pin
// macOS recordings. scripts/recipe-host.test.mjs fails when a recipe's
// comment says it must be recorded on macOS and the field is missing.
//
// Usage: node scripts/recipe-host.mjs <recipe> ...
//   Prints the path of each named recipe that is macOS-only, one per line.
//   Exits 1, naming the file, when a recipe cannot be read or has another
//   recordOn value.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECORD_ON_FIELD = 'recordOn';
export const RECORD_ON_MACOS = 'macos';

/**
 * True when the session's committed recording must come from the macOS
 * recorder. Throws when the field holds anything but "macos".
 */
export function isMacosOnly(session) {
    if (!Object.hasOwn(session, RECORD_ON_FIELD)) return false;
    const value = session[RECORD_ON_FIELD];
    if (value !== RECORD_ON_MACOS) {
        throw new Error(`${RECORD_ON_FIELD} must be ${JSON.stringify(RECORD_ON_MACOS)} `
            + `or absent, not ${JSON.stringify(value)}`);
    }
    return true;
}

/** isMacosOnly() for a recipe or recording file. */
export function isMacosOnlyFile(path) {
    try {
        return isMacosOnly(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
        throw new Error(`${path}: ${error.message}`, { cause: error });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        for (const path of process.argv.slice(2)) {
            if (isMacosOnlyFile(path)) console.log(path);
        }
    } catch (error) {
        console.error(`recipe-host: ${error.message}`);
        process.exit(1);
    }
}
