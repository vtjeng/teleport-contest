// Cover scripts/mutate-sites.mjs. The end-to-end tests run against the fixture
// under scripts/fixtures/mutate-sites/, whose module documents, line by line,
// which of its sites its own test pins and which it leaves loose. The fixture,
// not js/, therefore carries the surviving mutants, so the expected report can
// be asserted exactly without a real gap in the game's tests.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
    applyMutation,
    changedJsLines,
    collectTargets,
    countSites,
    coveringTests,
    createWorkspace,
    describeSite,
    enumerateSites,
    formatReport,
    formatSiteCounts,
    killRateInterval,
    parseAddedLines,
    parseArgs,
    partitionTestFiles,
    parseRange,
    removeWorkspace,
    reportedTestCount,
    runMutants,
    sampleItems,
    survivingRangeLines,
    tokenize,
} from './mutate-sites.mjs';

const SCRIPT_PATH = fileURLToPath(
    new URL('./mutate-sites.mjs', import.meta.url));
const FIXTURE_ROOT = fileURLToPath(
    new URL('./fixtures/mutate-sites', import.meta.url));
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
        lineCount: lines ? lines.size : source.split('\n').length,
        sites: enumerateSites(source, lines),
        tests,
    };
}

// The fixture's whole suite for verdict purposes. red-baseline.test.mjs fails
// against the unmutated module by design, so only the test that exercises the
// abort path names it.
const FIXTURE_SUITE = ['bounds.test.mjs', 'wrapper.test.mjs'];

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

/**
 * The newest commit that changed a file under js/.
 *
 * Ranges built from it hold js/ lines whatever the branch has committed since,
 * so a test over a real range cannot quietly reduce to an empty one.
 */
function newestJsCommit() {
    const sha = execFileSync('git', ['log', '-1', '--format=%H', '--', 'js/'],
        { encoding: 'utf8' }).trim();
    assert.match(sha, /^[0-9a-f]{40}$/u);
    return sha;
}

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
        '63:relational >=->>',
    ]);
    // Nine distinct tokens: the three integer tokens each yield two mutants.
    assert.equal(countSites(sites), 9);
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
        allTests: FIXTURE_SUITE,
        fullSuite: true,
        limit: 1,
    }));

    // bounds.test.mjs holds five tests and wrapper.test.mjs holds one.
    assert.equal(result.baselineTests, 6);
});

// ---------------------------------------------------------------------------
// Which tests cover a module
// ---------------------------------------------------------------------------

test('the verdict suite is the test files a js/ mutation can affect', () => {
    const { suite, unaffected } = partitionTestFiles();

    for (const name of [...suite, ...unaffected])
        assert.match(name, /\.test\.mjs$/u);
    // scripts/hack.test.mjs imports js/hack.js, so a mutation can fail it.
    assert.equal(suite.includes('hack.test.mjs'), true);
    // This file imports no js/ module. It reads js/ files as text and compares
    // them with git, so running it against a mutated module would fail it for a
    // reason that has nothing to do with game behavior.
    assert.equal(unaffected.includes('mutate-sites.test.mjs'), true);
    // scripts/quality-status.test.mjs reads QUALITY.json and imports no js/
    // module, so no mutation can reach it.
    assert.equal(unaffected.includes('quality-status.test.mjs'), true);
    // A helper module under scripts/ holds no test and appears in neither list.
    assert.equal([...suite, ...unaffected]
        .includes('monster-test-state.mjs'), false);
});

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
            allTests: FIXTURE_SUITE,
            fullSuite: true,
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
        // Of the module's thirteen mutants, seven change a value
        // scripts/bounds.test.mjs asserts and forwarded()'s mutant is killed by
        // scripts/wrapper.test.mjs in the second wave.
        assert.equal(result.killed, 8);
        assert.equal(result.firstWaveKilled, 7);
        assert.equal(result.fullSuiteKilled, 1);
        assert.equal(result.ran, 13);
        assert.equal(result.timeouts, 0);
        assert.deepEqual(result.baselineFiles, FIXTURE_SUITE);

        const report = formatReport(result);
        assert.equal(report[0], 'verdict: the whole suite, 2 test file(s)');
        assert.equal(report[1], 'survived js/bounds.js:21:14: relational '
            + '`<` -> `<=` (the whole suite passed; first wave was 1 file(s): '
            + 'bounds.test.mjs)');
        assert.match(report.at(-1),
            /^13 mutant\(s\): 8 killed, 5 survived, 0 timed out;/u);
    });

