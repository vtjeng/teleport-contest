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
// Every mutant runs a first wave: the test files that reach the module without
// passing through another js/ module, so a test that imports the module through
// a helper under scripts/ counts. A failure there kills the mutant.
//
// What happens next depends on `--whole-suite`. Without it the first wave is
// the verdict, which is fast and reports false survivors. With it, a mutant
// that passed its first wave runs every remaining test file, and only a mutant
// the whole suite passed is reported as a survivor. On `ce9c59f~1..ce9c59f` the
// first wave alone reported five survivors and the rest of the suite killed
// four of them, among them a mutant of js/hack.js that
// `scripts/closed-door-autoopen.test.mjs` fails on while all seven files
// importing js/hack.js directly pass. The report states which verdict it
// applied.
//
// Judging by a transitive import set would cost nearly what the whole suite
// costs, so it buys nothing over `--whole-suite`. Following js/-to-js/ imports
// puts 72 of the 132 test files behind js/hack.js and 102 behind js/mondata.js,
// and the slowest files sit in those sets, so `node --test`'s concurrency
// leaves the subset almost as slow as the whole run.
//
// Usage:
//
//     node scripts/mutate-sites.mjs --range <base>..<head>
//     node scripts/mutate-sites.mjs --file js/regen.js [--file js/lock.js ...]
//     node scripts/mutate-sites.mjs --worktree
//
// `--range` mutates the lines that range changed. `--file` repeats and mutates
// every line of each file, which is the form to reach for when the question is
// whether a module's tests pin its behavior at all. `--worktree` mutates the
// uncommitted js/ diff, which is the form for work that is not committed yet;
// on a clean tree it reports no mutant and exits 0. The three cannot be
// combined.
// `--whole-suite` judges every mutant that survives its first wave by the whole
// suite, at the cost the figures below give. A correctness pass wants it; a
// quick local check does not.
// `--report <path>` writes the run's survivors as a versioned JSON report, and
// `--from-report <path>` re-runs exactly those survivors, which is the
// escalation path: write the report on the first wave, then judge the
// survivors alone with `--from-report <path> --whole-suite` in place of
// re-running every mutant's first wave to rediscover them.
//
// `--sample <n>` draws n mutants uniformly at random from the whole target set
// and runs only those, which is how to estimate a kill rate over a population
// too large to run: the 126 files under js/ hold 94,899 mutants. `--seed <k>`
// sets the draw, and the report names the seed it used, so a sample can be
// repeated exactly. The report gives the kill rate with a 95% Wilson interval
// for the population the sample was drawn from.
//
// Both forms take `--enumerate-only`, which prints the site and mutant counts
// per file and stops before running any test. To bound a run rather than count
// it, use `--sample <n>` with `--seed <k>`. The command exits 0 whether or not
// mutants survived, because a survivor is a finding to review. A bad argument
// or a red baseline exits 2.
//
// `--worktree` takes its line numbers from `git diff HEAD`, which already
// numbers them in the working tree. `--range` cannot cover that work at all: an
// uncommitted line blames to the all-zero commit and belongs to no range.
//
// A range's lines are located by `git blame` over the working tree, not by the
// diff's line numbers, so a range whose head is behind the working tree still
// reports positions the reader can open. A line that a later commit rewrote
// belongs to that commit and drops out, as does a line edited but not
// committed. When the head is the working tree, the blamed set is the diff's
// own set, which `scripts/mutate-sites.test.mjs` asserts against whichever
// commit last changed js/.
//
// Every CLI form re-executes itself in `teleport-mutate.scope`. The scope caps
// the complete process tree at 2 GiB of memory, disables swap for that tree,
// and permits at most 64 tasks. A fixed unit name also refuses a second local
// mutation run while the first remains active. The Node test runner admits at
// most four test files at once inside that scope.
//
// A first wave costs what its own files cost, from 0.14 s per mutant for a
// one-file wave to 2.20 s for js/hack.js's seven. Under `--whole-suite`, every
// mutant that passes its first wave costs about 13 s more, the time the
// 122-file verdict suite takes, so the total depends on how many the first
// wave kills. A module whose own tests are weak pays the suite for nearly every
// mutant.
//
// Measured on 30 July 2026, wall clock for the whole command:
//
// - `ce9c59f~1..ce9c59f`, 8 mutants over js/hack.js and js/lock.js: 12.7 s
//   without `--whole-suite` and 84.0 s with it. The first wave killed 3 at
//   1.36 s each; the 5 that reached the suite cost 12.7 s each, and it
//   killed 4 of them;
// - `c67aa92~1..c67aa92`, 17 mutants over js/regen.js alone: 3.0 s and 224.2 s.
//   The first wave killed 1 at 0.14 s; the 16 that reached the suite cost
//   13.0 s each and it killed none, so `--whole-suite` cost 75 times as much
//   for the same answer.
//
// Site density measured 0.165 per line in scope over the 692 lines
// `HEAD~40..HEAD` changed at 049ebb0 on 29 July 2026, at 1.45 mutants per site.
// Extrapolating that density, the 1,000-line review window that
// `.agents/review.md` sets as the full-pass gate holds about 239 mutants. Under
// `--whole-suite` that runs in roughly 26 minutes if the first wave kills half
// of them and 52 minutes if it kills none. Both figures extrapolate from the
// two ranges above and assume the same density and the same 13 s suite.

