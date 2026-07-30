#!/usr/bin/env node

// Mutation-test js/ lines, chosen by commit range or by file.
//
// A correctness pass freezes a commit range and asks whether the tests would
// notice if the reviewed lines were wrong. This script answers that
// mechanically: it enumerates the mutable sites in the lines in scope, applies
// one substitution at a time to a copy of the module, runs the test files that
// import that module, and prints the mutants that no test killed. Each survivor
// names a line whose behavior no test pins down.
//
// The site set is deliberately narrow: relational operators, `&&`, `||`,
// boolean literals, and plus or minus one on an integer literal. Method calls
// and statement deletion are out of scope, as is every file outside the target
// set. Every substitution keeps the module parsable, so a survivor always means
// "the tests ran and passed", never "the mutant failed to load".
//
// An integer literal is a mutable bound only in some contexts. An integer in a
// subscript (`row[3]`) is an address, one beside a bitwise operator
// (`flags & 4`) or in a non-decimal radix (`0x10`) is a bit pattern, and one in
// an object-literal key position (`{ 3: x }`) is a name. Mutating any of the
// four produces noise, so the enumerator skips all four.
//
// The covering test set for a module is the test files that reach it without
// passing through another js/ module, so a test that imports the module
// through a helper under scripts/ counts. Transitive js/-to-js/ imports are
// not followed: they pull 71 to 114 of the 130 test files into every set and
// cost about as much as the full suite per mutant. A survivor may therefore
// still be killed by a test that reaches the module through another js/
// module, so every survivor is a candidate that still needs a reader.
//
// Usage:
//
//     node scripts/mutate-sites.mjs --range <base>..<head>
//     node scripts/mutate-sites.mjs --file js/regen.js [--file js/lock.js ...]
//
// `--range` mutates the lines that range changed. `--file` repeats and mutates
// every line of each file, which is the form to reach for when the question is
// whether a module's tests pin its behavior at all. The two cannot be combined.
//
// Both forms take `--enumerate-only`, which counts the sites and stops, and
// `--limit <n>`, which stops after n mutants have run. A limit truncates in
// path order, so it bounds an exploratory run rather than sampling one, and the
// report says how many of the target set's mutants went unmeasured. The command
// exits 0 whether or not mutants survived, because a survivor is a finding to
// review. A bad argument or a red baseline exits 2.
//
// A range's lines are located by `git blame` over the working tree, not by the
// diff's line numbers, so a range whose head is behind the working tree still
// reports positions the reader can open. A line that a later commit rewrote
// belongs to that commit and drops out, as does a line edited but not
// committed. When the head is the working tree, the blamed set is the diff's
// own set, which `scripts/mutate-sites.test.mjs` asserts against whichever
// commit last changed js/.
//
// Cost, measured on 29 July 2026 over `HEAD~40..HEAD` at 049ebb0, 692 lines in
// scope across 14 files:
//
// - 0.165 mutable sites per line in scope, yielding 114 sites and 165 mutants,
//   1.45 mutants per site;
// - 0.14 s per mutant against a one-file test set, 0.79 s against six files,
//   10.43 s against the 98 files that import js/const.js, and 1.38 s averaged
//   over all 165;
// - 228 s of test time for the whole range, plus 12 s for the baseline.
//
// Extrapolating the same density and average, the 1,000-line review window
// that `.agents/review.md` sets as the full-pass gate carries about 165 sites
// and 239 mutants, or roughly 5.5 minutes run serially. A range dominated by a
// widely imported module costs several times that. A whole file is denser
// because it holds no unchanged prose: js/regen.js's 119 lines carry 50 sites
// and 72 mutants, which took 17 s against its one covering test file.

import { execFileSync, spawnSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blankCommentsAndStrings } from './check-namespace-members.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Copied into the workspace because a mutation rewrites js/ and the test files
// under scripts/ have to resolve `../js/` to the workspace's own copy.
const COPIED_ENTRIES = ['js', 'scripts', 'package.json'];

