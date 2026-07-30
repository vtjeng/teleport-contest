// Cover scripts/mutate-range.mjs. The end-to-end tests run against the fixture
// under scripts/fixtures/mutate-range/, whose module documents, line by line,
// which of its sites its own test pins and which it leaves loose. The fixture,
// not js/, therefore carries the surviving mutants, so the expected report can
// be asserted exactly without a real gap in the game's tests.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    applyMutation,
    collectTargets,
    countSites,
    coveringTests,
    createWorkspace,
    describeSite,
    enumerateSites,
    formatReport,
    formatSiteCensus,
    parseAddedLines,
    parseArgs,
    parseRange,
    removeWorkspace,
    reportedTestCount,
    runMutants,
    tokenize,
} from './mutate-range.mjs';

const FIXTURE_ROOT = fileURLToPath(
    new URL('./fixtures/mutate-range', import.meta.url));
const FIXTURE_MODULE = `${FIXTURE_ROOT}/js/bounds.js`;

function fixtureSource() {
    return readFileSync(FIXTURE_MODULE, 'utf8');
}

/** One `runMutants` target over the fixture module. */
function fixtureTarget({ lines = null, tests = ['bounds.test.mjs'] } = {}) {
    const source = fixtureSource();
    return {
        path: 'js/bounds.js',
        source,
        addedLines: lines ? lines.size : source.split('\n').length,
        sites: enumerateSites(source, lines),
        tests,
    };
}

function withWorkspace(body) {
    const workspace = createWorkspace(FIXTURE_ROOT);
    try {
        return body(workspace);
    } finally {
        removeWorkspace(workspace);
    }
}

const shorthand = (site) =>
    `${site.line}:${site.kind} ${site.original}->${site.replacement}`;

// ---------------------------------------------------------------------------
// The changed lines
// ---------------------------------------------------------------------------

test('a range must name a base and a head', () => {
    assert.deepEqual(parseRange('abc123..def456'),
        { base: 'abc123', head: 'def456' });
    // Every other shape is rejected: a one-sided range would silently mutate
    // either nothing or the whole file.
    for (const bad of ['HEAD', 'HEAD..', '..HEAD', 'a..b..c', undefined])
        assert.throws(() => parseRange(bad), /range must be spelled/u);
});

test('added line numbers come from the hunk headers', () => {
    // A `--unified=0` diff over three files: one hunk with an explicit count,
    // one single-line hunk with no count, one hunk that only deletes, and a
    // deleted file.
    const diff = [
        'diff --git a/js/one.js b/js/one.js',
        '--- a/js/one.js',
        '+++ b/js/one.js',
        '@@ -10,0 +11,3 @@',
        '+a',
        '+b',
        '+c',
        '@@ -40,2 +44,0 @@',
        '-gone',
        '-gone',
        'diff --git a/js/two.js b/js/two.js',
        '--- a/js/two.js',
        '+++ b/js/two.js',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        'diff --git a/js/three.js b/js/three.js',
        '--- a/js/three.js',
        '+++ /dev/null',
        '@@ -1,2 +0,0 @@',
        '-gone',
        '-gone',
        'diff --git a/js/four.js b/js/four.js',
        '--- a/js/four.js',
        '+++ b/js/four.js',
        '@@ -5,2 +7,0 @@',
        '-gone',
        '-gone',
    ].join('\n');

    const added = parseAddedLines(diff);

    // js/three.js was deleted and js/four.js only lost lines, so neither has a
    // line to mutate and neither may appear at all: an empty entry would be
    // reported as a file with no sites.
    assert.deepEqual([...added.keys()], ['js/one.js', 'js/two.js']);
    // 11,3 covers 11 through 13; the `+44,0` hunk adds nothing.
    assert.deepEqual([...added.get('js/one.js')], [11, 12, 13]);
    // `+1` with no count is one line.
    assert.deepEqual([...added.get('js/two.js')], [1]);
});