// This file belongs to no `QUALITY.json` area, which is deliberate. Areas
// partition `js/`, the ported game code, and own 135 paths, none outside it;
// `unassignedJsFiles()` in scripts/quality-status.mjs enforces that coverage
// over `js/` alone. Owning a tool here would put code that changes no scored
// behavior into a gate that measures ported-behavior debt, and would aim a
// correctness pass's source-versus-port finders at a file with no C source
// behind it. Every other tool under `scripts/` sits outside the areas by the
// same rule, including scripts/quality-status.mjs, which `.agents/review.md`
// depends on just as heavily.
//
// What covers this file instead: its own tests, which pin each reported line
// and each refusal, and the breakage record in the commit that added each one.
// The residual risk is real and worth stating: no independent reader reviews
// this tool, while `.agents/review.md` requires its output. A wrong answer here
// is visible in opposite directions, which is the reason to accept that risk.
// A false survivor costs the test-quality finder one trace, and a false kill
// hides a gap silently, so a change to the verdict path needs a test that
// distinguishes the two.

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
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { blankCommentsAndStrings } from './check-namespace-members.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATION_CGROUP_MARKER = 'TELEPORT_MUTATION_CGROUP';

/** Build the systemd scope that contains the mutator and every test child. */
export function mutationCgroupArgs(nodePath, scriptPath, argv) {
    return [
        '--user',
        '--scope',
        '--collect',
        '--unit=teleport-mutate',
        '--property=MemoryAccounting=yes',
        '--property=MemoryMax=2G',
        '--property=MemorySwapMax=0',
        '--property=TasksMax=64',
        nodePath,
        scriptPath,
        ...argv,
    ];
}

function runInMutationCgroup(scriptPath, argv) {
    const result = spawnSync('systemd-run',
        mutationCgroupArgs(process.execPath, scriptPath, argv), {
            stdio: 'inherit',
            env: { ...process.env, [MUTATION_CGROUP_MARKER]: '1' },
        });
    if (result.error) throw result.error;
    if (result.status === null) {
        throw new Error(`bounded mutation scope ended with signal ${
            result.signal ?? 'unknown'}`);
    }
    return result.status;
}

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
 * The uncommitted js/ lines, keyed by path.
 *
 * `git diff HEAD` numbers its added lines in the working tree, which is what the
 * mutator reads, so no blame step is needed. survivingRangeLines() cannot cover
 * this: an uncommitted line blames to the all-zero commit and belongs to no
 * range. A clean tree yields no path and no mutant.
 */
