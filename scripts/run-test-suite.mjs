#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import os from 'node:os';

import { testFilesForSuite } from './test-suites.mjs';

const args = process.argv.slice(2);
if (args.length !== 1)
    throw new Error('run-test-suite needs exactly one suite name');

const files = testFilesForSuite(args[0]);
const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
});
if (result.error) throw result.error;
// A signal-terminated child leaves `status` null, and Node reads a null exit
// code as 0, so an out-of-memory or externally killed test run would report
// success. Fail on the signal instead, using the shell's 128 + signal number.
if (result.signal) {
    console.error(`run-test-suite: tests terminated by ${result.signal}`);
    process.exitCode = 128 + (os.constants.signals[result.signal] ?? 1);
} else {
    process.exitCode = result.status;
}
