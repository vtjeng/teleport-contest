#!/usr/bin/env node

// Owns the SCORE.tsv format. Agents append event rows through `--append` and
// query them through the modes below. This file is the only code that composes
// or parses a row.

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COLUMNS = [
    'utc',
    'sha',
    'event',
    'sessions_passed',
    'sessions_total',
    'screens_matched',
    'screens_total',
    'rng_matched',
    'rng_total',
    'cursors_matched',
    'cursors_total',
    'holdout_screens_matched',
    'holdout_screens_total',
    'holdout_rng_matched',
    'holdout_rng_total',
    'note',
    'holdout_sessions_passed',
    'holdout_sessions_total',
    'holdout_cursors_matched',
    'holdout_cursors_total',
    'challenge_sessions_passed',
    'challenge_sessions_total',
    'challenge_screens_matched',
    'challenge_screens_total',
    'challenge_rng_matched',
    'challenge_rng_total',
    'challenge_cursors_matched',
    'challenge_cursors_total',
    'challenge_manifest_sha256',
    'challenge_evaluation',
];

export const EVENTS = [
    'slice',
    'span',
    'goal',
    'holdout',
    'divergence',
    'challenge',
];

const DEVELOPMENT_FIELDS = Object.freeze([
    'sessions_passed',
    'sessions_total',
    'screens_matched',
    'screens_total',
    'rng_matched',
    'rng_total',
    'cursors_matched',
    'cursors_total',
]);

const HOLDOUT_FIELDS = Object.freeze([
    'holdout_screens_matched',
    'holdout_screens_total',
    'holdout_rng_matched',
    'holdout_rng_total',
    'holdout_sessions_passed',
    'holdout_sessions_total',
    'holdout_cursors_matched',
    'holdout_cursors_total',
]);

const CHALLENGE_COUNT_FIELDS = Object.freeze([
    'challenge_sessions_passed',
    'challenge_sessions_total',
    'challenge_screens_matched',
    'challenge_screens_total',
    'challenge_rng_matched',
    'challenge_rng_total',
    'challenge_cursors_matched',
    'challenge_cursors_total',
]);

const CHALLENGE_FIELDS = Object.freeze([
    ...CHALLENGE_COUNT_FIELDS,
    'challenge_manifest_sha256',
    'challenge_evaluation',
]);

export const DEFAULT_PATH = fileURLToPath(new URL('../SCORE.tsv',
    import.meta.url));

/** Parse SCORE.tsv into row objects keyed by column name. */
export function readRows(path = DEFAULT_PATH) {
    const lines = readFileSync(path, 'utf8').split('\n')
        .filter((line) => line !== '');
    const header = lines[0].split('\t');
    if (header.join(',') !== COLUMNS.join(','))
        throw new Error(`SCORE.tsv header differs from the ${COLUMNS.length} `
            + 'columns this script owns');
    return lines.slice(1).map((line) => {
        const cells = line.split('\t');
        if (cells.length !== COLUMNS.length)
            throw new Error(`SCORE.tsv row has ${cells.length} fields: ${line}`);
        const row = Object.fromEntries(
            COLUMNS.map((column, index) => [column, cells[index]]));
        validateEventFields(row);
        return row;
    });
}

