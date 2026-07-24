#!/usr/bin/env node

// Run independent fresh cases in parallel, keep every original input, and
// group failures by their first observable difference.

import { execFile } from 'node:child_process';
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
    isSealedHoldoutPath,
    validateCleanRecipe,
} from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const WORKER_SCRIPT = resolve(SCRIPT_DIR, 'scan-fresh-worker.mjs');
const execFileAsync = promisify(execFile);

export const DEFAULT_CONCURRENCY = 2;
export const MAX_CONCURRENCY = 8;
export const USAGE = `Usage:
  node scripts/scan-fresh.mjs <scan-plan.json> [--concurrency <1-${MAX_CONCURRENCY}>]

A scan plan is JSON with this shape:
{
  "version": 1,
  "cases": [
    {
      "label": "descriptive case name",
      "segments": [
        {
          "seed": 123,
          "datetime": "20300102030405",
          "nethackrc": "...",
          "moves": " ..."
        }
      ]
    }
  ]
}

Each case is recorded afresh and compared strictly. Segments may contain replay
inputs only, never recorded steps.`;

function optionValue(argv, index, option) {
    if (index + 1 >= argv.length) throw new Error(`${option} needs a value`);
    return argv[index + 1];
}

export function parseScanArgs(argv) {
    const positionals = [];
    let concurrency = DEFAULT_CONCURRENCY;
    for (let index = 0; index < argv.length; ++index) {
        const arg = argv[index];
        if (arg === '-h' || arg === '--help') {
            return { help: true };
        }
        if (arg === '--concurrency') {
            const value = optionValue(argv, index, arg);
            if (!/^[1-9][0-9]*$/u.test(value)) {
                throw new Error('--concurrency must be a positive integer');
            }
            concurrency = Number(value);
            if (concurrency > MAX_CONCURRENCY) {
                throw new Error(
                    `--concurrency must not exceed ${MAX_CONCURRENCY}`,
                );
            }
            index++;
        } else if (arg.startsWith('-')) {
            throw new Error(`unknown option: ${arg}`);
        } else {
            positionals.push(arg);
        }
    }
    if (positionals.length !== 1) {
        throw new Error('provide exactly one scan-plan path');
    }
    return { help: false, planPath: positionals[0], concurrency };
}

export function validateScanPlan(data, label = 'fresh scan plan') {
    if (!data || typeof data !== 'object' || data.version !== 1
        || !Array.isArray(data.cases) || data.cases.length === 0) {
        throw new Error(`${label} must be a v1 plan with at least one case`);
    }
    const labels = new Set();
    return data.cases.map((freshCase, index) => {
        const prefix = `${label} case ${index + 1}`;
        if (!freshCase || typeof freshCase !== 'object') {
            throw new Error(`${prefix} must be an object`);
        }
        if (typeof freshCase.label !== 'string'
            || freshCase.label.trim().length === 0) {
            throw new Error(`${prefix} needs a label`);
        }
        if (labels.has(freshCase.label)) {
            throw new Error(`${prefix} repeats label ${freshCase.label}`);
        }
        labels.add(freshCase.label);
        const recipe = {
            version: 5,
            segments: freshCase.segments,
        };
        validateCleanRecipe(recipe, prefix);
        return { label: freshCase.label, recipe };
    });
}

export function loadScanPlan(planPath) {
    const inputPath = resolve(planPath);
    if (isSealedHoldoutPath(inputPath)) {
        throw new Error('sealed holdout paths are not accepted by the fresh scanner');
    }
    let data;
    try {
        data = JSON.parse(readFileSync(inputPath, 'utf8'));
    } catch (error) {
        throw new Error(`cannot read scan plan ${inputPath}: ${error.message}`);
    }
    return validateScanPlan(data, inputPath);
}

function rngCallShape(value) {
    if (value === undefined) return '<missing>';
    return String(value).replace(/=[^=]*$/u, '');
}

function cellFingerprint(cell) {
    if (!cell) return '<missing>';
    return JSON.stringify({
        ch: cell.ch,
        color: cell.color,
        attr: cell.attr,
        decgfx: cell.decgfx,
    });
}

export function firstFailureDescription(result) {
    if (!result || typeof result.passed !== 'boolean') {
        throw new Error('fresh scan worker returned an invalid result');
    }
    if (result.passed) return null;
    if (result.error) {
        return `JS error: ${String(result.error).split('\n', 1)[0]}`;
    }
    if (result.rngMismatch) {
        const mismatch = result.rngMismatch;
        return `PRNG: ${rngCallShape(mismatch.cEntry)} at `
            + `${mismatch.cCaller || '<unknown C caller>'}; JS `
            + rngCallShape(mismatch.jsEntry);
    }
    if (result.screenMismatch) {
        const mismatch = result.screenMismatch;
        return `screen ${mismatch.index + 1}: ${mismatch.kind}`
            + (mismatch.row === undefined ? '' : ` at row ${mismatch.row + 1}, `
                + `column ${mismatch.column + 1}`)
            + `; C ${cellFingerprint(mismatch.cCell)}; `
            + `JS ${cellFingerprint(mismatch.jsCell)}`;
    }
    if (result.cursorMismatch) {
        const mismatch = result.cursorMismatch;
        return `cursor ${mismatch.index + 1}: C `
            + `${JSON.stringify(mismatch.cCursor)}; JS `
            + JSON.stringify(mismatch.jsCursor);
    }
    return 'failure without a reported first difference';
}

