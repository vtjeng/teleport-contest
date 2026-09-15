#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import os from 'node:os';

import { testFilesForSuite } from './test-suites.mjs';
import { boundedMain } from './run-bounded.mjs';

const args = process.argv.slice(2);
if (args.length !== 1)
    throw new Error('run-test-suite needs exactly one suite name');

const files = testFilesForSuite(args[0]);
process.exitCode = await boundedMain('full', () => {
    const result = spawnSync(process.execPath, ['--test', ...files], {
        stdio: 'inherit',
    });
    if (result.error) throw result.error;
    // A signal-terminated child leaves status null, which Node treats as
    // success. Preserve the shell's nonzero 128 + signal-number convention.
    if (result.signal) {
        console.error(`run-test-suite: tests terminated by ${result.signal}`);
        return 128 + (os.constants.signals[result.signal] ?? 1);
    }
    return result.status;
});
