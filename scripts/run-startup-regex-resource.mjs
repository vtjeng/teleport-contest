#!/usr/bin/env node

// Run every synchronous regex adversary in its own process. The parent can
// interrupt a fixed-point regression, while each child reports wall time and
// maxRSS without inheriting another case's allocations.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    regex_compile,
    regex_init,
    regex_match,
} from '../js/posixregex.js';
import {
    ADJACENT_REPEAT_CASES,
    EXACT_BOUNDARY_REGEX_CASES,
    REGEX_EXACT_BOUNDARY_BYTES,
} from './startup-regex-fixtures.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const BUDGETS = Object.freeze({
    'correlated-reference': Object.freeze({
        budgetMs: 2000,
        budgetMaxRssKiB: 128 * 1024,
    }),
    'unanchored-direct': Object.freeze({
        budgetMs: 1000,
        budgetMaxRssKiB: 96 * 1024,
    }),
    'unanchored-reference': Object.freeze({
        budgetMs: 2000,
        budgetMaxRssKiB: 128 * 1024,
    }),
    'adjacent-repeat-fixed-point': Object.freeze({
        budgetMs: 1000,
        budgetMaxRssKiB: 96 * 1024,
    }),
});

function compileAndMatch(pattern, input) {
    const regex = regex_init();
    assert.equal(regex_compile(pattern, regex), true, pattern);
    return regex_match(input, regex);
}

function runExactCase(entry) {
    assert.equal(Buffer.byteLength(entry.pattern), REGEX_EXACT_BOUNDARY_BYTES);
    assert.equal(Buffer.byteLength(entry.input), REGEX_EXACT_BOUNDARY_BYTES);
    assert.equal(compileAndMatch(entry.pattern, entry.input), entry.expected);
}

function runFixedPointCases() {
    for (const { pattern, matches, misses } of ADJACENT_REPEAT_CASES) {
        for (const input of matches)
            assert.equal(compileAndMatch(pattern, input), true, pattern);
        for (const input of misses)
            assert.equal(compileAndMatch(pattern, input), false, pattern);
    }
}

function runChild(name) {
    const started = performance.now();
    if (name === 'adjacent-repeat-fixed-point') {
        runFixedPointCases();
    } else {
        const entry = EXACT_BOUNDARY_REGEX_CASES.find(
            (candidate) => candidate.name === name,
        );
        if (!entry) throw new Error(`unknown resource case: ${name}`);
        runExactCase(entry);
    }
    return {
        name,
        elapsedMs: performance.now() - started,
        maxRssKiB: process.resourceUsage().maxRSS,
    };
}

function runBoundedChild(name, budget) {
    // The child enforces the measured matcher budget. The outer timeout adds
    // startup allowance but still turns a synchronous fixed point into a
    // process-level failure that the parent can observe.
    const result = spawnSync(
        process.execPath,
        [SCRIPT_PATH, '--case', name],
        {
            encoding: 'utf8',
            timeout: budget.budgetMs + 2000,
            maxBuffer: 1024 * 1024,
        },
    );
    if (result.error || result.status !== 0) {
        const detail = result.stderr.trim();
        throw new Error(result.error?.message
            || `${name} exited ${result.status}${detail ? `: ${detail}` : ''}`);
    }
    const measured = JSON.parse(result.stdout);
    assert.equal(measured.name, name);
    assert.ok(measured.elapsedMs <= budget.budgetMs,
        `${name} took ${measured.elapsedMs.toFixed(1)} ms`);
    assert.ok(measured.maxRssKiB <= budget.budgetMaxRssKiB,
        `${name} used ${measured.maxRssKiB} KiB maxRSS`);
    process.stdout.write(
        `${name}: ${measured.elapsedMs.toFixed(1)} ms, `
            + `${measured.maxRssKiB} KiB maxRSS `
            + `(budgets ${budget.budgetMs} ms/`
            + `${budget.budgetMaxRssKiB} KiB)\n`,
    );
}

function main(argv) {
    if (argv[0] === '--case' && argv.length === 2) {
        process.stdout.write(JSON.stringify(runChild(argv[1])));
        return;
    }
    if (argv.length) throw new Error('arguments are not accepted');
    for (const [name, budget] of Object.entries(BUDGETS))
        runBoundedChild(name, budget);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`startup regex resource: ${error.message || error}\n`);
        process.exitCode = 1;
    }
}
