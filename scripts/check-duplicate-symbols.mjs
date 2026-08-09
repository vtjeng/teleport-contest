#!/usr/bin/env node

// Index every top-level definition in js/ and print the names defined more
// than once. Thirteen duplicate ports were found in this repository in eight
// days, one review cycle at a time, and three of them disagreed rather than
// merely repeated: artifact.c artifact_light() had five copies whose null
// guards differed, so one threw a TypeError where C returns FALSE.
// AGENTS.md, "Keep each source file's port in one place", puts one port of a C
// function in one JavaScript file, and this makes a second copy mechanical to
// spot.
//
// Informational by construction, so it exits 0 whatever it finds. A second
// definition is sometimes legitimate -- a module-private helper that genuinely
// differs from a same-named export elsewhere -- and only a reader who knows the
// C function can tell that from a divergent duplicate.
//
// The scan reads the blanked source from scripts/check-namespace-members.mjs,
// which overwrites comments, strings, and template text with spaces. That is
// what makes it worth writing: a refusal comment quoting the C body it stands
// in for contains the C function's name, so a grep over the raw text names
// every refusal as a definition.

import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    blankCommentsAndStrings,
    sourceFilesIn,
} from './check-namespace-members.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// js/ alone. scripts/ holds the tooling, whose helpers repeat names across
// scripts on purpose, and a port never lives there.
const DEFAULT_ROOT = 'js';

// A definition at column zero. Every file in js/ indents nested code, so an
// unindented `function`, `class`, `const`, `let`, or `var` is a module-level
// definition and an indented one is not. `\b` after each keyword stops
// `classify` and `constant` from reading as declarations.
const TOP_LEVEL_DEFINITION = new RegExp(
    '^(?:export\\s+)?(?:'
    + '(?:async\\s+)?function\\b\\s*\\*?\\s*([A-Za-z_$][\\w$]*)'
    + '|class\\b\\s+([A-Za-z_$][\\w$]*)'
    + '|(?:const|let|var)\\b\\s+([A-Za-z_$][\\w$]*)\\s*='
    + ')',
    'gmu',
);

/**
 * The key two spellings of one C name share.
 *
 * `is_weptool` and `isWeptool` were the same `mondata.h` macro ported twice
 * under two spellings, so case and underscores cannot distinguish definitions.
 * Folding them together also folds a SCREAMING_SNAKE constant onto a
 * lower-case function of the same letters, which is a name collision worth
 * seeing for the same reason.
 */
export function symbolKey(name) {
    return name.replaceAll('_', '').toLowerCase();
}

/**
 * Every top-level definition in one file's already-blanked source.
 *
 * The kind rides along because it is what separates the two duplicate shapes
 * the fold produces. Two functions of one key are the shape that hurt:
 * `mondata.js` defines `is_elf` and `isElf` from the same `mondata.h` macro. A
 * constant and a function of one key are usually distinct in C, where
 * `LEVITATION` indexes `u.uprops` and `Levitation()` tests it, and only the
 * fold brings them together.
 */
export function definitionsIn(code) {
    const definitions = [];
    TOP_LEVEL_DEFINITION.lastIndex = 0;
    let match;
    while ((match = TOP_LEVEL_DEFINITION.exec(code)) !== null) {
        const name = match[1] ?? match[2] ?? match[3];
        const kind = match[1] ? 'function' : match[2] ? 'class' : 'const';
        definitions.push({ name, kind, line: lineOf(code, match.index) });
    }
    return definitions;
}

function lineOf(source, offset) {
    let line = 1;
    for (let i = 0; i < offset; ++i) if (source[i] === '\n') line += 1;
    return line;
}

/**
 * Index `files` by symbol key.
 *
 * Returns `{ duplicates, definitions }`. `duplicates` holds one entry per key
 * with more than one definition site, ordered by key, each site carrying the
 * file, line, and the spelling used there. `definitions` counts every site
 * scanned, so a scan that silently stopped matching is visible.
 */
export async function indexDefinitions(files) {
    const byKey = new Map();
    let definitions = 0;
    for (const file of files) {
        const code = blankCommentsAndStrings(await readFile(file, 'utf8'));
        const label = displayPath(file);
        for (const { name, kind, line } of definitionsIn(code)) {
            definitions += 1;
            const key = symbolKey(name);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push({ file: label, line, name, kind });
        }
    }
    const duplicates = [...byKey]
        .filter(([, sites]) => sites.length > 1)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, sites]) => ({ key, sites }));
    const callable = duplicates.filter(
        ({ sites }) => sites.every((site) => site.kind !== 'const'));
    return { duplicates, callable: callable.length, definitions };
}

export function formatDuplicate({ key, sites }) {
    return `${key}: ${sites
        .map((site) => `${site.file}:${site.line} ${site.name} (${site.kind})`)
        .join(', ')}`;
}

function displayPath(file) {
    const fromRepo = relative(REPO_ROOT, file);
    return fromRepo.startsWith('..') ? file : fromRepo;
}

export function resolveRoots(args) {
    const roots = args.length ? args : [DEFAULT_ROOT];
    return roots.map((root) => isAbsolute(root) ? root : join(REPO_ROOT, root));
}

async function main(args) {
    const files = resolveRoots(args).flatMap(sourceFilesIn);
    const { duplicates, callable, definitions } = await indexDefinitions(files);
    for (const duplicate of duplicates) console.log(formatDuplicate(duplicate));
    console.log(`indexed ${definitions} top-level definition(s) in `
        + `${files.length} file(s); duplicate symbols: ${duplicates.length} `
        + `(${callable} defined only as functions or classes)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    await main(process.argv.slice(2));