export function summarizeScan(cases, results) {
    if (!Array.isArray(cases) || !Array.isArray(results)
        || cases.length !== results.length) {
        throw new Error('fresh scan cases and results must have matching lengths');
    }
    const groupsByDescription = new Map();
    let passed = 0;
    for (let index = 0; index < cases.length; ++index) {
        const description = firstFailureDescription(results[index]);
        if (description === null) {
            passed++;
            continue;
        }
        let group = groupsByDescription.get(description);
        if (!group) {
            group = {
                description,
                count: 0,
                labels: [],
                representative: cases[index],
                result: results[index],
            };
            groupsByDescription.set(description, group);
        }
        group.count++;
        group.labels.push(cases[index].label);
    }
    return {
        total: cases.length,
        passed,
        failed: cases.length - passed,
        groups: [...groupsByDescription.values()],
    };
}

export async function runFreshCaseWorker(recipe, {
    workerScript = WORKER_SCRIPT,
    env = process.env,
} = {}) {
    validateCleanRecipe(recipe, 'fresh scan case');
    const workRoot = mkdtempSync(join(tmpdir(), 'teleport-fresh-scan-'));
    const recipePath = join(workRoot, 'recipe.session.json');
    const resultPath = join(workRoot, 'result.json');
    writeFileSync(recipePath, JSON.stringify(recipe));
    try {
        try {
            await execFileAsync(
                process.execPath,
                [workerScript, recipePath, resultPath],
                {
                    cwd: resolve(SCRIPT_DIR, '..'),
                    env,
                    timeout: 12 * 60 * 1000,
                    maxBuffer: 64 * 1024 * 1024,
                },
            );
        } catch (error) {
            let detail = '';
            try {
                detail = JSON.parse(readFileSync(resultPath, 'utf8'))
                    .workerError;
            } catch {
                detail = error.message;
            }
            throw new Error(`fresh scan worker failed: ${detail}`);
        }
        try {
            const result = JSON.parse(readFileSync(resultPath, 'utf8'));
            firstFailureDescription(result);
            return result;
        } catch (error) {
            throw new Error(
                `fresh scan worker result is invalid: ${error.message}`,
            );
        }
    } finally {
        rmSync(workRoot, { recursive: true, force: true });
    }
}

export async function scanFreshCases(cases, {
    concurrency = DEFAULT_CONCURRENCY,
    runCase = runFreshCaseWorker,
    onComplete,
} = {}) {
    if (!Array.isArray(cases) || cases.length === 0) {
        throw new Error('fresh scan needs at least one case');
    }
    if (!Number.isInteger(concurrency) || concurrency < 1
        || concurrency > MAX_CONCURRENCY) {
        throw new Error(
            `fresh scan concurrency must be between 1 and ${MAX_CONCURRENCY}`,
        );
    }
    const results = new Array(cases.length);
    let nextIndex = 0;
    let completed = 0;
    const workers = Array.from(
        { length: Math.min(concurrency, cases.length) },
        async () => {
            while (nextIndex < cases.length) {
                const index = nextIndex++;
                results[index] = await runCase(cases[index].recipe);
                completed++;
                onComplete?.({
                    completed,
                    total: cases.length,
                    index,
                    freshCase: cases[index],
                });
            }
        },
    );
    await Promise.all(workers);
    return summarizeScan(cases, results);
}

export function formatScanReport(summary) {
    const status = summary.failed === 0 ? 'PASS' : 'FAIL';
    const lines = [
        `FRESH SCAN: ${status}: ${summary.total} cases, `
            + `${summary.passed} passed, ${summary.failed} failed, `
            + `${summary.groups.length} failure groups`,
    ];
    summary.groups.forEach((group, index) => {
        lines.push('');
        lines.push(`Failure group ${index + 1}: ${group.description}`);
        lines.push(`Cases: ${group.count}`);
        lines.push(`Representative: ${group.representative.label}`);
        lines.push('Original replay inputs:');
        lines.push(JSON.stringify(group.representative.recipe, null, 2));
    });
    return `${lines.join('\n')}\n`;
}

async function main(argv) {
    const config = parseScanArgs(argv);
    if (config.help) {
        process.stdout.write(`${USAGE}\n`);
        return 0;
    }
    const cases = loadScanPlan(config.planPath);
    process.stdout.write(
        `Scanning ${cases.length} fresh cases with concurrency `
        + `${config.concurrency}\n`,
    );
    const summary = await scanFreshCases(cases, {
        concurrency: config.concurrency,
    });
    process.stdout.write(formatScanReport(summary));
    return summary.failed === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`scan-fresh: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
