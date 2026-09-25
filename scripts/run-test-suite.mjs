#!/usr/bin/env node

import { run } from 'node:test';
import { spec, tap } from 'node:test/reporters';

import { testFilesForSuite } from './test-suites.mjs';
import { boundedMain } from './run-bounded.mjs';

const args = process.argv.slice(2);
if (args.length !== 1)
    throw new Error('run-test-suite needs exactly one suite name');

const files = testFilesForSuite(args[0]);
// `node --test` sorts the files it is given, which would start the
// LONG_RUNNING_TESTS that test-suites.mjs lists first in alphabetical order
// instead; run() keeps the given order. Like `node --test`, it runs
// availableParallelism() - 1 files at a time and reports with spec on a
// terminal and TAP otherwise.
process.exitCode = await boundedMain('full', () => new Promise((resolve, reject) => {
    let failed = false;
    run({ files, concurrency: true })
        .on('test:fail', () => { failed = true; })
        .compose(process.stdout.isTTY ? new spec() : tap)
        .on('error', reject)
        .on('end', () => resolve(failed ? 1 : 0))
        .pipe(process.stdout);
}));