export function uncommittedJsLines(cwd = REPO_ROOT) {
    return parseAddedLines(git(
        ['diff', '--unified=0', '--no-color', '--no-ext-diff', 'HEAD', '--',
            'js/'],
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

// Every kind `enumerateSites()` tags a site with, which is what `--kind`
// selects from.
export const SITE_KINDS = ['boolean', 'integer', 'logical', 'relational'];

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

// Workspaces that exist right now. A `finally` arm removes each one on the
// ordinary path, and a terminating signal skips every `finally`, so a run
// stopped with Ctrl-C or `kill` used to leave its copy of js/ and scripts/
// behind: 6.7 MB each.
const liveWorkspaces = new Set();
const INTERRUPTS = ['SIGINT', 'SIGTERM'];

function onInterrupt(signal) {
    for (const workspace of [...liveWorkspaces]) removeWorkspace(workspace);
    // Re-raise so the caller sees the signal it sent, rather than an exit code
    // this handler invented. Removing the listener first stops the recursion.
    process.removeListener(signal, onInterrupt);
    process.kill(process.pid, signal);
}

export function createWorkspace(root = REPO_ROOT) {
    const workspace = mkdtempSync(WORKSPACE_PREFIX);
    if (liveWorkspaces.size === 0)
        for (const signal of INTERRUPTS) process.on(signal, onInterrupt);
    liveWorkspaces.add(workspace);
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
    liveWorkspaces.delete(workspace);
    if (liveWorkspaces.size === 0)
        for (const signal of INTERRUPTS)
            process.removeListener(signal, onInterrupt);
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

/** Build one bounded Node test wave from names relative to scripts/. */
export function testCommandArgs(testFiles) {
    return [
        '--test',
        '--test-concurrency=4',
        ...testFiles.map((name) => join('scripts', name)),
    ];
}

function runTests(workspace, testFiles, timeoutMs) {
    // `node --test` with no file argument discovers and runs everything it can
    // find, so an empty list would quietly run the whole workspace, including
    // fixtures meant to fail. Every caller has to decide what an empty set
    // means.
    if (!testFiles.length)
        throw new Error('runTests needs at least one test file');
    const args = testCommandArgs(testFiles);
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
 * Split the test files into the ones a js/ mutation can affect and the rest.
 *
 * `suite` holds every test file that imports at least one js/ module, directly
 * or through a helper under `scripts/`; the verdict comes from those. A test
 * file that imports no js/ module cannot fail because a js/ line changed, so
 * running it would only cost time. One of them would make the verdict wrong
 * and not merely slow. `scripts/mutate-sites.test.mjs` reads js/ files as text
 * and compares them with git, so every mutation fails it for a reason that
 * has nothing to do with game behavior. Those files also need repository state
 * the workspace does not hold, such as `QUALITY.json` and a `.git` directory.
  */
export function partitionTestFiles(rootPath = REPO_ROOT) {
    const root = resolve(rootPath);
    const jsPrefix = join(root, 'js') + '/';
    const suite = [];
    const unaffected = [];
    for (const name of readdirSync(join(root, 'scripts'))
        .filter((entry) => entry.endsWith('.test.mjs')).sort()) {
        const visited = new Set();
        const pending = [join(root, 'scripts', name)];
        let reachesJs = false;
        while (pending.length && !reachesJs) {
            const file = pending.pop();
            if (visited.has(file)) continue;
            visited.add(file);
            let imports;
            try {
                imports = relativeImportsOf(file);
            } catch {
                continue;
            }
            for (const target of imports) {
                if (target.startsWith(jsPrefix)) reachesJs = true;
                else pending.push(target);
            }
        }
        (reachesJs ? suite : unaffected).push(name);
    }
    return { suite, unaffected };
}

/**
 * Apply each site's substitutions one at a time and report the survivors.
 *
 * `targets` holds one entry per file: `{ path, source, sites, tests }`, where
 * `path` is relative to the workspace and `tests` names the first-wave test
 * files under `scripts/`. `allTests` names the verdict suite, which
 * `partitionTestFiles()` supplies.
 *
 * Each mutant runs its first wave, the test files that reach the module without
 * passing through another js/ module. A failure there kills the mutant and the
 * rest of the suite is skipped, which is where the ordering pays. A mutant that
 * survives its first wave then runs every remaining test file, so a survivor is
 * a mutant the whole suite passed. Node 24 offers no bail flag, so the stop
 * happens between the two spawns.
 *
 * The unmutated suite runs first, and a failure there aborts the run: a red
 * baseline kills every mutant, so the result would say nothing about the tests.
 */
export function runMutants({ workspace, targets,
    allTests = partitionTestFiles().suite, wholeSuite = false,
    log = () => {} }) {
    const withSites = targets.filter((target) => target.sites.length);
    // Without the whole suite, a module no test file reaches has no verdict at
    // all, and reporting its mutants as survivors would claim a gap that was
    // never tested for.
    const measurable = wholeSuite
        ? withSites
        : withSites.filter((target) => target.tests.length);
    const unmeasured = wholeSuite
        ? []
        : withSites.filter((target) => !target.tests.length);
    const baselineFiles = wholeSuite
        ? allTests
        : [...new Set(measurable.flatMap((target) => target.tests))].sort();

    // With no first wave and no `--whole-suite`, nothing runs and nothing is
    // known.
    if (!baselineFiles.length) {
        return { survivors: [], kills: [], killed: 0, timeouts: 0, ran: 0,
            perFile: [],
            unmeasured, wholeSuite, suiteSize: allTests.length,
            ranSeconds: 0, firstWaveKilled: 0, firstWaveRuns: 0,
            firstWaveSeconds: 0, wholeSuiteKilled: 0, wholeSuiteRuns: 0,
            wholeSuiteSeconds: 0, baselineSeconds: 0, baselineFiles: [],
            baselineTests: 0, byKind: new Map() };
    }

    log(`baseline: ${baselineFiles.length} test file(s)`);
    const baseline = runTests(workspace, baselineFiles, 15 * 60 * 1000);
    const baselineSeconds = baseline.seconds;
    const baselineTests = reportedTestCount(baseline.output);
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

    // A mutant can turn a bounded loop into an unbounded one. The unmutated
    // suite is the ceiling for any subset of it, so a run past that ceiling is
    // a hang, and a hung mutant counts as killed.
    const timeoutMs = Math.max(60_000, Math.ceil(baselineSeconds * 3) * 1000);
    const survivors = [];
    const kills = [];
    const perFile = [];
    // Kill rates differ sharply by kind, and that is the signal worth reading:
    // a surviving relational operator marks an untested boundary, while a
    // surviving integer is often a constant nothing observes.
    const byKind = new Map();
    const recordKind = (kind, wasKilled) => {
        const tally = byKind.get(kind) ?? { ran: 0, killed: 0 };
        tally.ran += 1;
        if (wasKilled) tally.killed += 1;
        byKind.set(kind, tally);
    };
    let killed = 0;
    let timeouts = 0;
    let ran = 0;
    let firstWaveKilled = 0;
    let firstWaveRuns = 0;
    let firstWaveSeconds = 0;
    let wholeSuiteKilled = 0;
    let wholeSuiteRuns = 0;
    let wholeSuiteSeconds = 0;

    for (const target of measurable) {
        const absolute = join(workspace, target.path);
        // The first wave already passed, so running the files it holds again
        // could not change the verdict.
        const remaining = allTests
            .filter((name) => !target.tests.includes(name));
        const tally = { path: target.path, tests: target.tests.length,
            mutants: 0, firstWaveSeconds: 0, reachedFullSuite: 0,
            wholeSuiteSeconds: 0 };
        try {
            for (const site of target.sites) {
                writeFileSync(absolute, applyMutation(target.source, site));
                ran += 1;
                tally.mutants += 1;

                if (target.tests.length) {
                    const wave = runTests(workspace, target.tests, timeoutMs);
                    firstWaveRuns += 1;
                    firstWaveSeconds += wave.seconds;
                    tally.firstWaveSeconds += wave.seconds;
                    if (wave.timedOut) timeouts += 1;
                    if (!wave.passed) {
                        killed += 1;
                        firstWaveKilled += 1;
                        recordKind(site.kind, true);
                        kills.push({ ...site, path: target.path, wave: 'first',
                            killedBy: killingTestFiles(wave.output) });
                        continue;
                    }
                }

                // An empty remainder means the first wave was the whole suite,
                // so passing it is already the whole suite's verdict.
                if (!wholeSuite || !remaining.length) {
                    survivors.push({ ...site, path: target.path,
                        tests: target.tests });
                    recordKind(site.kind, false);
                    continue;
                }
                const rest = runTests(workspace, remaining, timeoutMs);
                wholeSuiteRuns += 1;
                wholeSuiteSeconds += rest.seconds;
                tally.reachedFullSuite += 1;
                tally.wholeSuiteSeconds += rest.seconds;
                if (rest.timedOut) timeouts += 1;
                if (rest.passed) {
                    survivors.push({ ...site, path: target.path,
                        tests: target.tests });
                } else {
                    killed += 1;
                    wholeSuiteKilled += 1;
                    kills.push({ ...site, path: target.path, wave: 'suite',
                        killedBy: killingTestFiles(rest.output) });
                }
                recordKind(site.kind, !rest.passed);
            }
        } finally {
            writeFileSync(absolute, target.source);
        }
        if (tally.mutants) perFile.push(tally);
    }

    return { survivors, kills, killed, timeouts, ran, perFile, unmeasured,
        byKind, wholeSuite, suiteSize: allTests.length,
        ranSeconds: firstWaveSeconds + wholeSuiteSeconds,
        firstWaveKilled, firstWaveRuns, firstWaveSeconds,
        wholeSuiteKilled, wholeSuiteRuns, wholeSuiteSeconds,
        baselineSeconds, baselineFiles, baselineTests };
}

/**
 * The test files a failing run blamed, read from the reporter's own failure
 * output, over both the TAP and the spec reporter as `reportedTestCount()`
 * above does. The spec reporter prints `test at <path>:<line>:<col>` once per
 * failure; the TAP reporter prints `location: '<path>:<line>:<col>'` in the
 * YAML block under each `not ok`.
 *
 * Both are read because `node --test` chooses between them by Node version and
 * `package.json` supports the whole range: Node 22 defaults to TAP when stdout
 * is not a terminal, where Node 24 defaults to spec. Reading one format alone
 * attributes nothing on the other, and reports that silently, because an
 * unattributed kill is a legitimate result; the import-failure note below
 * covers that case.
 *
 * That format is the reporter's, not an API, so `scripts/mutate-sites.test.mjs`
 * pins each one against a file that genuinely fails. One other route was
 * measured and rejected: running a wave one file at a time to attribute by
 * position costs 2.72 times the concurrent wall clock for js/monmove.js's six
 * files and 2.58 times for js/hack.js's eight, because `node --test` runs files
 * concurrently and one file at a time turns a maximum into a sum.
 *
 * A run whose module throws at import can fail without naming a test, so an
 * empty result means the killer went unattributed.
 */
export function killingTestFiles(output) {
    const files = new Set();
    for (const match of output.matchAll(
        /^\s*(?:test at |location: ')(\S+?\.test\.mjs):\d+:\d+'?$/gmu))
        files.add(basename(match[1]));
    return [...files].sort();
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

const perMutant = (seconds, runs) =>
    runs ? (seconds / runs).toFixed(2) : '0.00';

/**
 * Render the run.
 *
 * `population` is how many mutants the target set holds, which differs from the
 * number run when `--sample` cut the set down. The kill rate and its interval
 * estimate the population from the mutants that ran.
 */
export function formatReport(result, population = result.ran) {
    const lines = [];
    lines.push(result.wholeSuite
        ? `verdict: the whole suite, ${result.suiteSize} test file(s)`
        : 'verdict: the first wave only, so a survivor below may still be '
            + 'killed by a test that reaches its module through another js/ '
            + 'module; pass --whole-suite to judge every mutant by the suite');
    for (const site of result.survivors) {
        lines.push(`survived ${describeSite(site)} `
            + `(${result.wholeSuite ? 'the whole suite passed; ' : ''}`
            + `first wave was ${site.tests.length} file(s): `
            + `${site.tests.join(', ') || 'none'})`);
    }
    // Per-file cost, split by phase. The first-wave figure follows from how
    // many test files reach the module; the full-suite figure is the same for
    // every file and applies only to the mutants that got past their first
    // wave.
    for (const tally of result.perFile) {
        lines.push(`cost ${tally.path}: ${tally.mutants} mutant(s), `
            + `${tally.tests} first-wave file(s) at `
            + `${perMutant(tally.firstWaveSeconds, tally.mutants)} s`
            + (result.wholeSuite
                ? `, ${tally.reachedFullSuite} reached the full suite at `
                    + `${perMutant(tally.wholeSuiteSeconds,
                        tally.reachedFullSuite)} s`
                : ''));
    }
    for (const kill of result.kills ?? []) {
        lines.push(`killed ${describeSite(kill)} (${kill.wave} wave: `
            + `${kill.killedBy.join(', ') || 'killer unattributed'})`);
    }
    for (const target of result.unmeasured) {
        lines.push(`unmeasured ${target.path}: ${target.sites.length} site(s), `
            + 'no test file reaches this module without passing through another '
            + 'js/ module; --whole-suite would judge it by the suite');
    }
    lines.push(`first wave: ${result.firstWaveKilled} of ${result.ran} `
        + `mutant(s) killed over ${result.firstWaveRuns} run(s) at `
        + `${perMutant(result.firstWaveSeconds, result.firstWaveRuns)} s each`);
    if (result.wholeSuite) {
        lines.push(`full suite: ${result.wholeSuiteRuns} mutant(s) reached it, `
            + `${result.wholeSuiteKilled} killed, at `
            + `${perMutant(result.wholeSuiteSeconds, result.wholeSuiteRuns)} `
            + 's each');
    }
    for (const [kind, tally] of [...(result.byKind ?? new Map())].sort()) {
        const { rate, low, high } = killRateInterval(tally.killed, tally.ran);
        lines.push(`kind ${kind}: ${tally.killed} of ${tally.ran} killed, `
            + `${rate.toFixed(1)}% (95% interval ${low.toFixed(1)}% to `
            + `${high.toFixed(1)}%)`);
    }
    if (result.ran && result.ran < population) {
        const { rate, low, high } = killRateInterval(result.killed, result.ran);
        lines.push(`kill rate: ${rate.toFixed(1)}% of the ${result.ran} `
            + `mutant(s) run, a 95% interval of ${low.toFixed(1)}% to `
            + `${high.toFixed(1)}% for the ${population} in the target set`);
    }
    lines.push(`${result.ran} mutant(s): ${result.killed} killed, `
        + `${result.survivors.length} survived, ${result.timeouts} timed out; `
        + `${result.ranSeconds.toFixed(1)} s of test time, `
        + `${perMutant(result.ranSeconds, result.ran)} s per mutant; baseline `
        + `${result.baselineTests} test(s) in `
        + `${result.baselineFiles.length} file(s) in `
        + `${result.baselineSeconds.toFixed(1)} s`);
    return lines;
}

/**
 * Draw `count` items uniformly without replacement, seeded so the draw repeats.
 *
 * mulberry32 is a small well-distributed 32-bit generator; the draw is a partial
 * Fisher-Yates shuffle over the indices, which keeps every subset equally
 * likely. js/isaac64.js is the game's generator and the scorer replaces it, so
 * this keeps its own.
 */
export function sampleItems(items, count, seed) {
    if (count >= items.length) return [...items];
    let state = (seed >>> 0) || 1;
    const random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const indices = items.map((_, index) => index);
    for (let i = 0; i < count; ++i) {
        const pick = i + Math.floor(random() * (indices.length - i));
        [indices[i], indices[pick]] = [indices[pick], indices[i]];
    }
    return indices.slice(0, count).sort((a, b) => a - b)
        .map((index) => items[index]);
}

/**
 * A 95% Wilson score interval for `killed` of `ran`, as percentages.
 *
 * Wilson holds up near 0 and 1, where the textbook normal interval runs past
 * them, and a kill rate often sits near one end.
 */
export function killRateInterval(killed, ran) {
    if (!ran) return { rate: 0, low: 0, high: 0 };
    const z = 1.96;
    const p = killed / ran;
    const denominator = 1 + (z * z) / ran;
    const centre = p + (z * z) / (2 * ran);
    const spread = z * Math.sqrt((p * (1 - p)) / ran
        + (z * z) / (4 * ran * ran));
    // A proportion cannot leave 0 and 1, and the arithmetic above lands just
    // outside at the ends: 0 of 20 puts the lower bound at -1.2e-15.
    const clamp = (value) => Math.min(100, Math.max(0, value * 100));
    return {
        rate: p * 100,
        low: clamp((centre - spread) / denominator),
        high: clamp((centre + spread) / denominator),
    };
}

/** Count the distinct tokens behind a mutant list. */
export function countSites(sites) {
    return new Set(sites.map((site) => site.offset)).size;
}

export function formatSiteCounts(targets, scopedLines) {
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
    const options = { range: null, paths: [], worktree: false, kinds: null,
        enumerateOnly: false, emitTrailer: false, wholeSuite: false,
        sample: null, seed: 1, report: null, fromReport: null };
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
        } else if (name === '--emit-trailer') {
            if (inlineValue !== null)
                throw new Error('--emit-trailer takes no value');
            options.emitTrailer = true;
        } else if (name === '--report') {
            options.report = valueOf();
        } else if (name === '--from-report') {
            options.fromReport = valueOf();
        } else if (name === '--worktree') {
            if (inlineValue !== null)
                throw new Error('--worktree takes no value');
            options.worktree = true;
        } else if (name === '--whole-suite') {
            if (inlineValue !== null)
                throw new Error('--whole-suite takes no value');
            options.wholeSuite = true;
        } else if (name === '--range') {
            if (options.range) throw new Error('pass one --range');
            const range = valueOf();
            parseRange(range);
            options.range = range;
        } else if (name === '--file') {
            options.paths.push(valueOf());
        } else if (name === '--kind') {
            const named = valueOf().split(',').map((kind) => kind.trim());
            for (const kind of named) {
                if (!SITE_KINDS.includes(kind)) {
                    throw new Error(`--kind takes ${SITE_KINDS.join(', ')}, `
                        + `not '${kind}'`);
                }
            }
            options.kinds = [...new Set(named)].sort();
        } else if (name === '--sample') {
            const value = Number(valueOf());
            if (!Number.isInteger(value) || value < 1)
                throw new Error('--sample takes a positive integer');
            options.sample = value;
        } else if (name === '--seed') {
            const value = Number(valueOf());
            if (!Number.isInteger(value) || value < 1)
                throw new Error('--seed takes a positive integer');
            options.seed = value;
        } else if (name.startsWith('-')) {
            throw new Error(`unknown option '${name}'`);
        } else {
            throw new Error(`unexpected argument '${argv[i]}': name every `
                + 'target with --range or --file');
        }
    }
    const named = [options.range && '--range', options.paths.length && '--file',
        options.worktree && '--worktree',
        options.fromReport && '--from-report'].filter(Boolean);
    if (named.length > 1)
        throw new Error(`pass one of ${named.join(' and ')}, not both`);
    if (!named.length) {
        throw new Error('pass --range <base>..<head> to mutate the lines a '
            + 'range changed, --file <path> to mutate a whole file, '
            + '--worktree to mutate the uncommitted js/ diff, or '
            + '--from-report <path> to re-run a report\'s survivors');
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
export function collectTargets({ range = null, paths = [], worktree = false,
    kinds = null, sample = null, seed = 1 }, root = REPO_ROOT) {
    let scope;
    if (worktree) scope = uncommittedJsLines(root);
    else if (range) scope = survivingRangeLines(range, root);
    else scope = new Map(paths.map((path) => [assertJsPath(path, root), null]));
    const covering = coveringTests(root);
    const targets = [];
    for (const path of [...scope.keys()].sort()) {
        const lines = scope.get(path);
        const source = readFileSync(join(root, path), 'utf8');
        const sites = enumerateSites(source, lines);
        targets.push({
            path,
            source,
            lineCount: lines ? lines.size : source.split('\n').length,
            sites: kinds
                ? sites.filter((site) => kinds.includes(site.kind))
                : sites,
            tests: covering.get(path) ?? [],
        });
    }
    const selected = kinds
        ? targets.filter((target) => target.sites.length)
        : targets;
    if (sample === null) return selected;
    // Draw across the whole target set at once, so the sample spans every file
    // in proportion to how many mutants each holds.
    const drawn = new Set(sampleItems(
        selected.flatMap((target) =>
            target.sites.map((site) => `${target.path}:${site.offset}:`
                + `${site.replacement}`)),
        sample, seed));
    return selected
        .map((target) => ({
            ...target,
            sites: target.sites.filter((site) => drawn.has(
                `${target.path}:${site.offset}:${site.replacement}`)),
        }))
        .filter((target) => target.sites.length);
}

/** Normalize a path argument, rejecting anything outside js/. */
function assertJsPath(path, root) {
    const normalized = relative(root, resolve(root, path));
    if (!normalized.startsWith('js/') || !existsSync(join(root, normalized)))
        throw new Error(`'${path}' is not a file under js/`);
    return normalized;
}

// The report a run writes with --report and a later run consumes with
// --from-report, so escalating a survivor list mutates the survivors alone.
// The version field gates parsing: a schema change bumps it, and a consumer
// refuses a version it does not know rather than misreading the file.
export const REPORT_VERSION = 1;

export function reportFromResult(result, kinds) {
    return {
        kind: 'mutate-sites-report',
        version: REPORT_VERSION,
        kinds: kinds ?? null,
        survivors: result.survivors.map(
            ({ path, line, column, kind, original, replacement }) =>
                ({ path, line, column, kind, original, replacement })),
    };
}

export function siteFilterFromReport(report) {
    if (report?.kind !== 'mutate-sites-report'
        || report.version !== REPORT_VERSION) {
        throw new Error('not a mutate-sites report this version understands '
            + `(expected kind mutate-sites-report version ${REPORT_VERSION})`);
    }
    const ids = new Set(report.survivors.map((survivor) =>
        `${survivor.path}:${survivor.line}`
            + `:${survivor.column}:${survivor.replacement}`));
    return {
        paths: [...new Set(report.survivors.map(({ path }) => path))].sort(),
        matches: (path, site) =>
            ids.has(`${path}:${site.line}:${site.column}:${site.replacement}`),
    };
}

/** The commit-message trailer recording a slice's mutation run. */
export function formatTrailer({ ran, killed }, kinds) {
    return `Mutants: ${ran}/${killed} `
        + `kind=${kinds?.length ? kinds.join(',') : 'all'}`;
}

async function main(argv) {
    const options = parseArgs(argv);
    let reportFilter = null;
    if (options.fromReport) {
        // parseArgs already rejects --from-report combined with another
        // target source, so the report alone names the paths.
        reportFilter = siteFilterFromReport(
            JSON.parse(readFileSync(options.fromReport, 'utf8')));
        options.paths = reportFilter.paths;
    }
    const narrowToReport = (list) => (reportFilter
        ? list.map((target) => ({ ...target,
            sites: target.sites.filter(
                (site) => reportFilter.matches(target.path, site)) }))
        : list);
    const population = narrowToReport(
        collectTargets({ ...options, sample: null }));
    const populationMutants = population
        .reduce((n, target) => n + target.sites.length, 0);
    const targets = options.sample === null
        ? population
        : narrowToReport(collectTargets(options));
    if (options.sample !== null) {
        console.log(`sample: ${targets.reduce((n, t) => n + t.sites.length, 0)} `
            + `of ${populationMutants} mutant(s) across `
            + `${targets.length} of ${population.length} file(s), seed `
            + `${options.seed}`);
    }
    const scopedLines = population.reduce((sum, t) => sum + t.lineCount, 0);
    for (const line of formatSiteCounts(population, scopedLines))
        console.log(line);
    if (options.enumerateOnly) return;

    const workspace = createWorkspace();
    try {
        const { suite, unaffected } = partitionTestFiles();
        if (options.wholeSuite) {
            console.log(`suite: ${suite.length} test file(s) import a js/ `
                + `module; ${unaffected.length} cannot be affected by a `
                + `mutation and are not run (${unaffected.join(', ')})`);
        }
        const result = runMutants({
            workspace,
            targets: targets.filter((target) => target.sites.length),
            allTests: suite,
            wholeSuite: options.wholeSuite,
            log: (message) => console.log(message),
        });
        for (const line of formatReport(result, populationMutants))
            console.log(line);
        // The worker copies this line into the slice's commit message, and
        // `npm run quality -- slice-mutants` later checks it is there.
        if (options.emitTrailer)
            console.log(formatTrailer(result, options.kinds));
        if (options.report) {
            writeFileSync(options.report, `${JSON.stringify(
                reportFromResult(result, options.kinds), null, 2)}\n`);
            console.log(`report written: ${options.report}`);
        }
    } finally {
        removeWorkspace(workspace);
    }
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (process.argv[1] === SCRIPT_PATH) {
    try {
        if (process.env[MUTATION_CGROUP_MARKER] === '1') {
            await main(process.argv.slice(2));
        } else {
            process.exitCode = runInMutationCgroup(
                SCRIPT_PATH, process.argv.slice(2));
        }
    } catch (error) {
        console.error(`mutate-sites: ${error.message}`);
        process.exitCode = 2;
    }
}