// Symlinked because tests read them and no mutation touches them. `sessions/`
// is deliberately absent: no test file reads it directly, and leaving it out
// keeps the sealed holdout outside the workspace.
const LINKED_ENTRIES = ['frozen', 'nethack-c'];

// ---------------------------------------------------------------------------
// The changed lines
// ---------------------------------------------------------------------------

/** Split `<base>..<head>`, rejecting any other shape. */
export function parseRange(range) {
    const parts = String(range ?? '').split('..');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(
            `range must be spelled <base>..<head>, not '${range}'`);
    }
    return { base: parts[0], head: parts[1] };
}

/**
 * Read the new-file line numbers that a unified diff adds, keyed by path.
 *
 * `--unified=0` reduces every hunk to the added lines alone, so the hunk
 * header carries the whole answer and the body is not parsed. A hunk with a
 * `+0` count deletes lines and adds none.
 */
export function parseAddedLines(diff) {
    const added = new Map();
    let path = null;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++ ')) {
            const target = line.slice(4).trim();
            path = target === '/dev/null'
                ? null
                : target.replace(/^b\//u, '');
            continue;
        }
        if (path === null || !line.startsWith('@@')) continue;
        const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
        if (!header) continue;
        const start = Number(header[1]);
        const count = header[2] === undefined ? 1 : Number(header[2]);
        if (count === 0) continue;
        if (!added.has(path)) added.set(path, new Set());
        const lines = added.get(path);
        for (let n = start; n < start + count; ++n) lines.add(n);
    }
    return added;
}

function git(args, cwd = REPO_ROOT) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
}

/** The js/ lines that `<base>..<head>` added or changed, keyed by path. */
export function changedJsLines(range, cwd = REPO_ROOT) {
    const { base, head } = parseRange(range);
    return parseAddedLines(git(
        ['diff', '--unified=0', '--no-color', '--no-ext-diff',
            `${base}..${head}`, '--', 'js/'],
        cwd));
}

/**
 * Read the working-tree lines of `file` that one of `commits` last wrote.
 *
 * Blaming the working tree numbers every line by the file the mutator will
 * read. A commit would number them by its own revision. An uncommitted line
 * blames to the all-zero commit, so a line edited since the range belongs to no
 * range and drops out on its own.
 *
 * `--incremental` prints one `<commit> <origline> <finalline> <count>` header
 * per contiguous group of lines, then that commit's metadata. Only the headers
 * are read.
 */
function blamedLines(file, commits, cwd) {
    const blame = git(['blame', '--incremental', '--', file], cwd);
    const lines = new Set();
    for (const row of blame.split('\n')) {
        const header = /^([0-9a-f]{40}) \d+ (\d+) (\d+)$/u.exec(row);
        if (!header || !commits.has(header[1])) continue;
        const start = Number(header[2]);
        for (let n = start; n < start + Number(header[3]); ++n) lines.add(n);
    }
    return lines;
}

/**
 * The lines a range changed, located in the working tree, keyed by path.
 *
 * The diff of `<base>..<head>` names the files and `git blame` locates their
 * lines, so a range whose head is behind the working tree still reports
 * positions the reader can open. A line that a later commit rewrote belongs to
 * that commit and is left out. When the head is the working tree, this returns
 * the diff's own line set.
 */