test('a mutant the first wave passes and a wider file kills counts as killed',
    () => {
        // Line 63 of js/bounds.js is forwarded(), which only js/wrapper.js
        // reaches. scripts/bounds.test.mjs is the entire first wave for
        // js/bounds.js and passes this mutation; scripts/wrapper.test.mjs fails
        // on it. This is the shape of js/hack.js:544 in the repository, where
        // scripts/closed-door-autoopen.test.mjs kills a mutant that all seven
        // test files importing js/hack.js directly pass.
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget({ lines: new Set([63]) })],
            allTests: ['bounds.test.mjs', 'wrapper.test.mjs'],
            fullSuite: true,
        }));

        assert.equal(result.ran, 1);
        assert.deepEqual(result.survivors, []);
        // The first wave passed it and the rest of the suite killed it, so the
        // verdict cannot come from the first wave alone.
        assert.equal(result.firstWaveKilled, 0);
        assert.equal(result.fullSuiteKilled, 1);
    });

test('without --full the first wave is the verdict and the report says so',
    () => {
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget({ lines: new Set([63]) })],
            allTests: FIXTURE_SUITE,
        }));

        // The same mutant the previous test sees killed. Without the second
        // wave, scripts/wrapper.test.mjs never runs and the mutant survives, so
        // the report has to say the verdict came from the first wave alone.
        assert.equal(result.ran, 1);
        assert.equal(result.survivors.length, 1);
        assert.equal(result.fullSuiteRuns, 0);
        // Only the first wave ran, so the baseline is the first wave too, and
        // scripts/wrapper.test.mjs is left out of both.
        assert.deepEqual(result.baselineFiles, ['bounds.test.mjs']);

        const report = formatReport(result);
        assert.match(report[0], /^verdict: the first wave only,/u);
        assert.match(report[0], /pass --full/u);
        assert.equal(report.some((line) => line.startsWith('full suite:')),
            false);
    });

test('without --full a module with no first wave is reported as unmeasured',
    () => {
        const result = withWorkspace((workspace) => runMutants({
            workspace,
            targets: [fixtureTarget({ tests: [], lines: new Set([10]) })],
            allTests: FIXTURE_SUITE,
        }));

        // Nothing ran, so nothing is known. Reporting the two mutants of line 10
        // as survivors would claim a gap that was never tested for.
        assert.equal(result.ran, 0);
        assert.deepEqual(result.survivors, []);
        assert.equal(formatReport(result).some((line) => line.startsWith(
            'unmeasured js/bounds.js: 2 site(s)')), true);
    });

test('the module is restored after the last mutant', () => {
    const before = fixtureSource();
    withWorkspace((workspace) => {
        runMutants({ workspace, targets: [fixtureTarget()], limit: 3,
            allTests: FIXTURE_SUITE, fullSuite: true });
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
        allTests: FIXTURE_SUITE,
        fullSuite: true,
        limit: 2,
    }));

    // The first two mutants of the fixture module both change LIMIT, which its
    // test asserts, so neither survives.
    assert.equal(result.ran, 2);
    assert.deepEqual(result.survivors, []);
    // The other eleven went unmeasured, which the report has to say: 2 killed
    // of 2 run would otherwise read as a clean result for the whole file.
    assert.equal(result.scheduled, 13);
    assert.equal(formatReport(result).includes(
        'limited to 2 of 13 mutant(s) in path order; the rest were not '
        + 'measured'), true);
});

