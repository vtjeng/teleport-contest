import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync }
    from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { COLUMNS } from './score-log.mjs';
import { cFunctions, parseCFunctions } from './c-functions.mjs';

import {
    SPAN_LINE_CAP, checkpointClosingStanding, deliveredSince, formatGoal,
    formatRoadmap, lineRanges, nextSpan, readGoals, roadmapRows,
    selectFunctionRange, spanContext, validateGoals, refreshCompletion,
    assertPortComplete, recordEvidence, luaRoadmapRows,
} from './goal-log.mjs';

const dir = mkdtempSync(join(tmpdir(), 'goal-log-'));

// Two file-port functions and one divergence fix, plus one legacy goal in the
// shape GOALS.json held before 2026-09-05 (boundary and slices, no kind).
const store = {
    goals: [
        {
            id: 'pet-inventory',
            status: 'closed',
            boundary: 'a tame starting pet picks up and drops what it carries',
            slices: [
                { name: 'relobj drop', status: 'closed', closedBy: 'a'.repeat(40) },
            ],
        },
        {
            id: 'options-c',
            kind: 'file-port',
            status: 'queued',
            summary: 'Port options.c',
            cFile: 'options.c',
            // Line numbers are fixture values: two short functions.
            functions: [
                { name: 'optfn_align', line: 10, endLine: 30, declared: true, complete: false },
                { name: 'optfn_boulder', line: 31, endLine: 60, declared: false, complete: false },
            ],
            sessions: [],
            spans: [],
        },
        {
            id: 'fix-dog-move-seed0014',
            kind: 'divergence-fix',
            status: 'queued',
            summary: 'dog_move() draws rn2(12) where C draws rn2(1)',
            cFile: 'dogmove.c',
            function: 'dog_move',
            session: 'seed0014-dequa-fountain-explore',
            step: 418,
            sessions: ['seed0014-dequa-fountain-explore'],
            spans: [],
        },
    ],
};

test('the goal store validates both goal kinds and the legacy shape', () => {
    assert.doesNotThrow(() => validateGoals(store));
    const path = join(dir, 'goals.json');
    writeFileSync(path, JSON.stringify(store));
    assert.equal(readGoals(path).goals.length, 3);

    const duplicate = structuredClone(store);
    duplicate.goals[1].id = 'pet-inventory';
    assert.throws(() => validateGoals(duplicate), /duplicate goal id/u);

    const badStatus = structuredClone(store);
    badStatus.goals[0].status = 'finished';
    assert.throws(() => validateGoals(badStatus), /unknown status/u);

    const badKind = structuredClone(store);
    badKind.goals[1].kind = 'boundary';
    assert.throws(() => validateGoals(badKind), /unknown kind boundary/u);

    // A file port without its function list cannot plan a span.
    const noFunctions = structuredClone(store);
    delete noFunctions.goals[1].functions;
    assert.throws(() => validateGoals(noFunctions), /needs a functions array/u);

    // A divergence fix names the function and session it fixes.
    const noSession = structuredClone(store);
    delete noSession.goals[2].session;
    assert.throws(() => validateGoals(noSession), /needs the function and session/u);

    // A goal needs its one-line description under either field name.
    const noSummary = structuredClone(store);
    delete noSummary.goals[1].summary;
    assert.throws(() => validateGoals(noSummary), /needs a summary/u);

    // Two open goals cannot coexist: the loop runs one goal at a time and
    // close-goal's delivered figures assume one open standing.
    const twoOpen = structuredClone(store);
    twoOpen.goals[1].status = 'open';
    twoOpen.goals[2].status = 'open';
    assert.throws(() => validateGoals(twoOpen), /only one goal may be open/u);

    const badSpan = structuredClone(store);
    badSpan.goals[0].slices[0].status = 'done';
    assert.throws(() => validateGoals(badSpan), /unknown status done/u);
});

test('formatGoal states the kind, declarations and verified count, and the spans', () => {
    const filePort = structuredClone(store.goals[1]);
    filePort.spans = [{ name: 'optfn_boulder', status: 'queued', closedBy: null,
        functions: ['optfn_boulder'] }];
    filePort.detail = 'line one\nline two';
    const brief = formatGoal(filePort);
    assert.ok(brief.includes('QUEUED options-c: Port options.c'));
    assert.ok(brief.includes('file-port of options.c: 0 of 2 source units verified; 1 declarations found'));
    assert.ok(brief.includes('[queued] optfn_boulder'));
    // The default stays terse because --current opens every task; detail
    // must not leak into it.
    assert.ok(!brief.includes('line one'));
    const full = formatGoal(filePort, { detail: true });
    assert.ok(full.includes('  detail:\n    line one\n    line two'));

    const fix = formatGoal(store.goals[2]);
    assert.ok(fix.includes('divergence fix in dogmove.c dog_move() for '
        + 'seed0014-dequa-fountain-explore at step 418'));

    // A legacy goal prints its boundary and slices under the same layout.
    const legacy = formatGoal(store.goals[0]);
    assert.ok(legacy.includes('CLOSED pet-inventory: a tame starting pet'));
    assert.ok(legacy.includes('[closed] relobj drop (aaaaaaaa)'));
});