export function survivingRangeLines(range, cwd = REPO_ROOT) {
    const { base, head } = parseRange(range);
    const commits = new Set(git(['rev-list', `${base}..${head}`], cwd)
        .split('\n').filter(Boolean));
    const surviving = new Map();
    for (const path of changedJsLines(range, cwd).keys()) {
        // A file the range changed and a later commit deleted has no line in
        // the working tree to mutate.
        if (!existsSync(join(cwd, path))) continue;
        const lines = blamedLines(path, commits, cwd);
        if (lines.size) surviving.set(path, lines);
    }
    return surviving;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

// Longest first, so a greedy scan reads `>>>=` before `>>>` and `>=` before
// `>`. Only the operators this file classifies need to be listed exactly; the
// rest fall through to the single-character entries.
const PUNCTUATORS = [
    '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=',
    '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--',
    '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
    '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%',
    '&', '|', '^', '!', '~', '?', ':', '=', '.', '`', '#', '@', '$',
];

// Every numeric spelling, not only the mutable one: a hex literal or a decimal
// fraction has to be read as one token so the scan passes over it whole rather
// than treating its digits as separate integers. isPlainInteger() then decides
// which of these is a bound.
const NUMBER = new RegExp([
    '0[xXoObB][0-9a-fA-F_]+n?',                          // other radixes
    '\\d[\\d_]*(?:\\.[\\d_]*)?(?:[eE][+-]?\\d[\\d_]*)?n?', // digits first
    '\\.\\d[\\d_]*(?:[eE][+-]?\\d[\\d_]*)?',               // `.5`
].join('|'), 'uy');

const IDENTIFIER = /[A-Za-z_$][\w$]*/uy;

/**
 * Split blanked source into tokens, keeping each token's offsets.
 *
 * The input must already have run through `blankCommentsAndStrings`, so a
 * string body is spaces and its quotes survive as delimiters. A quote
 * therefore becomes one `string` token spanning to the next quote, and a
 * template literal becomes a backtick token plus whatever code its `${...}`
 * substitutions left visible.
 */
export function tokenize(code) {
    const tokens = [];
    let index = 0;
    while (index < code.length) {
        const ch = code[index];
        if (/\s/u.test(ch)) {
            index += 1;
            continue;
        }
        if (ch === '\'' || ch === '"') {
            const close = code.indexOf(ch, index + 1);
            const end = close < 0 ? code.length : close + 1;
            tokens.push({ kind: 'string', text: ch, start: index, end });
            index = end;
            continue;
        }
        NUMBER.lastIndex = index;
        const number = /[\d.]/u.test(ch) ? NUMBER.exec(code) : null;
        if (number) {
            tokens.push({
                kind: 'number',
                text: number[0],
                start: index,
                end: index + number[0].length,
            });
            index += number[0].length;
            continue;
        }
        IDENTIFIER.lastIndex = index;
        const identifier = IDENTIFIER.exec(code);
        if (identifier) {
            tokens.push({
                kind: 'identifier',
                text: identifier[0],
                start: index,
                end: index + identifier[0].length,
            });
            index += identifier[0].length;
            continue;
        }
        const punctuator = PUNCTUATORS
            .find((text) => code.startsWith(text, index));
        if (punctuator) {
            tokens.push({
                kind: 'punctuator',
                text: punctuator,
                start: index,
                end: index + punctuator.length,
            });
            index += punctuator.length;
            continue;
        }
        index += 1;
    }
    return tokens;
}

// ---------------------------------------------------------------------------
// Mutable sites
// ---------------------------------------------------------------------------

// A relational operator moves its boundary by one position, the mutation the
// audited defects took: weakening `msize <= MZ_SMALL` to `<` left all 64 tests
// in the monsters area passing. Reversing the comparison instead (`<` to `>`)
// changes the branch wholesale and almost any test kills it.
const RELATIONAL = new Map([
    ['<', '<='],
    ['<=', '<'],
    ['>', '>='],
    ['>=', '>'],
]);

const LOGICAL = new Map([['&&', '||'], ['||', '&&']]);

const BOOLEAN = new Map([['true', 'false'], ['false', 'true']]);

// An integer next to one of these is a bit pattern, not a bound.
const BITWISE = new Set([
    '&', '|', '^', '<<', '>>', '>>>', '~',
    '&=', '|=', '^=', '<<=', '>>=', '>>>=',
]);

// Keywords that stand where a value would, so a following `[` opens an array
// literal. Any other identifier ends a value, which makes `mons[3]` a subscript
// and `return [3]` an array literal.
const VALUELESS_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'throw', 'case', 'do', 'else', 'yield', 'await',
]);

