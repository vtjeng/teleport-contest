// Cover scripts/coverage-report.mjs: the source geometry it measures lines
// with, the V8 range arithmetic it reduces coverage dumps with, and -- the one
// that matters most -- that a child process's coverage is collected, mapped
// back to a repository file, and merged. frozen/ps_test_runner.mjs runs every
// recorded session in a child process, so a child that dropped out of the
// measurement would shrink the score population with no error at all and make
// executed lines look unguarded.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    POPULATIONS,
    buildLineIndex,
    buildReport,
    collectUnexecuted,
    compressRanges,
    flattenRanges,
    formatReport,
    intersectUnexecuted,
    jsFileForCoverageUrl,
    unexecutedLineNumbers,
} from './coverage-report.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('only lines carrying code are measurable', () => {
    const source = [
        '// a comment line', //          1: no code
        '', //                           2: blank
        'const s = `text', //            3: code, then template text
        'more template text', //         4: template text only
        '`;', //                         5: the closing delimiter is code
        'const n = 1; // tail comment', //  6: code with a trailing comment
    ].join('\n');

    const index = buildLineIndex(source);

    // A comment, a blank line, and the interior of a template literal are not
    // code, so they can neither be reported as unexecuted nor swell a count.
    assert.deepEqual(index.codeLines.sort((a, b) => a - b), [3, 5, 6]);
});

test('a nested V8 range replaces the enclosing count over its span', () => {
    // The whole script ran once. One dead block starts where the script does,
    // which is the case that needs the longer range sorted first, and a second
    // sits strictly inside.
    const coverage = {
        functions: [{
            ranges: [
                { startOffset: 0, endOffset: 100, count: 1 },
                { startOffset: 0, endOffset: 40, count: 0 },
                { startOffset: 60, endOffset: 80, count: 0 },
            ],
        }],
    };

    assert.deepEqual(flattenRanges(coverage), [
        { start: 0, end: 40, count: 0 },
        // The gaps between dead blocks take the count of the range enclosing
        // them, not zero.
        { start: 40, end: 60, count: 1 },
        { start: 60, end: 80, count: 0 },
        { start: 80, end: 100, count: 1 },
    ]);
});

test('a line is unexecuted only when every code character on it is', () => {
    const source = [
        'export function f(a) {', //  1: ran
        '    if (a) {', //            2: the test ran; the brace opens dead code
        '        return 1;', //       3: never ran
        '    }', //                   4: never ran
        '    return 2;', //           5: ran
        '}', //                       6: ran
    ].join('\n');
    const bodyStart = source.indexOf('{', source.indexOf('if (a)'));
    const bodyEnd = source.indexOf('}', bodyStart) + 1;
    const coverage = {
        functions: [{
            ranges: [
                // f was called once, with a falsy argument.
                { startOffset: 0, endOffset: source.length, count: 1 },
                { startOffset: bodyStart, endOffset: bodyEnd, count: 0 },
            ],
        }],
    };

    const unexecuted = unexecutedLineNumbers(coverage,
        buildLineIndex(source));

    // Line 2 holds the executed `if (a)` and the dead `{`, and reads as
    // executed: a false "unexecuted" would send a reader to write a test for a
    // line that already runs.
    assert.deepEqual([...unexecuted].sort((a, b) => a - b), [3, 4]);
});

test('js/ URLs from the repository and from a scoring workspace both map', () => {
    const repoFile = pathToFileURL(join(REPO_ROOT, 'js', 'allmain.js')).href;
    assert.equal(jsFileForCoverageUrl(repoFile), 'js/allmain.js');

    // scripts/scoring-workspace.mjs copies js/ into a temporary root named
    // with this prefix, byte for byte, so line numbers still apply.
    const workspaceFile = pathToFileURL(
        join(tmpdir(), 'teleport-score-abc123', 'js', 'allmain.js')).href;
    assert.equal(jsFileForCoverageUrl(workspaceFile), 'js/allmain.js');

    // The judge overwrites these three before scoring.
    assert.equal(jsFileForCoverageUrl(
        pathToFileURL(join(REPO_ROOT, 'js', 'terminal.js')).href), null);
    // Tooling, a directory that merely ends in js/ somewhere else, and Node's
    // own internals all stay out.
    assert.equal(jsFileForCoverageUrl(
        pathToFileURL(join(REPO_ROOT, 'scripts', 'cmd.test.mjs')).href), null);
    assert.equal(jsFileForCoverageUrl(
        pathToFileURL('/elsewhere/js/allmain.js').href), null);
    assert.equal(jsFileForCoverageUrl('node:internal/modules/esm/utils'), null);
});

test('a line executed by any one coverage entry stops being unexecuted', () => {
    const merged = new Map();

    intersectUnexecuted(merged, 'js/a.js', new Set([1, 2, 3]));
    // A second process ran line 2, so only 1 and 3 are unexecuted everywhere.
    intersectUnexecuted(merged, 'js/a.js', new Set([1, 3, 4]));

    const record = merged.get('js/a.js');
    assert.deepEqual([...record.unexecuted].sort((a, b) => a - b), [1, 3]);
    // Two processes loaded the file. The count is what catches a scoring
    // worker that died before it could write its dump.
    assert.equal(record.dumps, 2);
    // A file no entry mentioned keeps no key, which is what distinguishes a
    // module nothing loaded from one that loaded and ran end to end.
    assert.equal(merged.has('js/b.js'), false);
});

