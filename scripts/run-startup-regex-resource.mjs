#!/usr/bin/env node

// Run every synchronous regex adversary in its own process. The parent can
// interrupt a fixed-point regression, while each child reports CPU time,
// wall time, and maxRSS without inheriting another case's allocations.

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
    FIXED_POINT_REGEX_RESOURCE_CASE,
    REGEX_EXACT_BOUNDARY_BYTES,
    REGEX_RESOURCE_CASES,
} from './startup-regex-fixtures.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function compileAndMatch(pattern, input) {
    const regex = regex_init();
    assert.equal(regex_compile(pattern, regex), true, pattern);
    return regex_match(input, regex);
}

function runSingleCase(entry) {
    if (entry.kind === 'exact-boundary') {
        assert.equal(Buffer.byteLength(entry.pattern),
            REGEX_EXACT_BOUNDARY_BYTES);
        assert.equal(Buffer.byteLength(entry.input),
            REGEX_EXACT_BOUNDARY_BYTES);
    }
    assert.equal(compileAndMatch(entry.pattern, entry.input), entry.expected);
}

function runFixedPointCases() {
    for (const { pattern, matches, misses }
        of FIXED_POINT_REGEX_RESOURCE_CASE.cases) {
        for (const input of matches)
            assert.equal(compileAndMatch(pattern, input), true, pattern);
        for (const input of misses)
            assert.equal(compileAndMatch(pattern, input), false, pattern);
    }
}

function runChild(name) {
    const cpuStarted = process.cpuUsage();
    const started = performance.now();
    if (name === FIXED_POINT_REGEX_RESOURCE_CASE.name) {
        runFixedPointCases();
    } else {
        const entry = REGEX_RESOURCE_CASES.find(
            (candidate) => candidate.name === name,
        );
        if (!entry) throw new Error(`unknown resource case: ${name}`);
        runSingleCase(entry);
    }
    const elapsedMs = performance.now() - started;
    // Sum user and system CPU across the child, including runtime work on
    // other threads. Time waiting to be scheduled is not matcher work.
    const cpuUsed = process.cpuUsage(cpuStarted);
    return {
        name,
        cpuMs: (cpuUsed.user + cpuUsed.system) / 1000,
        elapsedMs,
        maxRssKiB: process.resourceUsage().maxRSS,
    };
}

export function runBoundedChild(name, budget, {
    run = spawnSync,
    output = (line) => process.stdout.write(line),
} = {}) {
    // Keep the existing wall watchdog and startup allowance: CPU accounting
    // checks completed work, but a synchronous fixed point still needs to be
    // interrupted from outside the child.
    const result = run(
        process.execPath,
        [SCRIPT_PATH, '--case', name],
        {
            encoding: 'utf8',
            timeout: budget.budgetCpuMs + 2000,
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
    assert.ok(measured.cpuMs <= budget.budgetCpuMs,
        `${name} used ${measured.cpuMs.toFixed(1)} ms CPU `
            + `(${measured.elapsedMs.toFixed(1)} ms wall)`);
    assert.ok(measured.maxRssKiB <= budget.budgetMaxRssKiB,
        `${name} used ${measured.maxRssKiB} KiB maxRSS`);
    output(
        `${name}: ${measured.cpuMs.toFixed(1)} ms CPU, `
            + `${measured.elapsedMs.toFixed(1)} ms wall, `
            + `${measured.maxRssKiB} KiB maxRSS `
            + `(budgets ${budget.budgetCpuMs} ms CPU/`
            + `${budget.budgetMaxRssKiB} KiB)\n`,
    );
}

function main(argv) {
    if (argv[0] === '--case' && argv.length === 2) {
        process.stdout.write(JSON.stringify(runChild(argv[1])));
        return;
    }
    if (argv.length) throw new Error('arguments are not accepted');
    for (const entry of REGEX_RESOURCE_CASES)
        runBoundedChild(entry.name, entry);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`startup regex resource: ${error.message || error}\n`);
        process.exitCode = 1;
    }
}