test('parseCFunctions reads column-0 definitions and their extents', () => {
    // NetHack style: return type on its own line, name at column 0. The
    // prototype and the indented call must not count as definitions.
    const text = [
        'staticfn void helper(int);', // 1
        '',                           // 2
        'void',                       // 3
        'first(int a)',               // 4
        '{',                          // 5
        '    helper(a);',             // 6
        '}',                          // 7
        '',                           // 8
        'int',                        // 9
        'second(void)',               // 10
        '{',                          // 11
        '    return 0;',              // 12
        '}',                          // 13
    ].join('\n');
    assert.deepEqual(parseCFunctions(text), [
        { name: 'first', line: 4, endLine: 9 },
        { name: 'second', line: 10, endLine: 13 },
    ]);
});

test('source inventory excludes macro invocations and commented declarations', () => {
    // sfbase.c uses this macro form to generate serializers. It is not a
    // source function named SF_X and must not prompt a fake JavaScript port.
    const source = 'SF_X(uint8_t, bitfield)\n'
        + '/*\ncommented(void)\n{ }\n*/\n'
        + 'int\nreal(\n    int value\n)\n{ return value; }\n';
    assert.deepEqual(parseCFunctions(source).map((entry) => entry.name), ['real']);
});

test('source inventory retains old-style and conditional function signatures', () => {
    // region.c and tty/wintty.c still contain these source forms. The two
    // conditional signatures own one body, so they form one source unit.
    const source = 'void\nold(mon)\nstruct monst *mon;\n{ }\n'
        + 'int\n#ifdef FEATURE\nconditional(int x)\n#else\n'
        + 'conditional(int x UNUSED)\n#endif\n{ return x; }\n';
    assert.deepEqual(parseCFunctions(source).map((entry) => entry.name), ['old', 'conditional']);
});

test('historical name matches remain in the next span until verified', () => {
    // A pre-methodology partial implementation had ported:true, but no source
    // review, caller or replay evidence. Its name must not hide it again.
    const goal = { kind: 'file-port', cFile: 'partial.c', functions: [
        { name: 'partial', line: 1, endLine: 10, ported: true },
    ] };
    refreshCompletion(goal, new Set(['partial']));
    assert.equal(goal.functions[0].declared, true);
    assert.equal(goal.functions[0].complete, false);
    assert.deepEqual(nextSpan(goal.functions, []).functions, ['partial']);
    assert.throws(() => assertPortComplete(goal), /unverified source units: partial/u);
});

test('completion evidence is scoped by source and survives later span evidence', () => {
    // Two short pure helpers exercise merging evidence from separate spans.
    // These references are structural fixtures; disk validation has its own
    // integration tests in port-evidence.test.mjs.
    const evidenceFor = (name) => ({ name, symbol: name,
        implementation: 'js/helpers.js', sourceReview: 'Whole source reviewed.',
        callers: [{ path: 'js/caller.js', symbol: 'caller', source: 'helpers.c caller' }],
        pure: true, tests: ['scripts/helpers.test.mjs'], recordings: [] });
    const goal = { kind: 'file-port', cFile: 'helpers.c', functions: [
        { name: 'first', line: 1, endLine: 10 },
        { name: 'second', line: 11, endLine: 20 },
    ], spans: [] };
    const head = 'a'.repeat(40); // Fixed commit-shaped evidence identity.
    recordEvidence(goal, { functions: [evidenceFor('first')] }, head);
    recordEvidence(goal, { functions: [evidenceFor('second')],
        entryPointReview: 'Helper-only range; tested through its callers.', entryPoints: [] }, head);
    refreshCompletion(goal, new Set(['first', 'second']));
    assert.equal(nextSpan(goal.functions, []), null);
    assert.doesNotThrow(() => assertPortComplete(goal));
    assert.equal(goal.evidence.functions[0].checkedAt, head);

    const unrelated = { kind: 'file-port', cFile: 'unrelated.c', functions: goal.functions };
    refreshCompletion(unrelated, new Set(['first', 'second']), [goal]);
    assert.equal(unrelated.functions[0].complete, false);

    goal.evidence.entryPoints = [{ name: 'command', functions: ['first'], recordings: [] }];
    assert.throws(() => assertPortComplete(goal), /entry point command has no matching recording/u);
});

