#!/usr/bin/env node

// Report the lines in js/ that neither of the port's two oracles executes.
//
// THIS IS NOT A SCORE, AND MUST NEVER BECOME ONE. It prints no percentage, has
// no threshold, and fails on nothing it measures. Coverage records execution,
// not checking: scripts/bhit.test.mjs once gave js/zap.js:599 full line
// coverage while asserting the inverted form of C's `!rn2(3)`, so a fully
// covered line certified a production bug all the way into a formal audit.
// A line this report omits was reached, which says nothing about whether
// anything checked what it did. Treat the counts as a work queue for
// scripts/mutate-sites.mjs and for new assertions, never as a number to raise.
//
// What it does say is worth knowing. The port has two independent oracles:
//
//   tests   `npm test`, which asserts behavior directly.
//   score   `scripts/score-development.mjs`, which replays 33 recorded C
//           sessions and compares every random-number call and screen
//           positionally.
//
// A js/ line the score executes is pinned by the strongest oracle here. A line
// neither population executes is guarded by nothing at all, and until this
// script existed nobody could tell the two apart -- a mutation sweep could
// report survivors with no way to say which of them mattered.
//
// How it measures. Both populations run under NODE_V8_COVERAGE, Node's own
// built-in V8 coverage dump, which needs no dependency. Both spawn children --
// frozen/ps_test_runner.mjs runs one child per recorded session, `node --test`
// one per test file -- and the measurement lives or dies on whether coverage
// follows them.
//
// It does, and more firmly than an inherited environment would give. Node's
// child_process copies NODE_V8_COVERAGE into every spawned child even when the
// caller replaces `env` outright; the comment on the line that does it reads
// "process.env.NODE_V8_COVERAGE always propagates". A scrubbed environment is
// therefore not the risk. A child that never reaches exit is: a process killed
// on spawnSync's `timeout` writes no dump at all and reports nothing about it,
// which is why the score population below runs with a raised per-session
// timeout and why runPopulation() counts the children that loaded js/jsmain.js
// against the number of sessions the runner reported.
//
// The score population runs in the temporary workspace
// scripts/scoring-workspace.mjs builds, whose js/ is a byte copy of this
// repository's, so a coverage URL under a `teleport-score-*` directory maps
// back to the repository file of the same name and its line numbers still
// apply.
//
// A line counts as executed when some code character on it lies in a V8 range
// with a nonzero count. Comments, string bodies, and blank lines are not code
// characters -- scripts/check-namespace-members.mjs blanks them -- so they are
// neither reported nor counted. The unit is a line, so a line holding both an
// executed and an unexecuted expression reads as executed; that direction is
// deliberate, because a false "unexecuted" sends someone to write a test that
// was never needed.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blankCommentsAndStrings } from './check-namespace-members.mjs';
import { parseRunnerBundle } from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const JS_DIR = join(REPO_ROOT, 'js');

// The judge overwrites these three with its own copies before scoring, so what
// this repository's versions execute is not the port's business.
export const JUDGE_SUPPLIED = new Set([
    'isaac64.js', 'terminal.js', 'storage.js',
]);

// scripts/scoring-workspace.mjs names its temporary root with this prefix.
const WORKSPACE_PREFIX = 'teleport-score-';

export const POPULATIONS = [
    {
        name: 'tests',
        label: 'npm test',
        argv: ['scripts/run-test-suite.mjs', 'default'],
        env: {},
        // `node --test` imports no js/ module in its own process, so any js/
        // file at all proves coverage reached the per-file children.
        requiredFile: null,
    },
    {
        name: 'score',
        label: 'scripts/score-development.mjs',
        argv: ['scripts/score-development.mjs'],
        // A worker killed on the per-session timeout writes no coverage and
        // says nothing about it, so give the slower instrumented run room.
        // frozen/ps_test_runner.mjs reads this and defaults to 45 s.
        env: { SESSION_REPLAY_TIMEOUT_MS: '180000' },
        // Only a per-session worker imports js/jsmain.js: neither
        // scripts/score-development.mjs nor the ps_test_runner parent that
        // spawns the workers ever calls runSession(). Its absence therefore
        // means the workers dropped out of the measurement, and exactly one
        // worker per session loads it, so the count of dumps holding it has to
        // equal the number of sessions the runner reported.
        requiredFile: 'js/jsmain.js',
        dumpsMatchSessions: true,
    },
];

// ---------------------------------------------------------------------------
// Source geometry
// ---------------------------------------------------------------------------

/**
 * Index one source file by line and by the offsets that carry code.
 *
 * `codeOffsets` is sorted and holds every offset whose blanked character is
 * neither whitespace nor a line break, so a comment or a string body never
 * decides whether a line ran. `spanOfLine` maps a line to its `[from, to)`
 * slice of `codeOffsets`.
 */
