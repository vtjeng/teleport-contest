#!/usr/bin/env node

// Reject a fixed datetime under scripts/ that js/calendar.js cannot parse.
//
// Recorder patch 001 rewrites calendar.c getnow() to read
// NETHACK_FIXED_DATETIME, and returns time_from_yyyymmddhhmmss() of it only
// when that parses; otherwise it falls through to time(). The patch leaves
// time_from_yyyymmddhhmmss() guarded by `strlen(buf) == 14`, so a value of any
// other width parses as 0 and the reference program silently uses the wall
// clock. js/calendar.js getnow() reproduces that fall-through exactly, which is
// correct and must stay: a port that refused the value instead would diverge
// from the reference.
//
// The cost lands on the tests. A test that passes a malformed datetime gets a
// live clock rather than a fixed one, and every clock-dependent output it
// reaches becomes a function of when the test ran. scripts/insight.test.mjs
// held two such literals, '2026-03-04 10:00:00'; allmain.c moveloop() sets
// urealtime.start_timing from getnow() and insight.c fmt_elapsed_time() calls
// getnow() again, so the elapsed-time line the enlightenment window prints read
// " none" on a fast machine and " 1 second" on a slow one. CI failed on it once,
// on a commit whose diff was three bookkeeping files. The same file's Background
// section gained or lost " It is nighttime." with the hour of the run, and
// moveloop_preamble()'s full-moon and Friday-the-13th arms are one recorded
// input away from the same exposure.
//
// The rule this check enforces is the one getnow() actually applies: every
// fixed datetime a source under scripts/ supplies must satisfy
// parseFixedDatetime(), which is fourteen digits naming a real instant. It is
// imported rather than restated so the check cannot drift from the gate. A
// value that is fourteen digits but names no real date, such as 20240230010203,
// fails here too: js/calendar.js rejects it rather than normalizing, so it
// would reach the wall clock the same way.
//
// `npm test` runs the assertion over the whole repository in
// check-fixed-datetime.test.mjs, and `npm run check:fixed-datetime` runs the
// same scan standalone.
//
// Two site shapes carry a datetime into the game, and the scan covers both:
//
// - A JavaScript source names the value at `datetime:` (the runSegment input
//   key), at `fixedDatetime:` (a hand-built state object), or in an assignment
//   to `.fixedDatetime`. The scan is textual, over source with comments and
//   string bodies blanked by scripts/check-namespace-members.mjs, so a datetime
//   written inside a comment or another string cannot register.
// - A recipe names it at any `datetime` key. Recipes are JSON, so those are
//   parsed and walked rather than scanned, and a problem is located by its key
//   path instead of a line. scripts/diff-fresh.mjs validateCleanRecipe() also
//   refuses a malformed datetime, with a stricter rule that additionally
//   requires a year of 1 or more; that check runs when a recipe is replayed,
//   and this one runs on every committed recipe whether or not anything
//   replays it.
//
// A site whose value is neither a string literal nor a same-file constant is
// unresolved: `datetime: segment.datetime` reads a recorded session, and
// `fixedDatetime: value` in calendar.test.mjs is a parameter the malformed
// cases are deliberately fed through. Neither can be decided by reading the
// source, so both are counted and reported rather than failed.

import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFixedDatetime } from '../js/calendar.js';
import { blankCommentsAndStrings } from './check-namespace-members.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Every hand-written test and recipe lives directly in one of these two
// directories. Listing both, rather than walking scripts/ recursively, keeps
// the fixtures this check's own test feeds it out of the default scan; the
// other fixture directories under scripts/fixtures/ hold deliberately broken
// sources for the sibling checks and are out for the same reason.
const DEFAULT_ROOTS = ['scripts', 'scripts/fixtures'];

const SOURCE_EXTENSIONS = ['.js', '.mjs'];
const RECIPE_EXTENSION = '.json';