// Tokens after which `{` opens an object literal. A `{` anywhere else opens a
// block, including after `=>`, where a concise object body needs parentheses
// (`=> ({ ... })`) and so shows a `(` here instead.
const OBJECT_LITERAL_PRECURSORS = new Set([
    '=', '(', ',', ':', '[', '?', '&&', '||', '??', '!', '...',
    'return', 'typeof', 'case', 'in', 'of', 'void', 'delete', 'await', 'yield',
]);

function lineStarts(source) {
    const starts = [0];
    for (let i = 0; i < source.length; ++i)
        if (source[i] === '\n') starts.push(i + 1);
    return starts;
}

function positionOf(starts, offset) {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (starts[mid] <= offset) low = mid;
        else high = mid - 1;
    }
    return { line: low + 1, column: offset - starts[low] + 1 };
}

/** True when `token` closes a value, so a following `[` is a subscript. */
function endsValue(token) {
    if (!token) return false;
    if (token.kind === 'number' || token.kind === 'string') return true;
    if (token.kind === 'identifier') return !VALUELESS_KEYWORDS.has(token.text);
    return [')', ']', '`'].includes(token.text);
}

/** True when `text` is a decimal integer this script can shift by one. */
function isPlainInteger(text) {
    if (!/^\d[\d_]*$/u.test(text)) return false;
    const value = Number(text.replace(/_/gu, ''));
    return Number.isSafeInteger(value);
}

/**
 * Enumerate the mutable sites in `source`, optionally restricted to `lines`.
 *
 * Sites are found in the blanked copy of the source, so a `<=` inside a
 * comment or a string is invisible, and each site's offsets still address the
 * raw source. Pass `lines` as a Set of 1-based line numbers, or null for the
 * whole file.
 */
export function enumerateSites(source, lines = null) {
    const code = blankCommentsAndStrings(source);
    const tokens = tokenize(code);
    const starts = lineStarts(source);
    const sites = [];
    // One frame per open bracket. `object` marks a `{` that opens an object
    // literal and a `[` that opens a subscript; `ternary` counts the `?`
    // tokens still waiting for their `:` at this level, which is what tells an
    // object-literal key colon apart from a ternary colon.
    const frames = [{ text: '', object: false, subscript: false, ternary: 0 }];

    const accept = (token, kind, original, replacement) => {
        const { line, column } = positionOf(starts, token.start);
        if (lines && !lines.has(line)) return;
        sites.push({
            line,
            column,
            offset: token.start,
            length: token.end - token.start,
            kind,
            original,
            replacement,
        });
    };

    for (let i = 0; i < tokens.length; ++i) {
        const token = tokens[i];
        const previous = tokens[i - 1] ?? null;
        const next = tokens[i + 1] ?? null;
        const frame = frames.at(-1);

        if (token.kind === 'punctuator') {
            if (token.text === '{' || token.text === '[' || token.text === '(') {
                frames.push({
                    text: token.text,
                    object: token.text === '{' && previous !== null
                        && OBJECT_LITERAL_PRECURSORS.has(previous.text),
                    subscript: token.text === '[' && endsValue(previous),
                    ternary: 0,
                });
                continue;
            }
            if (['}', ']', ')'].includes(token.text)) {
                if (frames.length > 1) frames.pop();
                continue;
            }
            if (token.text === '?') {
                frame.ternary += 1;
                continue;
            }
            if (token.text === ':') {
                if (frame.ternary > 0) frame.ternary -= 1;
                continue;
            }
            if (RELATIONAL.has(token.text)) {
                accept(token, 'relational', token.text,
                    RELATIONAL.get(token.text));
                continue;
            }
            if (LOGICAL.has(token.text)) {
                accept(token, 'logical', token.text, LOGICAL.get(token.text));
                continue;
            }
            continue;
        }

        // A key colon at this level ends the pending-`?` count at zero, so an
        // `{ n: ... }` key and an `x ? n : y` consequent are distinguishable.
        const isObjectKey = frame.object
            && frame.ternary === 0
            && next?.text === ':';
        const isProperty = previous?.text === '.' || previous?.text === '?.';

        if (token.kind === 'identifier' && BOOLEAN.has(token.text)) {
            if (isProperty || isObjectKey) continue;
            accept(token, 'boolean', token.text, BOOLEAN.get(token.text));
            continue;
        }
        if (token.kind === 'number' && isPlainInteger(token.text)) {
            if (isProperty || isObjectKey) continue;
            // Only the innermost bracket decides: `row[n + 1]` indexes, while
            // the `3` in `row[clamp(3, n)]` is an ordinary argument.
            if (frame.subscript) continue;
            if (BITWISE.has(previous?.text) || BITWISE.has(next?.text)) continue;
            const value = Number(token.text.replace(/_/gu, ''));
            accept(token, 'integer', token.text, String(value + 1));
            accept(token, 'integer', token.text, String(value - 1));
        }
    }
    return sites;
}