export function buildLineIndex(source) {
    const blanked = blankCommentsAndStrings(source);
    const lineStarts = [0];
    const codeOffsets = [];
    const lineOfCodeOffset = [];
    let line = 1;
    for (let offset = 0; offset < blanked.length; ++offset) {
        const ch = blanked[offset];
        if (ch === '\n') {
            line += 1;
            lineStarts.push(offset + 1);
            continue;
        }
        if (ch === ' ' || ch === '\t' || ch === '\r') continue;
        codeOffsets.push(offset);
        lineOfCodeOffset.push(line);
    }
    const spanOfLine = new Map();
    for (let index = 0; index < lineOfCodeOffset.length; ++index) {
        const at = lineOfCodeOffset[index];
        const span = spanOfLine.get(at);
        if (span) span[1] = index + 1;
        else spanOfLine.set(at, [index, index + 1]);
    }
    return {
        length: blanked.length,
        lineStarts,
        codeOffsets,
        lineOfCodeOffset,
        spanOfLine,
        codeLines: [...spanOfLine.keys()],
    };
}

export function lineAtOffset(index, offset) {
    const { lineStarts } = index;
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (lineStarts[mid] <= offset) low = mid;
        else high = mid - 1;
    }
    return low + 1;
}

// ---------------------------------------------------------------------------
// V8 coverage
// ---------------------------------------------------------------------------

/**
 * Flatten one script's V8 ranges into non-overlapping segments.
 *
 * V8 nests its ranges: a function's range contains its blocks' ranges, and an
 * inner range's count replaces the outer one over its span. Sorting by start
 * ascending and end descending puts every container before what it contains,
 * which is what lets a single stack sweep resolve the innermost count.
 */
export function flattenRanges(scriptCoverage) {
    const ranges = [];
    for (const fn of scriptCoverage.functions ?? [])
        for (const range of fn.ranges ?? []) ranges.push(range);
    ranges.sort((left, right) => left.startOffset - right.startOffset
        || right.endOffset - left.endOffset);

    const flat = [];
    const stack = [];
    let cursor = 0;
    const close = (until) => {
        while (stack.length && stack.at(-1).endOffset <= until) {
            const top = stack.pop();
            if (cursor < top.endOffset)
                flat.push({ start: cursor, end: top.endOffset,
                    count: top.count });
            cursor = Math.max(cursor, top.endOffset);
        }
    };
    for (const range of ranges) {
        close(range.startOffset);
        if (cursor < range.startOffset) {
            flat.push({ start: cursor, end: range.startOffset,
                count: stack.at(-1)?.count ?? 0 });
            cursor = range.startOffset;
        }
        stack.push(range);
    }
    close(Infinity);
    return flat;
}

function countAtOffset(flat, offset) {
    let low = 0;
    let high = flat.length - 1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (offset < flat[mid].start) high = mid - 1;
        else if (offset >= flat[mid].end) low = mid + 1;
        else return flat[mid].count;
    }
    // Outside every range. V8 emits one range spanning the whole script, so
    // this only happens past the end of what it compiled.
    return 0;
}

/**
 * List the lines of one script that this coverage entry never executed.
 *
 * Walking the zero-count segments rather than the whole file keeps the work
 * proportional to the unexecuted part, which is the small part. A line is
 * unexecuted only when every one of its code offsets sits in a zero-count
 * segment.
 */
export function unexecutedLineNumbers(scriptCoverage, index) {
    const flat = flattenRanges(scriptCoverage);
    const candidates = new Set();
    for (const segment of flat) {
        if (segment.count !== 0) continue;
        const from = lineAtOffset(index, segment.start);
        const to = lineAtOffset(index, Math.max(segment.start,
            Math.min(segment.end, index.length) - 1));
        for (let line = from; line <= to; ++line)
            if (index.spanOfLine.has(line)) candidates.add(line);
    }

    const unexecuted = new Set();
    for (const line of candidates) {
        const [from, to] = index.spanOfLine.get(line);
        let executed = false;
        for (let at = from; at < to && !executed; ++at)
            if (countAtOffset(flat, index.codeOffsets[at]) > 0) executed = true;
        if (!executed) unexecuted.add(line);
    }
    return unexecuted;
}

/**
 * Map a V8 coverage URL onto a repository-relative js/ path.
 *
 * Returns null for anything else, including the three judge-supplied files.
 * Two roots produce js/ URLs: this repository, and the temporary scoring
 * workspace, whose js/ is a byte copy of it.
 */
export function jsFileForCoverageUrl(url) {
    if (!url.startsWith('file://')) return null;
    let path;
    try {
        path = fileURLToPath(url);
    } catch {
        return null;
    }
    const directory = dirname(path);
    if (basename(directory) !== 'js') return null;
    const root = dirname(directory);
    if (root !== REPO_ROOT && !basename(root).startsWith(WORKSPACE_PREFIX))
        return null;
    const name = basename(path);
    if (!name.endsWith('.js') || JUDGE_SUPPLIED.has(name)) return null;
    return `js/${name}`;
}

