#!/usr/bin/env node

// The pin files and counts that docs/testing.md, "Deliberate gaps", must
// name. scripts/deliberate-gaps.test.mjs runs the check.
//
// A pin file is a file directly under scripts/ that either
// - calls assertExceptionCount() from scripts/exception-count.mjs, which
//   AGENTS.md, "Fix a repeated defect at its source", requires of every
//   check that tolerates exceptions; or
// - is JSON data other than a test input named *.fixture.json, such as
//   scripts/discarded-promise-allowlist.json and scripts/throw-site-list.json.
// Each pin file is classified below, either as a list of deliberate gaps or
// as a list that holds no gap, with a reason. The check fails on a pin file
// that is not classified, on a classified file that is no longer a pin file,
// and on a pin file the section does not name, so a new list forces a
// decision and a line in the section.
//
// The rule cannot find an exception list whose check pins its size some
// other way. NAMED_BY_HAND lists the ones known on 24 November 2026; the
// section must name them too. A list added later in that form is found by
// nothing here.
//
// The section also states counts taken from the pins and from scans of js/.
// countPhrases() builds each statement from the current files, and the check
// fails when the section does not contain it word for word.
//
//   node scripts/deliberate-gaps.mjs   print the pin files and the count statements

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';

import { LAGGING_RECORDINGS } from './rng-step-compare.mjs';
import { NOT_PORTED_BY_DESIGN } from './not-ported-by-design.mjs';
import { C_MESSAGE_EXEMPTIONS } from './c-message-exemptions.mjs';
import { SKIPPED_CALL_REASONS, readJsFiles, skippedCalls } from './skipped-call-reasons.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(SCRIPT_PATH, '..', '..');

export const DOC_PATH = 'docs/testing.md';
export const SECTION_HEADING = '## Deliberate gaps';

// Pin files whose entries are behaviour the port deliberately does not
// reproduce, with the row of the section that names them.
export const GAP_LISTS = new Map([
    ['scripts/level-difficulty-steps.test.mjs', 'reports printed at the next message'],
    ['scripts/queued-output-calls.test.mjs', 'reports printed at the next message'],
    ['scripts/discarded-promise-allowlist.json',
        'reports printed at the next message (the entries that reach sync_impossible())'],
    ['scripts/discarded-promises.test.mjs',
        'reports printed at the next message (pins scripts/discarded-promise-allowlist.json)'],
    ['scripts/rng-step-compare.test.mjs',
        'reports printed at the next message (pins LAGGING_RECORDINGS)'],
    ['scripts/skipped-call-reasons.test.mjs', 'C calls recorded with note_unported()'],
    ['scripts/option-statement-sources.test.mjs',
        'C calls recorded with note_unported() (the ones in js/options.js)'],
    ['scripts/throw-site-list.json', 'internal errors that end a segment'],
    ['scripts/throw-sites.test.mjs',
        'internal errors that end a segment (pins scripts/throw-site-list.json)'],
]);

// Pin files that hold no deliberate gap, each with the reason.
const EQUIVALENT = 'reviewed equivalences: each entry does what C does by another route';
const SCAN_LIMIT = 'sites a source scan cannot read, not behaviour';
export const NOT_GAP_LISTS = new Map([
    ['scripts/c-diagnostic-markers.test.mjs', 'C diagnostics that test a resource or state the '
        + 'port does not have, or that cannot fire in C either'],
    ['scripts/check-c-constants.test.mjs', EQUIVALENT],
    ['scripts/front-pushed-lists.test.mjs', EQUIVALENT],
    ['scripts/half-physical-damage.test.mjs', EQUIVALENT],
    ['scripts/level-relative-times.test.mjs', EQUIVALENT],
    ['scripts/menu-overlay-source.test.mjs', EQUIVALENT],
    ['scripts/print-time-flags.test.mjs', EQUIVALENT],
    ['scripts/rm-flags-overlay.test.mjs', EQUIVALENT],
    ['scripts/room-index-lookup.test.mjs', EQUIVALENT],
    ['scripts/visibility-predicate-reviewed.json', EQUIVALENT],
    ['scripts/you-feel-literal.test.mjs', EQUIVALENT],
    ['scripts/you-see-prefix.test.mjs', EQUIVALENT],
    ['scripts/youprop-reads.test.mjs', EQUIVALENT],
    ['scripts/check-fixed-datetime.test.mjs', SCAN_LIMIT],
    ['scripts/check-namespace-members.test.mjs', SCAN_LIMIT],
    ['scripts/missile-callee-defaults.test.mjs', SCAN_LIMIT],
    ['scripts/scatter-operations.test.mjs', SCAN_LIMIT],
    ['scripts/excluded-window.test.mjs', 'reviewed copies of excluded commits, not behaviour'],
    ['scripts/run-segment-imports.test.mjs',
        'files that call the judge\'s runSegment() on purpose, not behaviour'],
    ['scripts/known-failures.test.mjs', 'recordings the port does not match yet: the '
        + '"Known failures" section'],
    ['scripts/unreachable-guards.test.mjs',
        'refusals of unported paths, which are pending work rather than decisions'],
    ['scripts/unsupported-operation.test.mjs',
        'refusals of unported paths, which are pending work rather than decisions'],
    ['scripts/exception-count.test.mjs', 'the helper\'s own test'],
    ['scripts/deliberate-gaps.test.mjs', 'this check'],
]);