test('Lua source programs remain visible without loader or completion evidence', () => {
    // A library and a level both need source evidence; C names cannot certify
    // either, and top-level Lua statements form one indivisible source unit.
    const rows = luaRoadmapRows([{ name: 'nhlib.lua' }, { name: 'map.lua' }], []);
    assert.deepEqual(rows, [
        { luaFile: 'nhlib.lua', complete: false },
        { luaFile: 'map.lua', complete: false },
    ]);
    const luaGoal = { kind: 'lua-port', luaFile: 'map.lua', functions: [
        { name: 'map.lua', line: 1, endLine: 900 },
    ] };
    const span = nextSpan(luaGoal.functions, []);
    assert.deepEqual(span.functions, ['map.lua']);
    assert.equal(spanContext(luaGoal, span).luaFile, 'map.lua');
});

test('the real options.c defines more than 200 functions', () => {
    // Source-pinned: options.c is the largest C file, and this pins the reader
    // to the checked-out tree rather than to a fixture.
    const functions = cFunctions('options.c');
    assert.ok(functions.length > 200, `found ${functions.length}`);
    assert.ok(functions.some((entry) => entry.name === 'parseoptions'));
});

test('selectFunctionRange keeps the functions between two names, inclusive', () => {
    const functions = ['a', 'b', 'c', 'd'].map((name, index) => ({
        name, line: index * 10 + 1, endLine: index * 10 + 10,
    }));
    assert.deepEqual(
        selectFunctionRange(functions, 'b', 'c').map((entry) => entry.name),
        ['b', 'c'],
    );
    assert.equal(selectFunctionRange(functions).length, 4);
    assert.throws(() => selectFunctionRange(functions, 'c', 'b'),
        /b is defined before c/u);
    assert.throws(() => selectFunctionRange(functions, 'zz'),
        /no function named zz/u);
});

test('nextSpan collects unverified functions in C order up to the line cap', () => {
    // Six functions of 100 lines each; b and e are ported. With a 250-line
    // cap a span holds at most two of them.
    const functions = ['a', 'b', 'c', 'd', 'e', 'f'].map((name, index) => ({
        name,
        line: index * 100 + 1,
        endLine: index * 100 + 100,
        complete: name === 'b' || name === 'e',
    }));
    const cap = 250;

    // First span starts at the file's first unported function: a, then c
    // after passing over ported b; d would push the span past 250 lines.
    // a and c sit apart, so the span lists two ranges.
    assert.deepEqual(nextSpan(functions, [], cap),
        { functions: ['a', 'c'], lineRanges: ['1-100', '201-300'], cLines: 200 });

    // After a and c close, the next unported function is d; e is ported, so
    // the span takes d and f.
    const afterAC = [{ functions: ['a', 'c'], status: 'closed' }];
    assert.deepEqual(nextSpan(functions, afterAC, cap),
        { functions: ['d', 'f'], lineRanges: ['301-400', '501-600'], cLines: 200 });

    // After d closes, the next unported function after it is f.
    const afterD = [{ functions: ['d'], status: 'closed' }];
    assert.deepEqual(nextSpan(functions, afterD, cap).functions, ['f']);

    // After f closes the search wraps to the top: a and c are still unported
    // because the fixture never marks them.
    const afterF = [...afterD, { functions: ['f'], status: 'closed' }];
    assert.deepEqual(nextSpan(functions, afterF, cap).functions, ['a', 'c']);

    // The cap splits a long run: b and c fit in 250 lines, a third would not.
    // Adjacent functions merge into one range.
    const longRun = functions.map((entry) => ({ ...entry, complete: entry.name === 'a' }));
    assert.deepEqual(nextSpan(longRun, [], cap),
        { functions: ['b', 'c'], lineRanges: ['101-300'], cLines: 200 });

    // A single function larger than the cap still forms a span.
    const huge = [{ name: 'x', line: 1, endLine: 1000, complete: false }];
    assert.deepEqual(nextSpan(huge, [], cap).functions, ['x']);

    // Nothing left: the goal closes.
    const done = functions.map((entry) => ({ ...entry, complete: true }));
    assert.equal(nextSpan(done, [], cap), null);

    // The default cap is the value the comment above it calibrates.
    assert.equal(SPAN_LINE_CAP, 800);
});