/**
 * Intersect `lines` into the record `byFile` keeps for `file`.
 *
 * Every coverage entry for a file is another chance for a line to have run, so
 * a line stays unexecuted only while every entry agrees. A file no entry
 * mentions keeps no key at all, which is how a module nothing ever loaded stays
 * distinguishable from one that loaded and ran completely. `dumps` counts the
 * processes that loaded the file, which is how a lost child is detected.
 */
export function intersectUnexecuted(byFile, file, lines) {
    const known = byFile.get(file);
    if (!known) {
        byFile.set(file, { unexecuted: new Set(lines), dumps: 1 });
        return;
    }
    known.dumps += 1;
    for (const line of known.unexecuted)
        if (!lines.has(line)) known.unexecuted.delete(line);
}

/**
 * Read every coverage dump in `coverageDir` and reduce it per js/ file.
 *
 * `indexOf(file)` supplies the line index for a repository-relative js/ path.
 * Returns `Map<file, { unexecuted, dumps }>`.
 */
export function collectUnexecuted(coverageDir, indexOf) {
    const byFile = new Map();
    for (const entry of readdirSync(coverageDir)) {
        if (!entry.endsWith('.json')) continue;
        const dump = JSON.parse(
            readFileSync(join(coverageDir, entry), 'utf8'));
        for (const scriptCoverage of dump.result ?? []) {
            const file = jsFileForCoverageUrl(scriptCoverage.url);
            if (!file) continue;
            const index = indexOf(file);
            if (!index) continue;
            intersectUnexecuted(byFile, file,
                unexecutedLineNumbers(scriptCoverage, index));
        }
    }
    return byFile;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** Compress sorted line numbers into `12`, `20-24` pieces. */
export function compressRanges(lines) {
    const sorted = [...lines].sort((left, right) => left - right);
    const pieces = [];
    let index = 0;
    while (index < sorted.length) {
        let end = index;
        while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1)
            end += 1;
        pieces.push(index === end
            ? String(sorted[index])
            : `${sorted[index]}-${sorted[end]}`);
        index = end;
        index += 1;
    }
    return pieces;
}

/**
 * Reduce the populations to the per-file listing the report prints.
 *
 * `indexes` maps every scanned js/ file to its line index; `populations` are
 * `{ name, byFile }` records as `collectUnexecuted` returns them. A file absent
 * from a population's map was never loaded there, so all of its code lines
 * count as unexecuted.
 */
export function buildReport(indexes, populations) {
    const files = [];
    const totals = { codeLines: 0, files: 0, unexecuted: 0 };
    const perPopulation = populations.map(({ name }) => ({
        name, files: 0, executed: 0,
    }));
    let eitherFiles = 0;
    let eitherExecuted = 0;

    for (const [file, index] of [...indexes].sort()) {
        const codeLines = index.codeLines.length;
        totals.files += 1;
        totals.codeLines += codeLines;

        let unexecuted = null;
        let loadedAnywhere = false;
        populations.forEach(({ byFile }, at) => {
            const known = byFile.get(file)?.unexecuted;
            const here = known ?? new Set(index.codeLines);
            if (known) {
                loadedAnywhere = true;
                perPopulation[at].files += 1;
                perPopulation[at].executed += codeLines - known.size;
            }
            if (unexecuted === null) unexecuted = new Set(here);
            else for (const line of unexecuted)
                if (!here.has(line)) unexecuted.delete(line);
        });

        if (loadedAnywhere) {
            eitherFiles += 1;
            eitherExecuted += codeLines - unexecuted.size;
        }
        totals.unexecuted += unexecuted.size;
        if (unexecuted.size) {
            files.push({ file, codeLines, loadedAnywhere,
                lines: [...unexecuted].sort((a, b) => a - b) });
        }
    }

    files.sort((left, right) => right.lines.length - left.lines.length
        || left.file.localeCompare(right.file));
    return { files, totals, perPopulation,
        either: { files: eitherFiles, executed: eitherExecuted } };
}

function wrap(pieces, indent, width = 78) {
    const lines = [];
    let current = indent;
    for (const piece of pieces) {
        const addition = current === indent ? piece : `, ${piece}`;
        if (current.length + addition.length > width && current !== indent) {
            lines.push(current);
            current = `${indent}${piece}`;
        } else {
            current += addition;
        }
    }
    if (current !== indent) lines.push(current);
    return lines;
}