test('consecutive lines compress into ranges', () => {
    assert.deepEqual(compressRanges([3, 1, 2, 7, 9, 10, 11]),
        ['1-3', '7', '9-11']);
    assert.deepEqual(compressRanges([]), []);
});

test('the listing puts the most unexecuted lines first and marks dead files',
    () => {
        const indexes = new Map([
            ['js/big.js', buildLineIndex('a();\nb();\nc();\nd();')],
            ['js/small.js', buildLineIndex('a();\nb();')],
            ['js/dead.js', buildLineIndex('a();\nb();\nc();\nd();')],
        ]);
        const populations = [
            // The tests ran everything in small.js and nothing in big.js.
            { name: 'tests', byFile: new Map([
                ['js/big.js', { unexecuted: new Set([1, 2, 3, 4]), dumps: 1 }],
                ['js/small.js', { unexecuted: new Set(), dumps: 1 }],
            ]) },
            // The score ran big.js line 1 and never loaded small.js.
            { name: 'score', byFile: new Map([
                ['js/big.js', { unexecuted: new Set([2, 3, 4]), dumps: 1 }],
            ]) },
        ];

        const report = buildReport(indexes, populations);

        assert.deepEqual(report.files, [
            // dead.js is longest in unexecuted lines because no population
            // loaded it at all, so it sorts above big.js.
            { file: 'js/dead.js', codeLines: 4, loadedAnywhere: false,
                lines: [1, 2, 3, 4] },
            { file: 'js/big.js', codeLines: 4, loadedAnywhere: true,
                lines: [2, 3, 4] },
        ]);
        // 10 code lines across the three files; small.js contributes no
        // unexecuted line, so the listing omits it.
        assert.deepEqual(report.totals,
            { files: 3, codeLines: 10, unexecuted: 7 });
        assert.deepEqual(report.perPopulation, [
            // tests loaded two files and executed small.js's two lines.
            { name: 'tests', files: 2, executed: 2 },
            // score loaded one file and executed one line of it.
            { name: 'score', files: 1, executed: 1 },
        ]);
        assert.deepEqual(report.either, { files: 2, executed: 3 });
    });

test('the report says it is not a score and prints no percentage', () => {
    const indexes = new Map([['js/a.js', buildLineIndex('a();\nb();')]]);
    const report = buildReport(indexes, [
        { name: 'tests', byFile: new Map([
            ['js/a.js', { unexecuted: new Set([2]), dumps: 1 }],
        ]) },
        { name: 'score', byFile: new Map() },
    ]);

    const text = formatReport(report, POPULATIONS);

    // A percentage is the shape that turns a selector into a target, and a
    // target is what this report must never become.
    assert.equal(text.includes('%'), false);
    assert.match(text, /Not a score/u);
    assert.match(text, /js\/a\.js: 1 unexecuted of 2 code lines/u);
});

test('coverage reaches a module only a spawned child imports', () => {
    // The regression this file exists for. The parent below never imports
    // js/mod.js, so any coverage for it can only have come from the child,
    // exactly as js/jsmain.js can only come from a ps_test_runner worker.
    const root = mkdtempSync(join(tmpdir(), 'teleport-score-'));
    try {
        mkdirSync(join(root, 'js'));
        const source = [
            'export function used() {', //    1
            '    return 1;', //               2
            '}', //                           3
            'export function unused() {', //  4
            '    return 2;', //               5
            '}', //                           6
        ].join('\n');
        writeFileSync(join(root, 'js', 'mod.js'), source);
        writeFileSync(join(root, 'child.mjs'),
            "import { used } from './js/mod.js';\nused();\n");
        // The parent spawns exactly as frozen/ps_test_runner.mjs does. Node's
        // child_process copies NODE_V8_COVERAGE into the child whether or not
        // the caller passes `env`, so what is under test here is the
        // collector, not the environment.
        writeFileSync(join(root, 'parent.mjs'), [
            "import { spawnSync } from 'node:child_process';",
            "import { join, dirname } from 'node:path';",
            "import { fileURLToPath } from 'node:url';",
            'const here = dirname(fileURLToPath(import.meta.url));',
            "const child = spawnSync(process.execPath, [join(here, 'child.mjs')],"
                + " { encoding: 'utf8' });",
            'if (child.status !== 0) throw new Error(child.stderr);',
        ].join('\n'));
        const coverageDir = join(root, 'coverage');
        mkdirSync(coverageDir);

        const parent = spawnSync(process.execPath, [join(root, 'parent.mjs')], {
            encoding: 'utf8',
            env: { ...process.env, NODE_V8_COVERAGE: coverageDir },
        });
        assert.equal(parent.status, 0, parent.stderr);

        const index = buildLineIndex(source);
        const byFile = collectUnexecuted(coverageDir,
            (file) => (file === 'js/mod.js' ? index : null));

        assert.ok(byFile.has('js/mod.js'),
            'no coverage for a module only the child imported');
        // Exactly one process loaded it, and it was not this one.
        assert.equal(byFile.get('js/mod.js').dumps, 1);
        // used() ran, so line 2 is absent; unused() never did, so its body and
        // closing brace are reported. Line 4 is not: V8 starts the function's
        // range at `function`, leaving the `export ` before it inside the
        // module range, which ran. An exported dead function therefore shows
        // as its body rather than its signature.
        assert.deepEqual(
            [...byFile.get('js/mod.js').unexecuted].sort((a, b) => a - b),
            [5, 6]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