// ---------------------------------------------------------------------------
// The site enumerator
// ---------------------------------------------------------------------------

test('the fixture module yields exactly the documented mutants', () => {
    const sites = enumerateSites(fixtureSource());

    // js/bounds.js names each of these lines and what its own test does to it.
    // The two lines the enumerator must skip, `flags & 8` and `ROW[0]`, are
    // absent, and every relational mutant shifts its boundary by one place.
    assert.deepEqual(sites.map(shorthand), [
        '10:integer 4->5',
        '10:integer 4->3',
        '15:relational <=-><',
        '21:relational <-><=',
        '21:integer 10->11',
        '21:integer 10->9',
        '27:logical &&->||',
        '34:integer 1->2',
        '34:integer 1->0',
        '45:integer 3->4',
        '45:integer 3->2',
        '54:boolean true->false',
    ]);
    // Eight distinct tokens: the three integer tokens each yield two mutants.
    assert.equal(countSites(sites), 8);
});

test('sites outside the changed lines are left alone', () => {
    // Line 21 is nearEdge()'s `return n < 10;` in the fixture module.
    const sites = enumerateSites(fixtureSource(), new Set([21]));

    assert.deepEqual(sites.map(shorthand), [
        '21:relational <-><=',
        '21:integer 10->11',
        '21:integer 10->9',
    ]);
});

test('an integer is a bound only outside a subscript, a bit mask, and a key',
    () => {
        const source = [
            'const bound = size <= 3;',       // 1: both are sites
            'const mask = flags & 8;',        // 2: bitwise operand
            'const shifted = 1 << 4;',        // 3: both bitwise operands
            'const complement = ~1;',         // 4: bitwise operand
            'const hex = 0x10;',              // 5: not decimal
            'const cell = grid[2];',          // 6: subscript
            'const offset = grid[i + 1];',    // 7: subscript
            'const nested = grid[clamp(5)];', // 8: argument, not an index
            'const named = { 6: x };',        // 9: object-literal key
            'const chosen = { a: f ? 7 : 8 };', // 10: ternary, not a key
            'const label = switchCase;',      // 11: no site
            'const real = 1.5;',              // 12: not an integer
            'const grouped = 1_000;',         // 13: a site
            'const listed = [9];',            // 14: array literal, not a index
        ].join('\n');

        const sites = enumerateSites(source);

        assert.deepEqual(sites.map(shorthand), [
            '1:relational <=-><',
            '1:integer 3->4',
            '1:integer 3->2',
            '8:integer 5->6',
            '8:integer 5->4',
            '10:integer 7->8',
            '10:integer 7->6',
            '10:integer 8->9',
            '10:integer 8->7',
            // The separator is dropped from the replacement, which stays a
            // valid literal.
            '13:integer 1_000->1001',
            '13:integer 1_000->999',
            '14:integer 9->10',
            '14:integer 9->8',
        ]);
    });

test('a case label is a bound and an object key is not', () => {
    // Both spellings put an integer before a colon. The switch body is a block,
    // so `case 3:` is mutable; the object literal's `3:` is a name.
    const source = [
        'switch (n) { case 3: break; }',
        'const table = { 3: value };',
    ].join('\n');

    assert.deepEqual(enumerateSites(source).map(shorthand),
        ['1:integer 3->4', '1:integer 3->2']);
});

test('a site inside a comment, a string, or a regular expression is invisible',
    () => {
        const source = [
            '// size <= 3 && true',
            'const quoted = "size <= 3 && true";',
            'const pattern = /size <= 3/u;',
            'const text = `size <= 3 ${live >= 4} tail`;',
        ].join('\n');

        // Only the code inside the template substitution is code.
        assert.deepEqual(enumerateSites(source).map(shorthand), [
            '4:relational >=->>',
            '4:integer 4->5',
            '4:integer 4->3',
        ]);
    });