// Whether module source calls assertExceptionCount(). The syntax tree keeps
// comments and strings that mention the name from counting.
export function callsAssertExceptionCount(source) {
    if (!source.includes('assertExceptionCount')) return false;
    let found = false;
    const visit = (node) => {
        if (found) return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier'
            && node.callee.name === 'assertExceptionCount') {
            found = true;
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'loc') continue;
            for (const child of Array.isArray(value) ? value : [value])
                if (child && typeof child.type === 'string') visit(child);
        }
    };
    visit(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
    return found;
}

// Exception lists the pin-file rule cannot find, which the section must
// name all the same.
export const NAMED_BY_HAND = Object.freeze([
    'scripts/c-message-exemptions.mjs',
    'scripts/column-zero-guard.test.mjs',
    'scripts/impossible-sites.test.mjs',
    'scripts/not-ported-by-design.mjs',
    'scripts/note-unported-stale.test.mjs',
]);

// Every pin file directly under `scriptsDir`, as 'scripts/<name>', sorted.
export function findPinFiles(scriptsDir = join(PROJECT_ROOT, 'scripts')) {
    return readdirSync(scriptsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => (name.endsWith('.json') && !name.endsWith('.fixture.json'))
            || (name.endsWith('.mjs')
                && callsAssertExceptionCount(readFileSync(join(scriptsDir, name), 'utf8'))))
        .map((name) => `scripts/${name}`)
        .sort();
}

// Problems with the classification of `pinFiles`.
export function classificationProblems(pinFiles, gaps = GAP_LISTS, notGaps = NOT_GAP_LISTS) {
    const problems = [];
    const found = new Set(pinFiles);
    for (const file of pinFiles) {
        if (gaps.has(file) && notGaps.has(file))
            problems.push(`${file}: classified both as a gap list and as not one`);
        else if (!gaps.has(file) && !notGaps.has(file))
            problems.push(`${file}: a new pin file; add it to GAP_LISTS or NOT_GAP_LISTS `
                + 'in scripts/deliberate-gaps.mjs and name it in the section');
    }
    for (const [name, map] of [['GAP_LISTS', gaps], ['NOT_GAP_LISTS', notGaps]]) {
        for (const [file, reason] of map) {
            if (!found.has(file)) problems.push(`${file}: no longer a pin file; remove it from ${name}`);
            if (!reason?.trim()) problems.push(`${file}: needs a reason in ${name}`);
        }
    }
    return problems;
}

// The text of the section, from its heading to the next level-2 heading.
export function gapSection(markdown) {
    const lines = markdown.split('\n');
    const start = lines.indexOf(SECTION_HEADING);
    if (start < 0) throw new Error(`${DOC_PATH} has no "${SECTION_HEADING}" heading`);
    const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
    return lines.slice(start, end < 0 ? lines.length : end).join('\n');
}

// Every repository path the section names in backticks. A path may end in a
// function name after a space (`js/dungeon.js level_info()`); only the path
// is kept.
const PATH = /^(?:\.agents|challenges|docs|experiments|frozen|js|nethack-c|recipes|recordings|scripts)\/[^\s`]+/u;
export function sectionPaths(section) {
    const paths = new Set();
    for (const [, code] of section.matchAll(/`([^`\n]+)`/gu)) {
        const match = PATH.exec(code);
        if (match) paths.add(match[0]);
    }
    return [...paths].sort();
}

// Problems with the section: a pin file it does not name, a path it names
// that does not exist, and a count statement it lacks.
export function sectionProblems(section, { pinFiles, phrases, exists }) {
    const problems = [];
    const paths = sectionPaths(section);
    if (!paths.length) problems.push('the section names no repository path');
    const named = new Set(paths);
    for (const file of pinFiles)
        if (!named.has(file)) problems.push(`${file}: a pin file the section does not name`);
    for (const path of paths)
        if (!exists(path)) problems.push(`${path}: named in the section but missing`);
    for (const phrase of phrases)
        if (!section.includes(phrase)) problems.push(`the section must say: ${phrase}`);
    return problems;
}

// A pinned number read from a test file's source, which cannot be imported
// without running its tests. Throws when the pattern finds nothing, so a
// renamed pin fails the check instead of skipping it.
function readPin(file, pattern) {
    const match = pattern.exec(readFileSync(join(PROJECT_ROOT, file), 'utf8'));
    if (!match) throw new Error(`${file}: no match for ${pattern}`);
    return match.slice(1).map(Number);
}

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