/** Compose one row and append it. Empty string for any column not given. */
export function appendRow(fields, path = DEFAULT_PATH) {
    for (const key of Object.keys(fields)) {
        if (!COLUMNS.includes(key))
            throw new Error(`unknown SCORE.tsv column: ${key}`);
    }
    if (fields.utc) throw new Error('the script sets utc; omit utc=');
    if (!fields.sha) throw new Error('a SCORE.tsv row needs a sha');
    if (!EVENTS.includes(fields.event))
        throw new Error(`event must be one of ${EVENTS.join(', ')}`);
    validateEventFields(fields, { strictEmpty: true });
    // Refuse to append to a stale or malformed ledger. Every writer must use
    // the authoritative current schema.
    readRows(path);
    const row = { utc: new Date().toISOString(), ...fields };
    const cells = COLUMNS.map((column) => {
        const value = String(row[column] ?? '');
        if (/[\t\n"]/u.test(value))
            throw new Error(`value for ${column} contains a tab, newline, or double quote`);
        return value;
    });
    appendFileSync(path, `${cells.join('\t')}\n`);
    return Object.fromEntries(COLUMNS.map((column, i) => [column, cells[i]]));
}

/** Last row, optionally the last row of one event. */
export function latestRow(rows, event = null) {
    for (let index = rows.length - 1; index >= 0; --index) {
        if (!event || rows[index].event === event) return rows[index];
    }
    return null;
}

/**
 * Current standing: the last row stating each figure family.
 *
 * Holdout cells are filled only on rows whose own event ran an evaluation, so
 * the standing carries the last stated figure forward, which is what an empty
 * cell means per the column documentation in scoring.md.
 */
export function standing(rows) {
    const development = latestNonEmpty(
        rows, 'screens_matched', (row) => row.event !== 'challenge');
    const holdout = latestNonEmpty(
        rows, 'holdout_screens_matched', (row) => row.event !== 'challenge');
    // A failed challenge evaluation deliberately has blank count fields. Its
    // artifact path is the durable marker, so it remains the latest challenge
    // standing instead of disappearing behind the previous successful row.
    const challenges = latestNonEmpty(
        rows, 'challenge_evaluation', (row) => row.event === 'challenge');
    return { development, holdout, challenges };
}

function latestNonEmpty(rows, column, predicate = () => true) {
    for (let index = rows.length - 1; index >= 0; --index) {
        if (predicate(rows[index]) && rows[index][column] !== '')
            return rows[index];
    }
    return null;
}

function hasValue(fields, column) {
    return fields[column] !== undefined
        && fields[column] !== null
        && fields[column] !== '';
}

function validateCountPair(fields, matchedColumn, totalColumn) {
    const matched = Number(fields[matchedColumn]);
    const total = Number(fields[totalColumn]);
    if (!/^\d+$/u.test(String(fields[matchedColumn]))
        || !/^\d+$/u.test(String(fields[totalColumn]))
        || !Number.isSafeInteger(matched)
        || !Number.isSafeInteger(total)) {
        throw new Error(`${matchedColumn} and ${totalColumn} must be nonnegative integers`);
    }
    if (matched > total)
        throw new Error(`${matchedColumn} must be no greater than ${totalColumn}`);
}

function validateEventFields(fields, { strictEmpty = false } = {}) {
    const event = fields.event;
    const challengeFieldsPresent = (columns) => columns.some((column) =>
        strictEmpty ? Object.hasOwn(fields, column) : hasValue(fields, column));

    if (event !== 'challenge') {
        if (challengeFieldsPresent(CHALLENGE_FIELDS))
            throw new Error('challenge fields are only valid for event=challenge');
        return;
    }

    if (challengeFieldsPresent(DEVELOPMENT_FIELDS)
        || challengeFieldsPresent(HOLDOUT_FIELDS)) {
        throw new Error('challenge events cannot include development or holdout metrics');
    }

    if (!hasValue(fields, 'challenge_manifest_sha256'))
        throw new Error('challenge events need challenge_manifest_sha256');
    if (!/^[\da-f]{64}$/iu.test(String(fields.challenge_manifest_sha256)))
        throw new Error('challenge_manifest_sha256 must be 64 hexadecimal characters');

    if (!hasValue(fields, 'challenge_evaluation'))
        throw new Error('challenge events need challenge_evaluation');
    if (!/^challenges\/evaluations\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(
        String(fields.challenge_evaluation))) {
        throw new Error('challenge_evaluation must be challenges/evaluations/<name>.json');
    }

    const countValues = CHALLENGE_COUNT_FIELDS.map((column) => fields[column] ?? '');
    const allBlank = countValues.every((value) => value === '');
    const allPresent = countValues.every((value) => value !== '');
    if (!allBlank && !allPresent)
        throw new Error('challenge count fields must be all present or all blank');
    if (allBlank) return;

    for (let index = 0; index < CHALLENGE_COUNT_FIELDS.length; index += 2) {
        validateCountPair(
            fields,
            CHALLENGE_COUNT_FIELDS[index],
            CHALLENGE_COUNT_FIELDS[index + 1],
        );
    }
}

/**
 * Rows from the one matching a sha prefix to the end, inclusive, so a goal's
 * delivered delta is last minus first of the returned slice.
 */
export function rowsSince(rows, shaPrefix) {
    const index = rows.findIndex(({ sha }) => sha.startsWith(shaPrefix));
    if (index < 0)
        throw new Error(`no SCORE.tsv row has a sha starting ${shaPrefix}`);
    return rows.slice(index);
}

/**
 * Generate a note from the current row's figures and the previous standing.
 *
 * Returns a one-line summary with the goal/slice identifier and the figure
 * deltas. The orchestrator can append additional context after this line.
 */
export function generateNote({ event, label, current, previous, holdout }) {
    if (event === 'challenge') {
        throw new Error('challenge notes are recorded by score-challenges --record');
    }
    const parts = [];
    if (label) parts.push(`${label} closes.`);

    if (current && previous) {
        const sm = current.screens_matched ?? current.screensMatched;
        const st = current.screens_total ?? current.screensTotal;
        const rm = current.rng_matched ?? current.rngMatched;
        const rt = current.rng_total ?? current.rngTotal;
        const psm = previous.screens_matched ?? previous.screensMatched;
        const prm = previous.rng_matched ?? previous.rngMatched;
        const sp = current.sessions_passed ?? current.sessionsPassed;
        const sto = current.sessions_total ?? current.sessionsTotal;

        const screensDelta = sm !== psm ? `${psm}→${sm}` : `${sm}`;
        const rngDelta = rm !== prm ? `${prm}→${rm}` : `${rm}`;
        parts.push(`Development ${screensDelta} of ${st} screens,`
            + ` ${rngDelta} of ${rt} rng.`);
        if (sp !== undefined && sto !== undefined) {
            parts.push(`${sp} of ${sto} sessions.`);
        }
    } else if (current) {
        const sm = current.screens_matched ?? current.screensMatched;
        const st = current.screens_total ?? current.screensTotal;
        const rm = current.rng_matched ?? current.rngMatched;
        const rt = current.rng_total ?? current.rngTotal;
        parts.push(`Development ${sm} of ${st} screens,`
            + ` ${rm} of ${rt} rng.`);
    }

    if (holdout) {
        const hsm = holdout.holdout_screens_matched
            ?? holdout.holdoutScreensMatched;
        const hst = holdout.holdout_screens_total
            ?? holdout.holdoutScreensTotal;
        const hrm = holdout.holdout_rng_matched ?? holdout.holdoutRngMatched;
        const hrt = holdout.holdout_rng_total ?? holdout.holdoutRngTotal;
        parts.push(`Holdout ${hsm}/${hst} screens, ${hrm}/${hrt} rng.`);
    }

    return parts.join(' ');
}

function formatRow(row) {
    if (!row) return '(no row)';
    return COLUMNS.filter((column) => row[column] !== '')
        .map((column) => `${column}: ${row[column]}`)
        .join('\n');
}

function main(args) {
    const mode = args[0];
    if (mode === '--append') {
        const fields = Object.fromEntries(args.slice(1).map((pair) => {
            const eq = pair.indexOf('=');
            if (eq < 0) throw new Error(`--append takes column=value, got ${pair}`);
            return [pair.slice(0, eq), pair.slice(eq + 1)];
        }));
        const row = appendRow(fields);
        console.log(formatRow(row));
        return;
    }
    const rows = readRows();
    if (mode === '--latest') {
        const event = args[1] ?? null;
        if (event && !EVENTS.includes(event))
            throw new Error(`unknown event: ${event}`);
        console.log(formatRow(latestRow(rows, event)));
    } else if (mode === '--standing') {
        const { development, holdout, challenges } = standing(rows);
        console.log(`development (${development?.sha ?? 'none'}): `
            + `${development?.screens_matched}/${development?.screens_total} `
            + `screens, ${development?.rng_matched}/${development?.rng_total} rng`);
        console.log(`holdout (${holdout?.sha ?? 'none'}): `
            + `${holdout?.holdout_screens_matched}/`
            + `${holdout?.holdout_screens_total} screens, `
            + `${holdout?.holdout_rng_matched}/${holdout?.holdout_rng_total} rng`);
        console.log(`challenge (${challenges?.sha ?? 'none'}): `
            + `${challenges?.challenge_sessions_passed}/`
            + `${challenges?.challenge_sessions_total} sessions, `
            + `${challenges?.challenge_screens_matched}/`
            + `${challenges?.challenge_screens_total} screens, `
            + `${challenges?.challenge_rng_matched}/`
            + `${challenges?.challenge_rng_total} rng, `
            + `${challenges?.challenge_cursors_matched}/`
            + `${challenges?.challenge_cursors_total} cursors`);
    } else if (mode === '--generate-note') {
        const fields = Object.fromEntries(args.slice(1).map((pair) => {
            const eq = pair.indexOf('=');
            if (eq < 0) throw new Error(
                '--generate-note takes key=value, got ' + pair);
            return [pair.slice(0, eq), pair.slice(eq + 1)];
        }));
        if (!fields.event) throw new Error('--generate-note needs event=...');
        if (fields.event === 'challenge') {
            throw new Error('challenge notes are recorded by score-challenges --record');
        }
        validateEventFields(fields, { strictEmpty: true });
        const { development: prev } = standing(rows);
        console.log(generateNote({
            event: fields.event,
            label: fields.label ?? null,
            current: {
                screens_matched: fields.screens_matched,
                screens_total: fields.screens_total,
                rng_matched: fields.rng_matched,
                rng_total: fields.rng_total,
                sessions_passed: fields.sessions_passed,
                sessions_total: fields.sessions_total,
            },
            previous: prev ? {
                screens_matched: prev.screens_matched,
                rng_matched: prev.rng_matched,
            } : null,
            holdout: fields.holdout_screens_matched ? {
                holdout_screens_matched: fields.holdout_screens_matched,
                holdout_screens_total: fields.holdout_screens_total,
                holdout_rng_matched: fields.holdout_rng_matched,
                holdout_rng_total: fields.holdout_rng_total,
            } : null,
        }));
    } else if (mode === '--since') {
        if (!args[1]) throw new Error('--since takes a sha prefix');
        for (const row of rowsSince(rows, args[1])) {
            // Keep this legacy six-column report development-scoped. Challenge
            // metrics have their own columns and are intentionally omitted.
            console.log(`${row.utc}\t${row.sha}\t${row.event}\t`
                + `${row.event === 'challenge' ? '' : row.screens_matched}\t`
                + `${row.event === 'challenge' ? '' : row.rng_matched}\t${row.note}`);
        }
    } else {
        throw new Error('modes: --append column=value..., --generate-note '
            + 'event=... [label=...] [column=value...], --latest [event], '
            + '--standing, --since <sha>');
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`score-log: ${error.message}`);
        process.exitCode = 1;
    }
}