test('a substitution replaces the token and nothing else', () => {
    const source = 'return a <= b;';
    const [site] = enumerateSites(source);

    assert.equal(applyMutation(source, site), 'return a < b;');
    // The site addresses the raw source, so a longer or shorter replacement
    // leaves the rest of the line intact.
    assert.equal(applyMutation('const n = 9;', enumerateSites('const n = 9;')[0]),
        'const n = 10;');
});

test('a blanked string becomes one token and keeps its offsets', () => {
    // blankCommentsAndStrings() leaves the quotes and spaces out the body, so
    // the tokenizer has to emit one token whose span covers the quotes and the
    // blanks between them.
    const tokens = tokenize('a = \'    \' + 1;');

    assert.deepEqual(tokens.map((token) => `${token.kind}:${token.text}`),
        ['identifier:a', 'punctuator:=', 'string:\'', 'punctuator:+',
            'number:1', 'punctuator:;']);
    // The string token spans both quotes and the four blanked characters
    // between them, so it starts at the opening quote's offset, 4, and ends
    // after the closing quote at offset 9.
    assert.equal(tokens[2].start, 4);
    assert.equal(tokens[2].end, 10);
});

test('a run that executes no test file is not a run of survivors', () => {
    // `node --test` exports NODE_TEST_CONTEXT to its children, and an inner
    // `--test` run that inherits it skips every file it was given and still
    // exits 0. This test file is itself a child of the runner, so the variable
    // is set here, and the count below is what catches the empty run.
    assert.equal(reportedTestCount('# tests 12\n# pass 12\n'), 12);
    assert.equal(reportedTestCount('ℹ tests 12'), 12);
    assert.equal(reportedTestCount('Warning: skipping running files.'), 0);

    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget()],
        limit: 1,
    }));

    // scripts/fixtures/mutate-range/scripts/bounds.test.mjs holds five tests.
    assert.equal(result.baselineTests, 5);
});

// ---------------------------------------------------------------------------
// Which tests cover a module
// ---------------------------------------------------------------------------

test('the walk stops at the first js/ module it reaches', () => {
    const covering = coveringTests(FIXTURE_ROOT);

    // bounds.test.mjs and red-baseline.test.mjs import js/bounds.js directly,
    // in file-name order. wrapper.test.mjs reaches it only through
    // js/wrapper.js, so it covers the wrapper and not the bound: following
    // js/-to-js/ imports would put most of a real suite behind every module.
    // Keys arrive in the order the walk reaches them, so bounds.test.mjs, the
    // first test file by name, registers js/bounds.js first.
    assert.deepEqual([...covering], [
        ['js/bounds.js', ['bounds.test.mjs', 'red-baseline.test.mjs']],
        ['js/wrapper.js', ['wrapper.test.mjs']],
    ]);
});

test('the repository maps its own modules to test files', () => {
    // A real module, to show that the walk resolves the repository's own
    // specifiers: scripts/mondata-pure.test.mjs imports js/mondata.js.
    const covering = coveringTests();

    assert.equal(covering.get('js/mondata.js').includes('mondata-pure.test.mjs'),
        true);
});

// ---------------------------------------------------------------------------
// Applying the mutants
// ---------------------------------------------------------------------------

test('the fixture run reports exactly the mutants its test leaves alive',
    () => {
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget()],
        }));

        // js/bounds.js documents why these five survive: nearEdge() is tested
        // far from its boundary, and nothing calls padded().
        assert.deepEqual(result.survivors.map(shorthand), [
            '21:relational <-><=',
            '21:integer 10->11',
            '21:integer 10->9',
            '34:integer 1->2',
            '34:integer 1->0',
        ]);
        // The other seven of the module's twelve mutants change a value the
        // fixture test asserts.
        assert.equal(result.killed, 7);
        assert.equal(result.ran, 12);
        assert.equal(result.timeouts, 0);
        assert.deepEqual(result.baselineFiles, ['bounds.test.mjs']);

        const report = formatReport(result);
        assert.equal(report[0], 'survived js/bounds.js:21:14: relational '
            + '`<` -> `<=` (1 test file(s): bounds.test.mjs)');
        assert.match(report.at(-1),
            /^12 mutant\(s\): 7 killed, 5 survived, 0 timed out;/u);
    });