// The calls of a function named `callee` in `jsFiles` (as readJsFiles()
// gives them) whose nearest enclosing function is `async` when `inAsync` is
// true, or is not when it is false: { calls, functions }, where a function
// is the outermost named function around the call, per file.
export function callsIn(jsFiles, callee, inAsync) {
    let calls = 0;
    const functions = new Set();
    for (const { path, source } of jsFiles) {
        if (!source.includes(callee)) continue;
        const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
        const visit = (node, ancestors) => {
            if (node.type === 'CallExpression') {
                const c = node.callee;
                const name = c.type === 'Identifier' ? c.name
                    : c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
                const nearest = ancestors.findLast((a) => FUNCTION_TYPES.has(a.type));
                if (name === callee && Boolean(nearest?.async) === inAsync) {
                    calls += 1;
                    functions.add(`${path} ${outermostName(ancestors)}`);
                }
            }
            ancestors.push(node);
            for (const [key, value] of Object.entries(node)) {
                if (key === 'loc') continue;
                for (const child of Array.isArray(value) ? value : [value])
                    if (child && typeof child.type === 'string') visit(child, ancestors);
            }
            ancestors.pop();
        };
        visit(ast, []);
    }
    return { calls, functions: functions.size };
}

function outermostName(ancestors) {
    for (let i = 0; i < ancestors.length; i++) {
        if (!FUNCTION_TYPES.has(ancestors[i].type)) continue;
        const parent = ancestors[i - 1];
        const own = ancestors[i].id?.name
            ?? (parent?.type === 'VariableDeclarator' ? parent.id?.name : null);
        if (own) return own;
    }
    return '<module>';
}

// The count statements the section must contain, built from the current
// pins and js/.
export function countPhrases() {
    const jsFiles = readJsFiles();
    const [ldEntries, ldCalls] = readPin('scripts/level-difficulty-steps.test.mjs',
        /const ALLOWED_PINS = \{ entries: (\d+), calls: (\d+) \};/u);
    const [qoEntries, qoCalls] = readPin('scripts/queued-output-calls.test.mjs',
        /const ALLOWED_PINS = \{ entries: (\d+), calls: (\d+) \};/u);
    const [syncCallers] = readPin('scripts/queued-output-calls.test.mjs',
        /const SYNC_CALLER_PIN = (\d+);/u);
    const allowlist = Object.values(JSON.parse(readFileSync(
        join(PROJECT_ROOT, 'scripts/discarded-promise-allowlist.json'), 'utf8')).entries);
    const throwSites = Object.values(JSON.parse(readFileSync(
        join(PROJECT_ROOT, 'scripts/throw-site-list.json'), 'utf8')).entries);
    const throwsOf = (cls) => throwSites.filter((entry) => entry.class === cls)
        .reduce((sum, entry) => sum + entry.count, 0);
    const newcham = callsIn(jsFiles, 'newcham', true);
    const syncImpossible = callsIn(jsFiles, 'sync_impossible', false);
    const skipped = skippedCalls(jsFiles);
    const wizkit = skipped.filter(({ labels }) => labels?.includes('files.c fopen_wizkit_file'));
    return [
        `\`scripts/level-difficulty-steps.test.mjs\`: ${ldEntries} entries holding ${ldCalls} calls`,
        `\`scripts/queued-output-calls.test.mjs\`: ${qoEntries} entries holding ${qoCalls} calls `
            + `in \`ALLOWED\`, and ${syncCallers} calls in \`SYNC_CALLERS\``,
        `\`scripts/discarded-promise-allowlist.json\`: ${allowlist.length} entries holding `
            + `${allowlist.reduce((sum, entry) => sum + entry.count, 0)} calls`,
        `\`LAGGING_RECORDINGS\` in \`scripts/rng-step-compare.mjs\`: ${LAGGING_RECORDINGS.size} recordings`,
        `${newcham.calls} \`newcham()\` calls in ${newcham.functions} \`async\` functions`,
        `${syncImpossible.calls} \`sync_impossible()\` calls in ${syncImpossible.functions} functions`,
        `${skipped.length} calls under ${SKIPPED_CALL_REASONS.size} labels`,
        `${wizkit.length} of the \`note_unported()\` calls`,
        `${throwsOf('panic')} \`panic\` throws`,
        `${throwsOf('guard')} \`guard\` throws`,
        `${Object.keys(NOT_PORTED_BY_DESIGN).length} C files`,
        `${C_MESSAGE_EXEMPTIONS.length} C messages`,
    ];
}

// Whether a path the section names exists in the repository.
export const existsInRepository = (path) => existsSync(join(PROJECT_ROOT, path));

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    const pinFiles = findPinFiles();
    console.log(`Pin files (${pinFiles.length}):`);
    for (const file of pinFiles) {
        const gap = GAP_LISTS.get(file);
        const notGap = NOT_GAP_LISTS.get(file);
        console.log(`  ${file}: ${gap ? `gap list, ${gap}` : notGap ? `not gaps, ${notGap}`
            : 'NOT CLASSIFIED'}`);
    }
    console.log('Count statements:');
    for (const phrase of countPhrases()) console.log(`  ${phrase}`);
}
