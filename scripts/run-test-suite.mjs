#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import { testFilesForSuite } from './test-suites.mjs';

const args = process.argv.slice(2);
if (args.length !== 1)
    throw new Error('run-test-suite needs exactly one suite name');

const files = testFilesForSuite(args[0]);
const result = spawnSync(process.execPath, ['--test', ...files], {
    stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status;