test('a red baseline stops the run before the first mutant',
    () => {
        // scripts/red-baseline.test.mjs asserts LIMIT === 5 against a module
        // that sets it to 4. Every mutant would look killed against it.
        assert.throws(
            () => withWorkspace((workspace) => runMutants({
                workspace,
                targets: [fixtureTarget()],
                allTests: ['red-baseline.test.mjs'],
                fullSuite: true,
            })),
            /the unmutated tests do not pass/u,
        );
    });

test('a module with an empty first wave is still judged by the suite', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget({ tests: [], lines: new Set([10]) })],
        allTests: FIXTURE_SUITE,
        fullSuite: true,
    }));

    // Line 10 is `export const LIMIT = 4;`, which scripts/bounds.test.mjs
    // asserts. With no first wave, both of its mutants go straight to the
    // suite, which kills them. The covering-set rule this replaced called such
    // a module unmeasurable and ran nothing.
    assert.equal(result.ran, 2);
    assert.equal(result.firstWaveRuns, 0);
    assert.equal(result.fullSuiteRuns, 2);
    assert.equal(result.killed, 2);
    assert.deepEqual(result.survivors, []);
});

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

test('a seeded draw repeats exactly and picks each item once', () => {
    const items = Array.from({ length: 100 }, (_, index) => index);

    // A sample is worth reporting only if someone else can rerun it, so the
    // seed has to fix the draw.
    assert.deepEqual(sampleItems(items, 10, 7), sampleItems(items, 10, 7));
    assert.notDeepEqual(sampleItems(items, 10, 7), sampleItems(items, 10, 8));

    const drawn = sampleItems(items, 10, 7);
    assert.equal(drawn.length, 10);
    // Without replacement, and every item from the population.
    assert.equal(new Set(drawn).size, 10);
    for (const item of drawn) assert.equal(items.includes(item), true);
    // Asking for the whole population, or more, returns all of it.
    assert.deepEqual(sampleItems(items, 100, 7), items);
    assert.deepEqual(sampleItems(items, 500, 7), items);
});

test('a draw spreads over the population', () => {
    const items = Array.from({ length: 1000 }, (_, index) => index);
    const drawn = sampleItems(items, 200, 4);

    // A biased draw is the failure this guards against: `--limit` truncates in
    // path order, and a sample that clustered the same way would measure one
    // corner of the codebase. An even draw puts about 100 of the 200 in the
    // lower half; truncation puts either 200 or 0 there.
    const lower = drawn.filter((item) => item < 500).length;
    assert.equal(lower > 60 && lower < 140, true);
});

test('the kill rate carries a Wilson interval', () => {
    // 12 of 30 worked by hand: p = 0.4, z = 1.96, giving 24.6% to 57.7%.
    const twelveOfThirty = killRateInterval(12, 30);
    assert.equal(twelveOfThirty.rate.toFixed(1), '40.0');
    assert.equal(twelveOfThirty.low.toFixed(1), '24.6');
    assert.equal(twelveOfThirty.high.toFixed(1), '57.7');

    // Wilson stays inside 0 and 100 at the ends, where the textbook normal
    // interval runs past them.
    const all = killRateInterval(20, 20);
    assert.equal(all.rate, 100);
    assert.equal(all.high <= 100, true);
    assert.equal(all.low > 80, true);
    const none = killRateInterval(0, 20);
    assert.equal(none.low >= 0, true);
    assert.equal(none.high < 20, true);
    // Nothing ran, so there is nothing to estimate.
    assert.deepEqual(killRateInterval(0, 0), { rate: 0, low: 0, high: 0 });
});

test('a sample cuts the target set down and repeats with its seed', () => {
    const mutants = (targets) =>
        targets.flatMap((target) => target.sites.map((site) =>
            `${target.path}:${site.offset}:${site.replacement}`));
    const paths = ['js/lock.js', 'js/regen.js'];
    const drawn = collectTargets({ paths, sample: 6, seed: 5 });
    const again = collectTargets({ paths, sample: 6, seed: 5 });
    const whole = collectTargets({ paths });

    assert.equal(mutants(drawn).length, 6);
    assert.deepEqual(mutants(drawn), mutants(again));
    // Every drawn mutant belongs to the population it was drawn from.
    for (const mutant of mutants(drawn))
        assert.equal(mutants(whole).includes(mutant), true);
    assert.equal(mutants(whole).length > 6, true);
});