/** Splice one substitution into the raw source. */
export function applyMutation(source, site) {
    return source.slice(0, site.offset)
        + site.replacement
        + source.slice(site.offset + site.length);
}

// ---------------------------------------------------------------------------
// Which tests cover a module
// ---------------------------------------------------------------------------

// Matched against blanked source, so a specifier written inside a string or a
// comment cannot register. The specifier itself is blank there and is read
// back out of the raw source through the match indices, the same way
// scripts/check-namespace-members.mjs reads import specifiers.
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]*)\1/dgu;

/** The relative specifiers `file` imports, resolved to absolute paths. */
export function relativeImportsOf(file) {
    const raw = readFileSync(file, 'utf8');
    const code = blankCommentsAndStrings(raw);
    const targets = [];
    IMPORT_SPECIFIER.lastIndex = 0;
    let match;
    while ((match = IMPORT_SPECIFIER.exec(code)) !== null) {
        const [start, end] = match.indices[2];
        const specifier = raw.slice(start, end);
        if (specifier.startsWith('.'))
            targets.push(resolve(dirname(file), specifier));
    }
    return targets;
}

/**
 * Map each js/ module to the test files that reach it.
 *
 * The walk starts at every `scripts/*.test.mjs`, follows imports through other
 * files under scripts/, and records but does not enter js/ modules. See the
 * module comment on why js/-to-js/ edges are left out.
 */
export function coveringTests(rootPath = REPO_ROOT) {
    // Import specifiers resolve to absolute paths, so the root has to be
    // absolute for the js/ prefix test below to match.
    const root = resolve(rootPath);
    const scripts = join(root, 'scripts');
    const jsPrefix = join(root, 'js') + '/';
    const covering = new Map();
    const testFiles = readdirSync(scripts)
        .filter((name) => name.endsWith('.test.mjs'))
        .sort();

    for (const name of testFiles) {
        const entry = join(scripts, name);
        const visited = new Set([entry]);
        const pending = [entry];
        while (pending.length) {
            let imports;
            try {
                imports = relativeImportsOf(pending.pop());
            } catch {
                continue; // A specifier that resolves to no file on disk.
            }
            for (const target of imports) {
                if (target.startsWith(jsPrefix)) {
                    const key = relative(root, target);
                    if (!covering.has(key)) covering.set(key, []);
                    if (!covering.get(key).includes(name))
                        covering.get(key).push(name);
                    continue;
                }
                if (!visited.has(target)) {
                    visited.add(target);
                    pending.push(target);
                }
            }
        }
    }
    return covering;
}

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

const WORKSPACE_PREFIX = join(tmpdir(), 'teleport-mutate-');

export function createWorkspace(root = REPO_ROOT) {
    const workspace = mkdtempSync(WORKSPACE_PREFIX);
    try {
        for (const entry of COPIED_ENTRIES)
            cpSync(join(root, entry), join(workspace, entry),
                { recursive: true });
        for (const entry of LINKED_ENTRIES)
            symlinkSync(join(root, entry), join(workspace, entry));
        return workspace;
    } catch (error) {
        removeWorkspace(workspace);
        throw error;
    }
}

