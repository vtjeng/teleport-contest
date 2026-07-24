#!/usr/bin/env node

import {
    readFileSync,
    writeFileSync,
} from 'node:fs';

import { runDifferential } from './diff-fresh.mjs';

try {
    if (process.argv.length !== 4) {
        throw new Error('expected recipe and result paths');
    }
    const recipe = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const result = await runDifferential(recipe);
    writeFileSync(process.argv[3], JSON.stringify(result));
} catch (error) {
    if (process.argv[3]) {
        writeFileSync(process.argv[3], JSON.stringify({
            workerError: error.message || String(error),
        }));
    }
    process.exitCode = 2;
}