test('the module is restored after the last mutant', () => {
    const before = fixtureSource();
    withWorkspace((workspace) => {
        runMutants({ workspace, targets: [fixtureTarget()], limit: 3 });
        // The workspace copy, not the repository file, is what a mutation
        // rewrites; it has to be put back so the next file's baseline holds.
        assert.equal(readFileSync(`${workspace}/js/bounds.js`, 'utf8'), before);
    });
    assert.equal(fixtureSource(), before);
});

test('a limit stops the run early', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget()],
        limit: 2,
    }));

    // The first two mutants of the fixture module both change LIMIT, which its
    // test asserts, so neither survives.
    assert.equal(result.ran, 2);
    assert.deepEqual(result.survivors, []);
});

test('a red baseline stops the run before the first mutant',
    () => {
        // scripts/red-baseline.test.mjs asserts LIMIT === 5 against a module
        // that sets it to 4. Every mutant would look killed against it.
        assert.throws(
            () => withWorkspace((workspace) => runMutants({
                workspace,
                targets: [fixtureTarget({ tests: ['red-baseline.test.mjs'] })],
            })),
            /the unmutated tests do not pass/u,
        );
    });

test('a module no test file imports is reported as unmeasured', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget({ tests: [] })],
    }));

    assert.equal(result.ran, 0);
    // No test file means no baseline to run and nothing to conclude. The report
    // says so; counting twelve survivors here would be wrong.
    assert.deepEqual(result.baselineFiles, []);
    assert.deepEqual(formatReport(result).slice(0, 1), [
        'unmeasured js/bounds.js: 12 site(s), no test file imports this module',
    ]);
});

// ---------------------------------------------------------------------------
// The command line and the census
// ---------------------------------------------------------------------------

test('the command line takes a range, a limit, and nothing else', () => {
    assert.deepEqual(parseArgs(['a..b']),
        { range: 'a..b', enumerateOnly: false, limit: Infinity });
    assert.deepEqual(parseArgs(['a..b', '--enumerate-only', '--limit', '5']),
        { range: 'a..b', enumerateOnly: true, limit: 5 });
    assert.throws(() => parseArgs(['a..b', '--all']), /unknown option/u);
    assert.throws(() => parseArgs(['a..b', 'c..d']), /unexpected argument/u);
    assert.throws(() => parseArgs(['a..b', '--limit', '0']),
        /positive integer/u);
    assert.throws(() => parseArgs([]), /range must be spelled/u);
});

test('the census separates sites from mutants and states the density', () => {
    const target = fixtureTarget();
    // 40 added lines is an arbitrary round population; the density it produces,
    // 8 / 40, is exact.
    const census = formatSiteCensus([{ ...target, addedLines: 40 }], 40);

    assert.equal(census.at(-2), '1 file(s), 40 added line(s), 8 site(s), '
        + '12 mutant(s); 0.200 sites per added line');
    assert.equal(census.at(-1), 'mutants by kind: boolean 1, integer 8, '
        + 'logical 1, relational 2; an integer site yields one mutant each way');
});

test('a real range resolves to files, lines, and covering tests', () => {
    // The last commit on this branch, whichever it is: the shape of the result
    // is what matters, not the range's contents.
    const targets = collectTargets('HEAD~1..HEAD');

    for (const target of targets) {
        assert.match(target.path, /^js\//u);
        assert.equal(target.addedLines > 0, true);
        assert.equal(typeof target.source, 'string');
        for (const site of target.sites) {
            // Every site sits on a line the range touched, and its description
            // is what the report prints.
            assert.equal(site.line > 0, true);
            assert.match(describeSite({ ...site, path: target.path }),
                /^js\/[\w.]+:\d+:\d+: \w+ `.*` -> `.*`$/u);
        }
    }
});