export function removeWorkspace(workspace) {
    if (!resolve(workspace).startsWith(WORKSPACE_PREFIX))
        throw new Error('refusing to remove an unexpected workspace path');
    rmSync(workspace, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Running the tests
// ---------------------------------------------------------------------------

// `node --test` sets this for the processes it spawns, and an inner `--test`
// run that inherits it skips every file it was given and exits 0. That would
// report every mutant as a survivor, so the variable is dropped from the
// child's environment.
function childEnvironment() {
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    return environment;
}

/** Count the tests a run reported, over both the TAP and the spec reporter. */
export function reportedTestCount(output) {
    const match = /^[#ℹ]\s*tests\s+(\d+)$/mu.exec(output);
    return match ? Number(match[1]) : 0;
}

function runTests(workspace, testFiles, timeoutMs) {
    const args = ['--test', ...testFiles.map((name) => join('scripts', name))];
    const started = process.hrtime.bigint();
    const result = spawnSync(process.execPath, args, {
        cwd: workspace,
        encoding: 'utf8',
        env: childEnvironment(),
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
    });
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const timedOut = result.error?.code === 'ETIMEDOUT'
        || (result.status === null && result.signal !== null);
    return { passed: !timedOut && result.status === 0, timedOut, seconds,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/**
 * Apply each site's substitutions one at a time and report the survivors.
 *
 * `targets` holds one entry per file: `{ path, source, sites, tests }`, where
 * `path` is relative to the workspace and `tests` names test files under
 * `scripts/`. The unmutated tests run first, and a failure there aborts the
 * run: a red baseline marks every mutant killed, so the result would say
 * nothing about the tests.
 */
export function runMutants({ workspace, targets, limit = Infinity,
    log = () => {} }) {
    const covered = targets.filter((target) => target.tests.length);
    const uncovered = targets
        .filter((target) => !target.tests.length && target.sites.length);
    const baselineFiles = [...new Set(covered.flatMap((t) => t.tests))].sort();

    let baselineSeconds = 0;
    let baselineTests = 0;
    if (baselineFiles.length) {
        log(`baseline: ${baselineFiles.length} test file(s)`);
        const baseline = runTests(workspace, baselineFiles, 15 * 60 * 1000);
        baselineSeconds = baseline.seconds;
        baselineTests = reportedTestCount(baseline.output);
        if (!baseline.passed) {
            throw new Error('the unmutated tests do not pass, so no mutant '
                + 'result would be meaningful; fix them first. '
                + `node --test ${baselineFiles.join(' ')} reported:\n`
                + failureLines(baseline.output));
        }
        // A run that executes nothing also exits 0, and every mutant would then
        // look like a survivor.
        if (baselineTests === 0) {
            throw new Error(`the baseline run of ${baselineFiles.length} test `
                + 'file(s) reported no tests, so no mutant result would be '
                + 'meaningful');
        }
        log(`baseline passed ${baselineTests} test(s) in `
            + `${baselineSeconds.toFixed(1)} s`);
    }

    // A mutant can turn a bounded loop into an unbounded one. The whole
    // unmutated set is the ceiling for one file's subset, so a run past that
    // ceiling is a hang, and a hung mutant counts as killed.
    const timeoutMs = Math.max(60_000, Math.ceil(baselineSeconds * 3) * 1000);
    const survivors = [];
    const perFile = [];
    const scheduled = covered.reduce((n, t) => n + t.sites.length, 0);
    let killed = 0;
    let timeouts = 0;
    let ranSeconds = 0;
    let ran = 0;

    for (const target of covered) {
        const absolute = join(workspace, target.path);
        const tally = { path: target.path, tests: target.tests.length,
            mutants: 0, seconds: 0 };
        try {
            for (const site of target.sites) {
                if (ran >= limit) break;
                writeFileSync(absolute, applyMutation(target.source, site));
                const run = runTests(workspace, target.tests, timeoutMs);
                ran += 1;
                ranSeconds += run.seconds;
                tally.mutants += 1;
                tally.seconds += run.seconds;
                if (run.timedOut) timeouts += 1;
                if (run.passed) survivors.push({ ...site, path: target.path,
                    tests: target.tests });
                else killed += 1;
            }
        } finally {
            writeFileSync(absolute, target.source);
        }
        if (tally.mutants) perFile.push(tally);
        if (ran >= limit) break;
    }

    return { survivors, killed, timeouts, uncovered, ran, ranSeconds, perFile,
        scheduled, baselineSeconds, baselineFiles, baselineTests };
}

function failureLines(output) {
    const lines = output.split('\n')
        .filter((line) => /^\s*(not ok|✖|# fail)/u.test(line));
    return lines.slice(0, 20).join('\n') || output.slice(-2000);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function describeSite(site) {
    return `${site.path}:${site.line}:${site.column}: `
        + `${site.kind} \`${site.original}\` -> \`${site.replacement}\``;
}

export function formatReport(result) {
    const lines = [];
    for (const site of result.survivors) {
        lines.push(`survived ${describeSite(site)} `
            + `(${site.tests.length} test file(s): ${site.tests.join(', ')})`);
    }
    for (const target of result.uncovered) {
        lines.push(`unmeasured ${target.path}: ${target.sites.length} site(s), `
            + 'no test file imports this module');
    }
    // Per-file cost, which follows from how many test files import the module.
    // Read this figure when deciding whether a range is affordable.
    for (const tally of result.perFile) {
        lines.push(`cost ${tally.path}: ${tally.mutants} mutant(s) against `
            + `${tally.tests} test file(s), `
            + `${(tally.seconds / tally.mutants).toFixed(2)} s per mutant`);
    }
    if (result.ran < result.scheduled) {
        // Say what the limit dropped. A truncated run that reported only its
        // own totals would read as a complete measurement of the target set.
        lines.push(`limited to ${result.ran} of ${result.scheduled} mutant(s) `
            + 'in path order; the rest were not measured');
    }
    const perMutant = result.ran
        ? (result.ranSeconds / result.ran).toFixed(2)
        : '0.00';
    lines.push(`${result.ran} mutant(s): ${result.killed} killed, `
        + `${result.survivors.length} survived, ${result.timeouts} timed out; `
        + `${result.ranSeconds.toFixed(1)} s of test time, `
        + `${perMutant} s per mutant; baseline `
        + `${result.baselineTests} test(s) in `
        + `${result.baselineFiles.length} file(s) in `
        + `${result.baselineSeconds.toFixed(1)} s`);
    return lines;
}

/** Count the distinct tokens behind a mutant list. */
export function countSites(sites) {
    return new Set(sites.map((site) => site.offset)).size;
}

export function formatSiteCensus(targets, scopedLines) {
    const lines = [];
    const kinds = new Map();
    let sites = 0;
    let mutants = 0;
    for (const target of targets) {
        const perKind = new Map();
        for (const site of target.sites) {
            perKind.set(site.kind, (perKind.get(site.kind) ?? 0) + 1);
            kinds.set(site.kind, (kinds.get(site.kind) ?? 0) + 1);
        }
        sites += countSites(target.sites);
        mutants += target.sites.length;
        lines.push(`${target.path}: ${target.lineCount} line(s) in scope, `
            + `${countSites(target.sites)} site(s), `
            + `${target.sites.length} mutant(s) [`
            + [...perKind].map(([kind, n]) => `${kind} ${n}`).join(', ')
            + `], ${target.tests.length} covering test file(s)`);
    }
    const density = scopedLines ? (sites / scopedLines).toFixed(3) : '0.000';
    lines.push(`${targets.length} file(s), ${scopedLines} line(s) in scope, `
        + `${sites} site(s), ${mutants} mutant(s); `
        + `${density} sites per line in scope`);
    lines.push('mutants by kind: '
        + [...kinds].sort().map(([kind, n]) => `${kind} ${n}`).join(', ')
        + '; an integer site yields one mutant each way');
    return lines;
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

/**
 * Read the target set and the options from the command line.
 *
 * Every argument is a named option. `--range` and `--file` say which kind of
 * target follows, so no argument is classified by its shape, and a mistyped
 * range or path is reported as itself. `--file` repeats; `--range` does not,
 * and the two cannot be combined, because a range already decides which lines
 * of which files are in scope.
 *
 * Each option accepts `--name value` and `--name=value`.
 */
export function parseArgs(argv) {
    const options = { range: null, paths: [], enumerateOnly: false,
        limit: Infinity };
    for (let i = 0; i < argv.length; ++i) {
        const separator = argv[i].indexOf('=');
        const name = separator < 0 ? argv[i] : argv[i].slice(0, separator);
        const inlineValue = separator < 0 ? null : argv[i].slice(separator + 1);
        // The value of an option written `--name value`. Reading it here rather
        // than per option keeps the "missing value" message in one place.
        const valueOf = () => {
            const value = inlineValue ?? argv[++i];
            if (value === undefined || value === '')
                throw new Error(`${name} takes a value`);
            return value;
        };

        if (name === '--enumerate-only') {
            if (inlineValue !== null)
                throw new Error('--enumerate-only takes no value');
            options.enumerateOnly = true;
        } else if (name === '--range') {
            if (options.range) throw new Error('pass one --range');
            const range = valueOf();
            parseRange(range);
            options.range = range;
        } else if (name === '--file') {
            options.paths.push(valueOf());
        } else if (name === '--limit') {
            const value = Number(valueOf());
            if (!Number.isInteger(value) || value < 1)
                throw new Error('--limit takes a positive integer');
            options.limit = value;
        } else if (name.startsWith('-')) {
            throw new Error(`unknown option '${name}'`);
        } else {
            throw new Error(`unexpected argument '${argv[i]}': name every `
                + 'target with --range or --file');
        }
    }
    if (options.range && options.paths.length)
        throw new Error('pass --range or --file, not both');
    if (!options.range && !options.paths.length) {
        throw new Error('pass --range <base>..<head> to mutate the lines a '
            + 'range changed, or --file <path> to mutate a whole file');
    }
    return options;
}

/**
 * Build one `runMutants` target per file, in path order.
 *
 * Pass `range` to take the lines that range changed, or `paths` to take every
 * line of each file. Every target reports the working tree's bytes, so a
 * reported line number always addresses the file on disk.
 */
export function collectTargets({ range = null, paths = [] },
    root = REPO_ROOT) {
    const scope = range
        ? survivingRangeLines(range, root)
        : new Map(paths.map((path) => [assertJsPath(path, root), null]));
    const covering = coveringTests(root);
    const targets = [];
    for (const path of [...scope.keys()].sort()) {
        const lines = scope.get(path);
        const source = readFileSync(join(root, path), 'utf8');
        targets.push({
            path,
            source,
            lineCount: lines ? lines.size : source.split('\n').length,
            sites: enumerateSites(source, lines),
            tests: covering.get(path) ?? [],
        });
    }
    return targets;
}

/** Normalize a path argument, rejecting anything outside js/. */
function assertJsPath(path, root) {
    const normalized = relative(root, resolve(root, path));
    if (!normalized.startsWith('js/') || !existsSync(join(root, normalized)))
        throw new Error(`'${path}' is not a file under js/`);
    return normalized;
}

async function main(argv) {
    const options = parseArgs(argv);
    const targets = collectTargets(options);
    const scopedLines = targets.reduce((sum, t) => sum + t.lineCount, 0);
    for (const line of formatSiteCensus(targets, scopedLines))
        console.log(line);
    if (options.enumerateOnly) return;

    const workspace = createWorkspace();
    try {
        const result = runMutants({
            workspace,
            targets: targets.filter((target) => target.sites.length),
            limit: options.limit,
            log: (message) => console.log(message),
        });
        for (const line of formatReport(result)) console.log(line);
    } finally {
        removeWorkspace(workspace);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        await main(process.argv.slice(2));
    } catch (error) {
        console.error(`mutate-sites: ${error.message}`);
        process.exitCode = 2;
    }
}