test('lineRanges merges touching functions and keeps separate stretches apart', () => {
    // 1-10 and 11-20 touch, so they merge; 30-40 stands apart. Sorting by
    // line makes the order of the input irrelevant.
    assert.deepEqual(lineRanges([
        { line: 30, endLine: 40 },
        { line: 1, endLine: 10 },
        { line: 11, endLine: 20 },
    ]), ['1-20', '30-40']);
    assert.deepEqual(lineRanges([]), []);
});

test('spanContext hands the worker the ranges, size, and JavaScript file', () => {
    const goal = structuredClone(store.goals[1]);
    goal.sessions = ['seed0108-wizard-extcmd-wishlist'];
    // The fixture's two functions are adjacent (10-30 and 31-60), so they
    // form one range of 51 lines.
    const context = spanContext(goal, { functions: ['optfn_align', 'optfn_boulder'] });
    assert.deepEqual(context, {
        goal: 'options-c',
        kind: 'file-port',
        sourceFile: 'options.c',
        cFile: 'options.c',
        functions: ['optfn_align', 'optfn_boulder'],
        lineRanges: ['10-60'],
        cLines: 51,
        jsFile: 'js/options.js',
        sessions: ['seed0108-wizard-extcmd-wishlist'],
        evidenceRequired: 'whole source, production callers, tests for pure '
            + 'functions, matching recordings for impure functions and entry points',
    });

    // A span that passed over a ported function lists one range per
    // stretch: 21 lines at 10-30 and 21 lines at 100-120.
    goal.functions.push({ name: 'optfn_color', line: 100, endLine: 120, ported: false });
    const apart = spanContext(goal, { functions: ['optfn_align', 'optfn_color'] });
    assert.deepEqual(apart.lineRanges, ['10-30', '100-120']);
    assert.equal(apart.cLines, 42);
});

test('the roadmap separates declarations from unverified functions and names their goal', () => {
    const files = [
        { name: 'small.c', text: 'void\nonly(void)\n{\n}\n' },
        { name: 'big.c', text: 'void\none(void)\n{\n}\nvoid\ntwo(void)\n{\n}\n' },
    ];
    const rows = roadmapRows(files, new Set(['only', 'one']), [
        { id: 'big-c', kind: 'file-port', status: 'open', cFile: 'big.c' },
    ]);
    assert.deepEqual(rows, [
        { cFile: 'big.c', total: 2, declared: 1, complete: 0, pending: 2, goal: 'big-c (open)' },
        { cFile: 'small.c', total: 1, declared: 1, complete: 0, pending: 1, goal: '' },
    ]);
    const markdown = formatRoadmap(rows, 'f'.repeat(40));
    assert.ok(markdown.startsWith('Verified C functions: 0 of 3, at ffffffff.\n'));
    assert.ok(markdown.includes('| big.c | 2 | 1 | 0 | 2 | big-c (open) |'));
});

test('delivered figures are the closing standing minus the opening one', () => {
    // The pet goal's real figures: development stood at 496 screens and
    // 106,505 rng values when it opened and 520 and 107,227 when it closed,
    // so it delivered 24 screens and 722 values.
    assert.deepEqual(
        deliveredSince(
            { screens: 496, rng: 106505 },
            { screens: 520, rng: 107227 },
        ),
        { screens: 24, rng: 722 },
    );
    // A goal opened before SCORE.tsv existed has no opening standing, and a
    // null result says "not measured" rather than claiming zero.
    assert.equal(deliveredSince(null, { screens: 520, rng: 107227 }), null);
});

test('closing takes current checkpoint figures without relabeling the measurement', () => {
    const head = 'a'.repeat(40); // New metadata commit.
    const measured = 'b'.repeat(40); // Earlier execution commit.
    const summary = { commit: head, executionCommit: measured, allPassed: true,
        recordings: { passed: true }, score: { screensMatched: 1228, rngMatched: 117887 } };
    // Historical chat-command totals distinguish a real gain from a stale row.
    assert.deepEqual(checkpointClosingStanding(summary, head),
        { sha: measured, screens: 1228, rng: 117887 });
    for (const invalid of [null, { ...summary, commit: measured },
        { ...summary, allPassed: false }, { ...summary, recordings: { passed: false } }])
        assert.throws(() => checkpointClosingStanding(invalid, head), /passing npm run checkpoint/u);
    for (const invalid of [{ ...summary, score: null },
        { ...summary, executionCommit: undefined },
        ...[-1, NaN, 0.5, '1228'].map(screensMatched =>
            ({ ...summary, score: { ...summary.score, screensMatched } }))])
        assert.throws(() => checkpointClosingStanding(invalid, head), /development figures/u);
});

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function scoreRow(sha, screens, rng) {
    const cells = {
        utc: '2026-08-08T00:00:00.000Z',
        sha,
        event: 'goal',
        screens_matched: String(screens),
        screens_total: '7765',
        rng_matched: String(rng),
        rng_total: '610816',
    };
    return COLUMNS.map((column) => cells[column] ?? '').join('\t');
}

