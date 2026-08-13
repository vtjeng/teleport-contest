#!/usr/bin/env node

// Owns PHASES.tsv, the wall-clock record of loop phases. The orchestrator
// appends a start and an end row around selection, each worker run, and each
// formal review pass, so the next process audit reads measured phase time in
// place of commit-gap proxies.
// A `validate` row pair is the only record of validation time: SCORE.tsv
// carried a scoring run's wall seconds until 2026-08-02 and now carries none.

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_PATH = fileURLToPath(new URL('../PHASES.tsv',
    import.meta.url));

export const COLUMNS = ['utc', 'event', 'phase', 'goal', 'detail'];
export const PHASES = Object.freeze(['select', 'implement', 'validate',
    'review']);

export function readPhases(path = DEFAULT_PATH) {
    const lines = readFileSync(path, 'utf8').split('\n')
        .filter((line) => line !== '');
    if (lines[0] !== COLUMNS.join('\t')) {
        throw new Error('PHASES.tsv header differs from the columns this '
            + 'script owns');
    }
    return lines.slice(1).map((line) => {
        const cells = line.split('\t');
        if (cells.length !== COLUMNS.length) {
            throw new Error(`PHASES.tsv row has ${cells.length} fields: ${line}`);
        }
        return Object.fromEntries(
            COLUMNS.map((column, index) => [column, cells[index]]));
    });
}

export function appendPhase(fields, path = DEFAULT_PATH) {
    if (fields.event !== 'start' && fields.event !== 'end') {
        throw new Error('event must be start or end');
    }
    if (!PHASES.includes(fields.phase)) {
        throw new Error(`phase must be one of ${PHASES.join(', ')}`);
    }
    const row = { utc: new Date().toISOString(), goal: '', detail: '',
        ...fields };
    const cells = COLUMNS.map((column) => {
        const value = String(row[column] ?? '');
        if (/[\t\n]/u.test(value)) {
            throw new Error(`value for ${column} contains a tab or newline`);
        }
        return value;
    });
    appendFileSync(path, `${cells.join('\t')}\n`);
    return Object.fromEntries(COLUMNS.map((column, i) => [column, cells[i]]));
}

/**
 * Pair each end row with the newest unmatched start of the same phase and
 * total the elapsed seconds per phase. Unpaired starts are reported open;
 * an end with no start is reported orphaned rather than guessed at.
 */
export function summarizePhases(rows) {
    const open = new Map();
    const totals = new Map(PHASES.map((phase) => [phase, { seconds: 0,
        spans: 0 }]));
    const orphanedEnds = [];
    for (const row of rows) {
        if (row.event === 'start') {
            open.set(row.phase, row);
            continue;
        }
        const start = open.get(row.phase);
        if (!start) {
            orphanedEnds.push(row);
            continue;
        }
        open.delete(row.phase);
        const seconds = (Date.parse(row.utc) - Date.parse(start.utc)) / 1000;
        const total = totals.get(row.phase);
        total.seconds += seconds;
        total.spans += 1;
    }
    return { totals, open: [...open.values()], orphanedEnds };
}

function main(args) {
    const mode = args[0];
    if (mode === 'start' || mode === 'end') {
        const fields = { event: mode, phase: args[1] };
        for (let index = 2; index < args.length; index += 2) {
            const key = args[index]?.replace(/^--/u, '');
            if (key !== 'goal' && key !== 'detail') {
                throw new Error(`unknown option: ${args[index]}`);
            }
            if (args[index + 1] === undefined) {
                throw new Error(`--${key} needs a value`);
            }
            fields[key] = args[index + 1];
        }
        appendPhase(fields);
        return;
    }
    if (mode === '--summary' || mode === undefined) {
        const { totals, open, orphanedEnds } = summarizePhases(readPhases());
        for (const [phase, { seconds, spans }] of totals) {
            if (spans === 0) continue;
            console.log(`${phase}: ${Math.round(seconds)}s over `
                + `${spans} span(s)`);
        }
        for (const row of open) {
            console.log(`open since ${row.utc}: ${row.phase}`
                + (row.goal ? ` (${row.goal})` : ''));
        }
        for (const row of orphanedEnds) {
            console.log(`end without start at ${row.utc}: ${row.phase}`);
        }
        return;
    }
    throw new Error('modes: start <phase> [--goal g] [--detail d], '
        + 'end <phase> [--goal g] [--detail d], --summary');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`phase-log: ${error.message}`);
        process.exitCode = 1;
    }
}
