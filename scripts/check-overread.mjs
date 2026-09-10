#!/usr/bin/env node

// Flags segments that both skipped an unported callee (note_unported) and
// consumed all input before attempting an extra read. This combination needs
// investigation; it does not prove the skipped call caused the extra read.
// The scorer's playability runner blocks on that extra read instead of
// throwing, so catching it here
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
        if (!Array.isArray(row.segmentEndStates)) {
            throw new Error('scan cache lacks segment end states; '
                + 'rerun node scripts/scan-sessions.mjs --json');
        }
        for (const end of row.segmentEndStates) {
            if (end.unported?.length > 0 && end.inputExhausted) {
                flagged.push({
                    session: row.file,
                    segment: end.segment,
                    unported: end.unported,
                });
            }
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
            console.log(`  OVERREAD: ${entry.session} segment ${entry.segment} `
                + `(${entry.unported.join(', ')})`);
        }
        console.log(`overread: ${flagged.length} segment(s) over-read after gaps`);
        process.exitCode = 1;
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