/**
 * A throwaway repository holding the scripts, one open divergence fix, and a
 * SCORE.tsv whose development row names `standingSha(head)`.
 *
 * `close-goal` resolves both files from its own location and reads the head
 * from the working directory, so a copy of the scripts in a temporary
 * repository exercises the real command without touching this one. The goal
 * is a divergence fix because closing a file port re-reads js/ and the C
 * tree, which the throwaway repository does not hold.
 */
function closeGoalFixture(standingSha, checkpoint = {}) {
    const root = mkdtempSync(join(tmpdir(), 'goal-log-close-'));
    mkdirSync(join(root, 'scripts'));
    for (const name of ['goal-log.mjs', 'score-log.mjs', 'c-functions.mjs',
        'lua-sources.mjs', 'port-evidence.mjs', 'check-namespace-members.mjs',
        'development-standing.mjs', 'scoring-workspace.mjs', 'fixed-workload.mjs',
        'local-tmpdir.mjs',
        'checkpoint-results.mjs']) {
        copyFileSync(join(SCRIPT_DIR, name), join(root, 'scripts', name));
    }
    const git = (...args) => spawnSync('git', args, { cwd: root });
    git('init', '--quiet', '-b', 'main');
    git('-c', 'user.email=test@example.invalid', '-c', 'user.name=Test',
        '-c', 'commit.gpgsign=false',
        'commit', '--allow-empty', '--quiet', '-m', 'root');
    const head = spawnSync('git', ['rev-parse', 'HEAD'],
        { cwd: root, encoding: 'utf8' }).stdout.trim();
    const resultDirectory = join(root, '.git/checkpoint-results', head);
    mkdirSync(resultDirectory, { recursive: true });
    writeFileSync(join(resultDirectory, 'latest.json'), JSON.stringify({
        commit: head, executionCommit: 'c'.repeat(40), allPassed: true,
        recordings: { passed: true }, score: { screensMatched: 1228, rngMatched: 117887 },
        ...checkpoint,
    }));
    writeFileSync(join(root, 'SCORE.tsv'),
        // The real chat-command figures: 1,207 screens and 117,856 rng values
        // at open, 1,228 and 117,887 at close, so it delivered 21 and 31.
        `${COLUMNS.join('\t')}\n${scoreRow(standingSha(head), 1228, 117887)}\n`);
    writeFileSync(join(root, 'GOALS.json'), `${JSON.stringify({
        goals: [{
            id: 'demo',
            kind: 'divergence-fix',
            status: 'open',
            summary: 'a demonstration fix',
            cFile: 'dogmove.c',
            function: 'dog_move',
            session: 'seed0014-dequa-fountain-explore',
            sessions: [],
            spans: [],
            openedAt: 'b'.repeat(40),
            openStanding: { sha: 'bbbbbbb', screens: 1207, rng: 117856 },
            closedAt: null,
            delivered: null,
        }],
    }, null, 2)}\n`);
    return { root, head };
}

function runCloseGoal(root) {
    const run = spawnSync(
        process.execPath,
        [join(root, 'scripts', 'goal-log.mjs'), 'close-goal', '--goal', 'demo'],
        { cwd: root, encoding: 'utf8' },
    );
    return {
        ...run,
        goal: JSON.parse(readFileSync(join(root, 'GOALS.json'), 'utf8'))
            .goals[0],
    };
}

test('close-goal requires a passing current checkpoint even when SCORE names HEAD', () => {
    // A current event row cannot stand in for failed validation.
    const stale = closeGoalFixture(head => head, { allPassed: false });
    const refused = runCloseGoal(stale.root);

    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /passing npm run checkpoint/u);
    assert.equal(refused.goal.status, 'open');
    assert.equal(refused.goal.delivered, null);

    // A stale event row must not override a validated current measurement.
    const current = closeGoalFixture(() => '3a78bc1');
    const closed = runCloseGoal(current.root);

    assert.equal(closed.status, 0, closed.stderr);
    assert.equal(closed.goal.status, 'closed');
    assert.equal(closed.goal.closedAt, current.head);
    // 1,228 - 1,207 screens and 117,887 - 117,856 rng values.
    assert.deepEqual(closed.goal.delivered, { screens: 21, rng: 31 });
    assert.equal(closed.goal.closeStanding.sha, 'c'.repeat(40));
});