test('the report breaks the kill rate down by mutation kind', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget()],
        allTests: FIXTURE_SUITE,
        fullSuite: true,
    }));
    const report = formatReport(result, 13);

    // js/bounds.js holds one logical site, which scripts/bounds.test.mjs kills,
    // and three relational sites, of which scripts/bounds.test.mjs kills one and
    // scripts/wrapper.test.mjs kills another.
    assert.deepEqual(result.byKind.get('logical'), { ran: 1, killed: 1 });
    assert.deepEqual(result.byKind.get('relational'), { ran: 3, killed: 2 });
    assert.equal(report.some((line) => line.startsWith(
        'kind relational: 2 of 3 killed, 66.7%')), true);
    // The population equals what ran, so no sample line is printed.
    assert.equal(report.some((line) => line.startsWith('kill rate:')), false);
});

test('a sampled run states the interval for the population it sampled', () => {
    const result = withWorkspace((workspace) => runMutants({
        workspace,
        targets: [fixtureTarget({ lines: new Set([10]) })],
        allTests: FIXTURE_SUITE,
        fullSuite: true,
    }));

    // Line 10 is `export const LIMIT = 4;`: two mutants, both killed, drawn from
    // a population of thirteen.
    assert.equal(result.ran, 2);
    assert.equal(result.killed, 2);
    assert.equal(formatReport(result, 13).some((line) => line.startsWith(
        'kill rate: 100.0% of the 2 mutant(s) run, a 95% interval of ')), true);
});

// ---------------------------------------------------------------------------
// The command line and the census
// ---------------------------------------------------------------------------

test('every target is named by --range or --file', () => {
    assert.deepEqual(parseArgs(['--range', 'a..b']),
        { range: 'a..b', paths: [], enumerateOnly: false, full: false,
            limit: Infinity, sample: null, seed: 1 });
    assert.deepEqual(parseArgs(['--file', 'js/a.js', '--file', 'js/b.js']),
        { range: null, paths: ['js/a.js', 'js/b.js'], enumerateOnly: false,
            full: false, limit: Infinity, sample: null, seed: 1 });
    // `--name=value` and `--name value` are the same option.
    assert.deepEqual(parseArgs(['--range=a..b', '--limit=5',
        '--enumerate-only', '--full', '--sample=40', '--seed=7']),
    { range: 'a..b', paths: [], enumerateOnly: true, full: true, limit: 5,
        sample: 40, seed: 7 });
    assert.throws(() => parseArgs(['--sample', '0']), /positive integer/u);
    assert.throws(() => parseArgs(['--seed', 'x']), /positive integer/u);

    assert.throws(() => parseArgs(['--range', 'a..b', '--all']),
        /unknown option/u);
    assert.throws(() => parseArgs(['--range', 'a..b', '--range', 'c..d']),
        /pass one --range/u);
    // A range already decides which lines of which files are in scope, so a
    // file alongside it would have no meaning.
    assert.throws(() => parseArgs(['--range', 'a..b', '--file', 'js/a.js']),
        /--range or --file, not both/u);
    assert.throws(() => parseArgs(['--range', 'a..b', '--limit', '0']),
        /positive integer/u);
    assert.throws(() => parseArgs(['--range', 'HEAD']),
        /range must be spelled/u);
    assert.throws(() => parseArgs([]), /pass --range/u);
    // A value the shell dropped, or an argument with no option name, is a
    // mistake to report, and no kind of target to guess at.
    assert.throws(() => parseArgs(['--range']), /--range takes a value/u);
    assert.throws(() => parseArgs(['--file']), /--file takes a value/u);
    assert.throws(() => parseArgs(['js/a.js']), /unexpected argument/u);
    assert.throws(() => parseArgs(['a..b']), /unexpected argument/u);
    assert.throws(() => parseArgs(['--enumerate-only=yes']),
        /takes no value/u);
    assert.throws(() => parseArgs(['--full=yes']), /--full takes no value/u);
});

