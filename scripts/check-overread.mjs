#!/usr/bin/env node

// Detects sessions where unported gaps (note_unported) caused the game to
// consume all input and attempt an extra read. The scorer's playability
// runner blocks on that extra read instead of throwing, so catching it here
// avoids a 45-second timeout per affected session during scoring.
//
// Reads the scan cache (.cache/scan-cache.json) rather than replaying
// sessions, so it runs in milliseconds. A stale cache (different HEAD)
// prints a warning and exits 0.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_CACHE_PATH = join(PROJECT_ROOT, '.cache', 'scan-cache.json');

function repositoryHead() {
    return spawnSync('git', ['rev-parse', 'HEAD'],
        { encoding: 'utf8', cwd: PROJECT_ROOT }).stdout.trim();
}

export function checkOverReads(rows) {
    const flagged = [];
    for (const row of rows) {
        if (row.unported?.length > 0 && row.inputExhausted) {
            flagged.push({
                session: row.file,
                unported: row.unported,
                screensEmitted: row.screensEmitted,
                recordedSteps: row.recordedSteps,
            });
        }
    }
    return flagged;
}

function main() {
    if (!existsSync(SCAN_CACHE_PATH)) {
        console.log('overread: no scan cache, skipping');
        return;
    }
    let cache;
    try {
        cache = JSON.parse(readFileSync(SCAN_CACHE_PATH, 'utf8'));
    } catch {
        console.log('overread: scan cache unreadable, skipping');
        return;
    }
    const head = repositoryHead();
    if (cache.sha !== head) {
        console.log(`overread: scan cache is for ${cache.sha?.slice(0, 8)}, HEAD is ${head.slice(0, 8)}, skipping`);
        return;
    }
    const rows = cache.rows ?? [];
    const flagged = checkOverReads(rows);
    if (flagged.length === 0) {
        console.log(`overread: ${rows.length} sessions checked, none over-read`);
    } else {
        for (const entry of flagged) {
            console.log(`  OVERREAD: ${entry.session} (${entry.unported.join(', ')})`);
        }
        console.log(`overread: ${flagged.length} session(s) over-read after gaps`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
