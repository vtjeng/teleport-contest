#!/usr/bin/env node

import { run } from 'node:test';
import { spec, tap } from 'node:test/reporters';

import { failsSuite, testFilesForSuite } from './test-suites.mjs';

const args = process.argv.slice(2);
if (args.length !== 1 && !(args.length === 3 && args[1] === '--shard'))
    throw new Error('run-test-suite needs a suite name and optional --shard index/count');

const files = testFilesForSuite(args[0]);
let shard;
if (args.length === 3) {
    if (!/^\d+\/\d+$/u.test(args[2])) throw new Error('test shard must be index/count');
    const [index, total] = args[2].split('/').map(Number);
    shard = { index, total }; // Node owns partitioning and range validation.
}
// `node --test` sorts the files it is given, which would start the
// LONG_RUNNING_TESTS that test-suites.mjs lists first in alphabetical order
// instead; run() keeps the given order. Like `node --test`, it runs
// availableParallelism() - 1 files at a time and reports with spec on a
// terminal and TAP otherwise.
process.exitCode = await new Promise((resolve, reject) => {
    let failed = false;
    // Every test file selects throwing for a js/youprop.js macro given the
    // wrong argument (scripts/strict-live-game-uses.mjs), so a use fails the
    // test that made it instead of being recorded and let through, as
    // js/gstate.js does by default for the judge's entry points.
    const execArgv = ['--import', new URL('./strict-live-game-uses.mjs', import.meta.url).href];
    run({ files, concurrency: true, shard, execArgv })
        .on('test:fail', (event) => { if (failsSuite(event)) failed = true; })
        .compose(process.stdout.isTTY ? new spec() : tap)
        .on('error', reject)
        .on('end', () => resolve(failed ? 1 : 0))
        .pipe(process.stdout);
});
