#!/usr/bin/env node

// Exercise the two recorder-glibc ASCII ERE representations at the 255-byte
// MSGTYPE pattern/input boundary. Cases run in direct-then-reference order;
// maxRSS therefore includes the stable Node baseline and earlier case.

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    regex_compile,
    regex_init,
    regex_match,
} from '../js/posixregex.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DIRECT_PATTERN = '^' + '()'.repeat(121) + '(|)(a|aa)*b$';
const REFERENCE_PATTERN = String.raw`^((a)|(a)|(a)|(a))*\2\3\4\5`
    + '()'.repeat(113) + 'b$';

const CASES = Object.freeze({
    direct: Object.freeze({
        pattern: DIRECT_PATTERN,
        input: 'a'.repeat(255),
        budgetMs: 1000,
        budgetMaxRssKiB: 96 * 1024,
    }),
    reference: Object.freeze({
        pattern: REFERENCE_PATTERN,
        input: 'a'.repeat(255),
        budgetMs: 2000,
        budgetMaxRssKiB: 128 * 1024,
    }),
});

function runCase(name) {
    const entry = CASES[name];
    if (!entry) throw new Error(`unknown resource case: ${name}`);
    const regex = regex_init();
    assert.equal(Buffer.byteLength(entry.pattern), 255);
    assert.equal(Buffer.byteLength(entry.input), 255);
    assert.equal(regex_compile(entry.pattern, regex), true);
    const started = performance.now();
    const matched = regex_match(entry.input, regex);
    const elapsedMs = performance.now() - started;
    assert.equal(matched, false);
    return {
        name,
        patternBytes: Buffer.byteLength(entry.pattern),
        inputBytes: Buffer.byteLength(entry.input),
        elapsedMs,
        maxRssKiB: process.resourceUsage().maxRSS,
    };
}

function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');

    for (const [name, budget] of Object.entries(CASES)) {
        const result = runCase(name);
        assert.ok(result.elapsedMs <= budget.budgetMs,
            `${name} took ${result.elapsedMs.toFixed(1)} ms`);
        assert.ok(result.maxRssKiB <= budget.budgetMaxRssKiB,
            `${name} used ${result.maxRssKiB} KiB maxRSS`);
        process.stdout.write(
            `${name}: ${result.elapsedMs.toFixed(1)} ms, `
                + `${result.maxRssKiB} KiB maxRSS, `
                + `${result.patternBytes}-byte pattern/`
                + `${result.inputBytes}-byte input `
                + `(budgets ${budget.budgetMs} ms/`
                + `${budget.budgetMaxRssKiB} KiB)\n`,
        );
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`startup regex resource: ${error.message || error}\n`);
        process.exitCode = 1;
    }
}