test('a path outside js/ is refused', () => {
    // The mutator only rewrites the workspace's js/ copy, and a test file it
    // rewrote instead would report every mutant as killed.
    assert.throws(() => collectTargets({ paths: ['scripts/lock.test.mjs'] }),
        /is not a file under js\//u);
    assert.throws(() => collectTargets({ paths: ['js/no-such-module.js'] }),
        /is not a file under js\//u);
});

test('the counts separate sites from mutants and state the density', () => {
    const target = fixtureTarget();
    // 40 lines is an arbitrary round population; the density it produces,
    // 8 / 40, is exact.
    const counts = formatSiteCounts([{ ...target, lineCount: 40 }], 40);

    assert.equal(counts.at(-2), '1 file(s), 40 line(s) in scope, 9 site(s), '
        + '13 mutant(s); 0.225 sites per line in scope');
    assert.equal(counts.at(-1), 'mutants by kind: boolean 1, integer 8, '
        + 'logical 1, relational 3; an integer site yields one mutant each way');
});

test('a real range resolves to files, lines, and covering tests', () => {
    const targets = collectTargets({ range: `${newestJsCommit()}~1..HEAD` });

    // The base is the parent of the newest commit that touched js/, so the
    // range holds at least that commit's changed lines. A range with no js/
    // file would let the loop below assert nothing and still pass, which is the
    // failure this script exists to report.
    assert.equal(targets.length > 0, true);
    for (const target of targets) {
        assert.match(target.path, /^js\//u);
        assert.equal(target.lineCount > 0, true);
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

/** The text of each line a range added, keyed by path. */
function addedTextIn(range) {
    const diff = execFileSync('git',
        ['diff', '--unified=0', '--no-color', range, '--', 'js/'],
        { encoding: 'utf8', maxBuffer: 1e8 });
    const added = new Map();
    let path = null;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++ ')) {
            path = line.slice(4).trim().replace(/^b\//u, '');
            continue;
        }
        if (!path || !line.startsWith('+')) continue;
        if (!added.has(path)) added.set(path, new Set());
        added.get(path).add(line.slice(1));
    }
    return added;
}

test('a blamed line holds text that the range added', () => {
    // The two numbering schemes are not comparable: survivingRangeLines()
    // reports positions in the working tree and changedJsLines() reports
    // positions as of the head commit, so a commit that grows a file above a
    // reviewed line moves it in one scheme and not the other. What must hold is
    // that the text found at each blamed position is text the range wrote.
    //
    // The newest js/ commit and the fifth newest cover both cases: a range
    // whose lines have had no chance to move, and one whose lines have had
    // four commits' worth.
    const heads = execFileSync('git',
        ['log', '--format=%H', '-5', '--', 'js/'], { encoding: 'utf8' })
        .trim().split('\n');

    for (const head of [heads[0], heads.at(-1)]) {
        const range = `${head}~1..${head}`;
        const addedText = addedTextIn(range);
        const fromDiff = changedJsLines(range);
        const fromBlame = survivingRangeLines(range);

        assert.equal(fromBlame.size > 0, true);
        for (const [path, lines] of fromBlame) {
            assert.equal(lines.size > 0, true);
            // A later commit can take a line away from the range and cannot
            // give it one, so blame never names more lines than the diff did.
            assert.equal(lines.size <= fromDiff.get(path).size, true);
            const current = readFileSync(path, 'utf8').split('\n');
            for (const line of lines)
                assert.equal(addedText.get(path).has(current[line - 1]), true);
        }
    }
});

/**
 * Build a throwaway repository and hand `body` its root and a git runner.
 *
 * The repository under test cannot supply the cases below: proving that blame
 * reads the working tree needs an uncommitted edit, and proving that a deleted
 * file is skipped needs a commit that deletes one. Neither may happen in js/.
 */
function withTempRepo(body) {
    const root = mkdtempSync(join(tmpdir(), 'mutate-sites-repo-'));
    const git = (...args) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    try {
        git('init', '--quiet');
        git('config', 'user.email', 'test@example.invalid');
        git('config', 'user.name', 'Mutate Range Test');
        mkdirSync(join(root, 'js'));
        return body({ root, git });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('blame reads the working tree, and skips a file deleted since', () => {
    withTempRepo(({ root, git }) => {
        const write = (name, text) =>
            writeFileSync(join(root, 'js', name), text);
        const commit = (message) => {
            git('add', '-A');
            git('commit', '--quiet', '-m', message);
            return git('rev-parse', 'HEAD');
        };

        write('one.js', 'const a = 1;\n');
        write('two.js', 'const b = 2;\n');
        const base = commit('first');
        // The range under test changes both files.
        write('one.js', 'const a = 1;\nconst added = n < 10;\n');
        write('two.js', 'const b = 2;\nconst alsoAdded = m < 20;\n');
        const head = commit('second');

        // With the head committed and the tree clean, the two numbering schemes
        // agree, so blame must reproduce the diff exactly. Only a controlled
        // repository can assert that: in a working repository a later commit or
        // an uncommitted edit shifts the working-tree positions.
        assert.deepEqual(
            [...survivingRangeLines(`${base}..${head}`, root)]
                .map(([path, lines]) => [path, [...lines]]),
            [...changedJsLines(`${base}..${head}`, root)]
                .map(([path, lines]) => [path, [...lines]]),
        );

        // A later commit deletes one of them, so the range names a file the
        // working tree does not hold.
        rmSync(join(root, 'js', 'two.js'));
        commit('third');
        // An uncommitted edit pushes js/one.js's line 2 down to line 3.
        write('one.js', '// inserted, never committed\nconst a = 1;\n'
            + 'const added = n < 10;\n');

        const surviving = survivingRangeLines(`${base}..${head}`, root);

        // js/two.js is absent because it no longer exists to mutate.
        assert.deepEqual([...surviving.keys()], ['js/one.js']);
        // Line 3, not line 2: blaming the working tree numbers lines by the
        // file the mutator reads. Line 1 is uncommitted, so it belongs to no
        // commit and to no range.
        assert.deepEqual([...surviving.get('js/one.js')], [3]);
    });
});

test('a path puts every line of that file in scope', () => {
    const [target] = collectTargets({ paths: ['js/lock.js'] });
    const source = readFileSync('js/lock.js', 'utf8');

    assert.equal(target.path, 'js/lock.js');
    assert.equal(target.lineCount, source.split('\n').length);
    // No line filter, so the file's every site is a target, and the covering
    // test set is the same one a range over this file would use.
    assert.equal(target.sites.length, enumerateSites(source).length);
    assert.deepEqual(target.tests, coveringTests().get('js/lock.js'));
});

test('the command prints a census and rejects a bad argument', () => {
    const census = spawnSync(process.execPath,
        [SCRIPT_PATH, '--range', `${newestJsCommit()}~1..HEAD`,
            '--enumerate-only'],
        { encoding: 'utf8' });

    assert.equal(census.status, 0);
    assert.match(census.stdout, /\d+ file\(s\), \d+ line\(s\) in scope/u);
    assert.match(census.stdout, /sites per line in scope/u);

    const byPath = spawnSync(process.execPath,
        [SCRIPT_PATH, '--file', 'js/lock.js', '--enumerate-only'],
        { encoding: 'utf8' });

    assert.equal(byPath.status, 0);
    assert.match(byPath.stdout, /^js\/lock\.js: \d+ line\(s\) in scope/mu);

    // An unusable invocation exits 2 and names the problem. A survivor is a
    // finding to review, so a completed run exits 0 whatever it found; only an
    // error reaches this arm.
    const rejected = spawnSync(process.execPath, [SCRIPT_PATH, 'HEAD'],
        { encoding: 'utf8' });

    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /unexpected argument 'HEAD'/u);
});
