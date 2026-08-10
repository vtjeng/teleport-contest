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
//
// Two indexes, because one fold cannot do both jobs. The exact index folds
// case and underscores, which is what caught is_weptool()/isWeptool(); a
// duplicate that differs by suffix or word order slips past it, and rm.h
// SURFACE_AT() is ported four times as surface_typ(), surfaceAt() and twice as
// surfaceType(). The near-miss index sorts the name's words and drops the ones
// that carry no meaning, and reports only groups that span more than one exact
// key, so it adds sites rather than repeating them.
//
// Neither index reaches a copy that has no name. js/display.js and
// js/monmove.js each inline the same SURFACE_AT() switch with no definition to
// index, and only reading the C function finds those.

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
//
// Exported because scripts/quality-status.mjs asks the same question of js/
// for a deferral's `blockedOn` symbol, and two spellings of "a definition at
// column zero" could answer it differently. It carries `g`, so every reader
// resets `lastIndex` before its first `exec`.
export const TOP_LEVEL_DEFINITION = new RegExp(
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

// Words that describe a name's shape rather than what it answers. `surface_typ`
// and `surfaceAt` are one macro under two of them, so a fold that keeps them
// separates two ports of one C function.
const SHAPE_WORDS = new Set(['at', 'typ', 'type', 'for', 'of']);

/**
 * The key two namings of one C function share when their words agree.
 *
 * The name is split on underscores and case boundaries, lowercased, stripped of
 * shape words, and sorted, so `surface_typ`, `surfaceAt` and `surfaceType` all
 * become `surface` while `is_weptool` and `weptool_is` become `is weptool`.
 * A name that is nothing but shape words has no key and is not indexed.
 */
export function nearMissKey(name) {
    const words = name
        .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
        .replaceAll('_', ' ')
        .toLowerCase()
        .split(' ')
        .filter((word) => word && !SHAPE_WORDS.has(word));
    return words.sort().join(' ');
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

function groupsWithSeveralSites(byKey) {
    return [...byKey]
        .filter(([, sites]) => sites.length > 1)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, sites]) => ({ key, sites }));
}

/**
 * Index `files` by symbol key and by near-miss key.
 *
 * Returns `{ duplicates, callable, definitions, nearMisses }`. `duplicates`
 * holds one entry per exact key with more than one definition site, ordered by
 * key, each site carrying the file, line, and the spelling used there.
 * `nearMisses` holds the same shape for the looser key, less every group whose
 * sites all share one exact key, which `duplicates` already reports.
 * `definitions` counts every site scanned, so a scan that silently stopped
 * matching is visible.
 */
export async function indexDefinitions(files) {
    const byKey = new Map();
    const byNearMissKey = new Map();
    let definitions = 0;
    for (const file of files) {
        const code = blankCommentsAndStrings(await readFile(file, 'utf8'));
        const label = displayPath(file);
        for (const { name, kind, line } of definitionsIn(code)) {
            definitions += 1;
            const site = { file: label, line, name, kind };
            const key = symbolKey(name);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(site);
            const nearMiss = nearMissKey(name);
            if (!nearMiss) continue;
            if (!byNearMissKey.has(nearMiss)) byNearMissKey.set(nearMiss, []);
            byNearMissKey.get(nearMiss).push(site);
        }
    }
    const duplicates = groupsWithSeveralSites(byKey);
    const nearMisses = groupsWithSeveralSites(byNearMissKey).filter(
        ({ sites }) => new Set(sites.map((site) => symbolKey(site.name))).size
            > 1);
    const callable = duplicates.filter(
        ({ sites }) => sites.every((site) => site.kind !== 'const'));
    return {
        callable: callable.length, definitions, duplicates, nearMisses,
    };
}

export function formatDuplicate({ key, sites }) {
    return `${key}: ${sites
        .map((site) => `${site.file}:${site.line} ${site.name} (${site.kind})`)
        .join(', ')}`;
}

export function formatNearMiss(group) {
    return `near-miss ${formatDuplicate(group)}`;
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
    const { duplicates, callable, definitions, nearMisses } =
        await indexDefinitions(files);
    for (const duplicate of duplicates) console.log(formatDuplicate(duplicate));
    for (const group of nearMisses) console.log(formatNearMiss(group));
    // Two summary lines, because the first one's count is quoted in the
    // checkpoint summary and in two deferral entries: adding to it would change
    // a number those readers compare against their own commit.
    console.log(`indexed ${definitions} top-level definition(s) in `
        + `${files.length} file(s); duplicate symbols: ${duplicates.length} `
        + `(${callable} defined only as functions or classes)`);
    console.log(`near-miss keys: ${nearMisses.length} (`
        + `${nearMisses.reduce((total, { sites }) => total + sites.length, 0)}`
        + ' site(s))');
}

if (process.argv[1] === fileURLToPath(import.meta.url))
    await main(process.argv.slice(2));