// `datetime: <value>` in an object literal, and any assignment or declaration
// of a `datetime` or `fixedDatetime` name. The value group is optional so a
// site whose value is an expression still matches its key and can be counted.
// `\b` keeps `this._datetime` and `NETHACK_FIXED_DATETIME` out: a word
// character precedes the name in both. The trailing lookahead keeps the
// identifier alternative to a plain reference, so `datetime: segment.datetime`
// reads as the expression it is rather than as a constant named `segment`.
//
// The `{ datetime }` shorthand needs no arm of its own. It reads a variable of
// the same name, and `const datetime = '<value>'` is itself an assignment this
// pattern matches, so the value is checked where it is written.
const DATETIME_SITE =
    /\b(datetime|fixedDatetime)\s*[:=]\s*(?:(['"])([^'"\n]*)\2|([A-Za-z_$][\w$]*)(?![\w$.([]))?/dgu;

// `const NAME = '<value>'`, the form every datetime constant under scripts/ is
// declared in. Resolution is deliberately same-file and one level deep: the
// tests name their datetimes as file-local constants, and following an import
// would turn this into a module resolver for no case that exists.
const STRING_CONSTANT =
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\n]*)\2/dgu;

function lineOf(source, offset) {
    let line = 1;
    for (let i = 0; i < offset; ++i) if (source[i] === '\n') line += 1;
    return line;
}

/**
 * Map every same-file string constant to the values it is declared with.
 *
 * A name declared more than once maps to every value, so a second declaration
 * cannot hide a malformed first one behind a well-formed later one.
 */
export function stringConstants(source) {
    const code = blankCommentsAndStrings(source);
    const constants = new Map();
    STRING_CONSTANT.lastIndex = 0;
    let match;
    while ((match = STRING_CONSTANT.exec(code)) !== null) {
        // The value is blanked in `code`, so read its span out of the raw
        // source.
        const [start, end] = match.indices[3];
        const name = match[1];
        if (!constants.has(name)) constants.set(name, new Set());
        constants.get(name).add(source.slice(start, end));
    }
    return constants;
}

/**
 * List every fixed-datetime site in a JavaScript source.
 *
 * Returns `{ key, line, via, values }` records in source order. `values` holds
 * the literal the site names, or every value its constant is declared with; it
 * is empty when the value is an expression no static read can resolve. `via`
 * names that constant, because a site reached through one is not where the
 * value has to be edited.
 */
export function findDatetimeSites(source) {
    const code = blankCommentsAndStrings(source);
    const constants = stringConstants(source);
    const found = [];
    DATETIME_SITE.lastIndex = 0;
    let match;
    while ((match = DATETIME_SITE.exec(code)) !== null) {
        const literal = match.indices[3];
        const via = literal ? null : match[4] ?? null;
        found.push({
            key: match[1],
            line: lineOf(code, match.index),
            via,
            // The literal is blanked in `code`, so read its span out of the
            // raw source.
            values: literal
                ? [source.slice(literal[0], literal[1])]
                : [...constants.get(via) ?? []],
        });
    }
    return found;
}

/**
 * List every `datetime` value a parsed recipe carries.
 *
 * Returns `{ path, value }` records, `path` naming the keys and array indices
 * walked to reach the value. A non-string value is reported with its own type
 * so the caller can refuse it rather than coerce it.
 */
export function findRecipeDatetimes(node, path = []) {
    if (node === null || typeof node !== 'object') return [];
    if (Array.isArray(node)) {
        return node.flatMap(
            (item, index) => findRecipeDatetimes(item, [...path, index]),
        );
    }
    return Object.entries(node).flatMap(([key, value]) => (
        key === 'datetime'
            ? [{ path: [...path, key].join('/'), value }]
            : findRecipeDatetimes(value, [...path, key])
    ));
}

function refusal(value) {
    if (typeof value !== 'string')
        return `is a ${typeof value} rather than a string`;
    if (parseFixedDatetime(value) !== null) return null;
    return 'is not fourteen digits naming a real instant, so calendar.c '
        + 'getnow() falls back to the wall clock';
}

/**
 * Check every fixed datetime in `files`.
 *
 * Returns `{ problems, notes, checked, unresolved }`. `problems` fail the
 * check. `notes` name the sites whose value the scan could not read, and
 * `checked` counts the values it did read, so a scan that silently matched
 * nothing is visible in the summary line.
 */
export async function checkFiles(files) {
    const problems = [];
    const notes = [];
    let checked = 0;

    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const label = displayPath(file);
        if (file.endsWith(RECIPE_EXTENSION)) {
            for (const { path, value } of findRecipeDatetimes(
                JSON.parse(source),
            )) {
                checked += 1;
                const why = refusal(value);
                if (why) problems.push(`${label}: ${path} ${why}`);
            }
            continue;
        }
        for (const { key, line, via, values } of findDatetimeSites(source)) {
            if (!values.length) {
                notes.push(`${label}:${line}: ${key} `
                    + (via
                        ? `reads ${via}, which no string constant in this `
                            + 'file declares'
                        : 'is set from an expression, which no static read '
                            + 'can resolve'));
                continue;
            }
            for (const value of values) {
                checked += 1;
                const why = refusal(value);
                if (why) {
                    problems.push(`${label}:${line}: ${key}`
                        + `${via ? `, from ${via},` : ''} '${value}' ${why}`);
                }
            }
        }
    }
    return { problems, notes, checked, unresolved: notes.length };
}

function displayPath(file) {
    const fromRepo = relative(REPO_ROOT, file);
    return fromRepo.startsWith('..') ? file : fromRepo;
}

/** List the tests and recipes directly in `root`, without descending. */
export function datetimeSourcesIn(root) {
    return readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile()
            && [...SOURCE_EXTENSIONS, RECIPE_EXTENSION].some(
                (ext) => entry.name.endsWith(ext),
            ))
        .map((entry) => join(root, entry.name))
        .sort();
}

export function resolveRoots(args) {
    const roots = args.length ? args : DEFAULT_ROOTS;
    return roots.map((root) => isAbsolute(root) ? root : join(REPO_ROOT, root));
}

async function main(args) {
    const files = resolveRoots(args).flatMap(datetimeSourcesIn);
    const { problems, notes, checked, unresolved } = await checkFiles(files);
    for (const problem of problems) console.error(problem);
    for (const note of notes) console.log(note);
    console.log(`checked ${checked} fixed datetime(s) in ${files.length} `
        + `file(s); unparseable: ${problems.length}, unresolved: ${unresolved}`);
    if (problems.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    await main(process.argv.slice(2));