export function formatReport(report, populations) {
    const { files, totals, perPopulation, either } = report;
    const out = [
        'js/ lines that neither oracle executes',
        '======================================',
        '',
        'Not a score. There is no percentage here, no threshold, and nothing',
        'below fails a build. Coverage records that a line ran, not that',
        'anything checked what it did: scripts/bhit.test.mjs gave js/zap.js:599',
        'full line coverage while asserting the inverted form of C\'s !rn2(3),',
        'and that bug survived to a formal audit. Read this as a list of places',
        'where a new assertion has nothing to compete with, and do not track the',
        'numbers over time.',
        '',
        'Populations',
    ];
    const labelWidth = Math.max(...populations.map(({ label }) => label.length));
    perPopulation.forEach(({ name, files: loaded, executed }, at) => {
        const { label } = populations[at];
        out.push(`  ${name.padEnd(6)}${label.padEnd(labelWidth + 2)}`
            + `${loaded} js/ files loaded, ${executed} code lines executed`);
    });
    out.push(`  ${'either'.padEnd(6)}${''.padEnd(labelWidth + 2)}`
        + `${either.files} js/ files loaded, ${either.executed} code lines `
        + 'executed');
    out.push('');
    out.push(`js/ holds ${totals.files} scanned files and ${totals.codeLines} `
        + `code lines. ${totals.unexecuted} of those lines run in neither`);
    out.push('population. The three judge-supplied files are not scanned.');
    out.push('');
    out.push('Files, most unexecuted lines first');
    if (!files.length) out.push('  (none)');
    for (const { file, codeLines, lines, loadedAnywhere } of files) {
        out.push(`  ${file}: ${lines.length} unexecuted of ${codeLines} code `
            + `lines${loadedAnywhere ? '' : ' (never loaded)'}`);
        out.push(...wrap(compressRanges(lines), '    '));
    }
    return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Running the two populations
// ---------------------------------------------------------------------------

function readJsSources() {
    const indexes = new Map();
    for (const name of readdirSync(JS_DIR).sort()) {
        if (!name.endsWith('.js') || JUDGE_SUPPLIED.has(name)) continue;
        indexes.set(`js/${name}`,
            buildLineIndex(readFileSync(join(JS_DIR, name), 'utf8')));
    }
    return indexes;
}

function runPopulation(population, coverageDir, indexes) {
    const started = Date.now();
    process.stderr.write(`running ${population.name} under coverage...\n`);
    const child = spawnSync(process.execPath, population.argv, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, ...population.env,
            NODE_V8_COVERAGE: coverageDir },
    });
    if (child.error) throw child.error;
    if (child.status !== 0) {
        const tail = `${child.stdout ?? ''}${child.stderr ?? ''}`
            .trimEnd().split('\n').slice(-40).join('\n');
        process.stderr.write(`${tail}\n`);
        // Half a population makes executed lines look unexecuted, which sends
        // a reader to write tests nobody needed. Refuse to print a report
        // rather than print a quietly wrong one.
        throw new Error(`${population.name} exited ${child.status}; `
            + 'a partial population would under-report');
    }

    const byFile = collectUnexecuted(coverageDir, (file) => indexes.get(file));
    if (!byFile.size) {
        throw new Error(`${population.name} produced coverage for no js/ `
            + 'file; NODE_V8_COVERAGE did not reach the child processes');
    }
    const required = population.requiredFile
        ? byFile.get(population.requiredFile)
        : null;
    if (population.requiredFile && !required) {
        throw new Error(`${population.name} produced no coverage for `
            + `${population.requiredFile}, which only a spawned child loads; `
            + 'the child processes dropped out of the measurement');
    }
    if (population.dumpsMatchSessions) {
        // A worker the runner kills on its per-session timeout writes no dump
        // and is reported only as one more failed session, so the run still
        // exits 0 and the population quietly shrinks. Nothing else here would
        // notice, because 32 sessions load nearly the module set 33 do.
        const sessions = parseRunnerBundle(child.stdout).results.length;
        if (required.dumps !== sessions) {
            throw new Error(`${population.name} loaded `
                + `${population.requiredFile} in ${required.dumps} process(es) `
                + `for ${sessions} sessions; a worker died before it could `
                + 'write its coverage');
        }
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    process.stderr.write(`${population.name}: ${byFile.size} js/ `
        + `files loaded in ${seconds}s\n`);
    return { name: population.name, byFile };
}

function main(args) {
    if (args.length !== 0) throw new Error('arguments are not accepted');
    const indexes = readJsSources();
    const roots = POPULATIONS.map(
        () => mkdtempSync(join(tmpdir(), 'teleport-coverage-')));
    try {
        const populations = POPULATIONS.map((population, at) =>
            runPopulation(population, roots[at], indexes));
        process.stdout.write(
            formatReport(buildReport(indexes, populations), POPULATIONS));
    } finally {
        for (const root of roots) rmSync(root, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`coverage-report: ${error.message}`);
        process.exitCode = 1;
    }
}
