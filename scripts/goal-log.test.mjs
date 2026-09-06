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
    SPAN_LINE_CAP, assertStandingIsCurrent, deliveredSince, formatGoal,
    formatRoadmap, nextSpan, readGoals, roadmapRows, selectFunctionRange,
    spanContext, validateGoals,
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
                { name: 'optfn_align', line: 10, endLine: 30, ported: true },
                { name: 'optfn_boulder', line: 31, endLine: 60, ported: false },
            ],
            startFunction: null,
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

test('formatGoal states the kind, the ported count, and the spans', () => {
    const filePort = structuredClone(store.goals[1]);
    filePort.startFunction = 'optfn_boulder';
    filePort.spans = [{ name: 'optfn_boulder', status: 'queued', closedBy: null,
        functions: ['optfn_boulder'] }];
    filePort.detail = 'line one\nline two';
    const brief = formatGoal(filePort);
    assert.ok(brief.includes('QUEUED options-c: Port options.c'));
    assert.ok(brief.includes('file port of options.c: 1 of 2 functions ported, '
        + 'first span starts at optfn_boulder'));
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

test('nextSpan takes contiguous unported functions up to the line cap', () => {
    // Six functions of 100 lines each; b and e are ported. With a 250-line
    // cap a span holds at most two of them.
    const functions = ['a', 'b', 'c', 'd', 'e', 'f'].map((name, index) => ({
        name,
        line: index * 100 + 1,
        endLine: index * 100 + 100,
        ported: name === 'b' || name === 'e',
    }));
    const cap = 250;

    // No start function: the first unported function, alone because b is
    // ported and breaks the run.
    assert.deepEqual(nextSpan(functions, [], null, cap),
        { functions: ['a'], lineRange: '1-100', cLines: 100 });

    // The divergence queue named d: the run starts there and stops at e.
    assert.deepEqual(nextSpan(functions, [], 'd', cap),
        { functions: ['d'], lineRange: '301-400', cLines: 100 });

    // After d closes, the next unported function after it is f.
    const afterD = [{ functions: ['d'], status: 'closed' }];
    assert.deepEqual(nextSpan(functions, afterD, 'd', cap).functions, ['f']);

    // After f closes the search wraps to the top of the file.
    const afterF = [...afterD, { functions: ['f'], status: 'closed' }];
    assert.deepEqual(nextSpan(functions, afterF, 'd', cap).functions, ['a']);

    // The cap splits a long run: c and d fit in 250 lines, a third would not.
    const longRun = functions.map((entry) => ({ ...entry, ported: entry.name === 'a' }));
    assert.deepEqual(nextSpan(longRun, [], null, cap),
        { functions: ['b', 'c'], lineRange: '101-300', cLines: 200 });

    // A single function larger than the cap still forms a span.
    const huge = [{ name: 'x', line: 1, endLine: 1000, ported: false }];
    assert.deepEqual(nextSpan(huge, [], null, cap).functions, ['x']);

    // Nothing left: the goal closes.
    const done = functions.map((entry) => ({ ...entry, ported: true }));
    assert.equal(nextSpan(done, [], null, cap), null);

    // The default cap is the documented starting value.
    assert.equal(SPAN_LINE_CAP, 400);
});

test('spanContext hands the worker the range, size, and JavaScript file', () => {
    const goal = structuredClone(store.goals[1]);
    goal.sessions = ['seed0108-wizard-extcmd-wishlist'];
    const context = spanContext(goal, { functions: ['optfn_align', 'optfn_boulder'] });
    assert.deepEqual(context, {
        goal: 'options-c',
        cFile: 'options.c',
        functions: ['optfn_align', 'optfn_boulder'],
        lineRange: '10-60',
        cLines: 51,
        jsFile: 'js/options.js',
        sessions: ['seed0108-wizard-extcmd-wishlist'],
    });
});

test('the roadmap orders files by unported functions and names their goal', () => {
    const files = [
        { name: 'small.c', text: 'void\nonly(void)\n{\n}\n' },
        { name: 'big.c', text: 'void\none(void)\n{\n}\nvoid\ntwo(void)\n{\n}\n' },
    ];
    const rows = roadmapRows(files, new Set(['only', 'one']), [
        { id: 'big-c', kind: 'file-port', status: 'open', cFile: 'big.c' },
    ]);
    assert.deepEqual(rows, [
        { cFile: 'big.c', total: 2, ported: 1, unported: 1, goal: 'big-c (open)' },
        { cFile: 'small.c', total: 1, ported: 1, unported: 0, goal: '' },
    ]);
    const markdown = formatRoadmap(rows, 'f'.repeat(40));
    assert.ok(markdown.startsWith('# Roadmap\n'));
    assert.ok(markdown.includes('Ported functions: 2 of 3.'));
    assert.ok(markdown.includes('| big.c | 2 | 1 | 1 | big-c (open) |'));
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

test('closing refuses a standing that predates the repository head', () => {
    // The chat-command close: SCORE.tsv still held the previous goal's row, so
    // the standing subtracted from itself and recorded delivered: 0 for a goal
    // that delivered 21 screens and 31 rng values.
    const head = 'afd1984c0ffee0000000000000000000000000d';
    assert.throws(
        () => assertStandingIsCurrent(
            { sha: '3a78bc1', screens: 1203, rng: 117774 }, head),
        /standing in SCORE.tsv is at 3a78bc1, not the repository head afd1984/u,
    );
    // A SCORE.tsv sha is the short form and the repository head is the full
    // one, so a current standing matches by prefix rather than by equality.
    assert.doesNotThrow(() => assertStandingIsCurrent(
        { sha: 'afd1984', screens: 1228, rng: 117887 }, head));
    // An empty log states no development figure at all, which is the same
    // ordering mistake at its limit; close-goal would record delivered: null.
    assert.throws(
        () => assertStandingIsCurrent(null, head),
        /SCORE.tsv states no development figure/u,
    );
    // Both refusals name the row to append and where the rule lives, because
    // the fix is to append that row and rerun, not to edit GOALS.json.
    assert.throws(
        () => assertStandingIsCurrent(null, head),
        /Append the goal row for afd1984 .*\.agents\/scoring\.md/su,
    );
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
function closeGoalFixture(standingSha) {
    const root = mkdtempSync(join(tmpdir(), 'goal-log-close-'));
    mkdirSync(join(root, 'scripts'));
    for (const name of ['goal-log.mjs', 'score-log.mjs', 'c-functions.mjs']) {
        copyFileSync(join(SCRIPT_DIR, name), join(root, 'scripts', name));
    }
    const git = (...args) => spawnSync('git', args, { cwd: root });
    git('init', '--quiet', '-b', 'main');
    git('-c', 'user.email=test@example.invalid', '-c', 'user.name=Test',
        '-c', 'commit.gpgsign=false',
        'commit', '--allow-empty', '--quiet', '-m', 'root');
    const head = spawnSync('git', ['rev-parse', 'HEAD'],
        { cwd: root, encoding: 'utf8' }).stdout.trim();
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

test('close-goal refuses to record a goal against a stale standing', () => {
    // The unit test above proves the check; this proves close-goal calls it.
    // Deleting the call leaves every other test in this file passing.
    const stale = closeGoalFixture(() => '3a78bc1');
    const refused = runCloseGoal(stale.root);

    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /standing in SCORE.tsv is at 3a78bc1/u);
    // The goal stays open, so appending the row and rerunning is the whole fix.
    assert.equal(refused.goal.status, 'open');
    assert.equal(refused.goal.delivered, null);

    const current = closeGoalFixture((head) => head.slice(0, 7));
    const closed = runCloseGoal(current.root);

    assert.equal(closed.status, 0, closed.stderr);
    assert.equal(closed.goal.status, 'closed');
    assert.equal(closed.goal.closedAt, current.head);
    // 1,228 - 1,207 screens and 117,887 - 117,856 rng values.
    assert.deepEqual(closed.goal.delivered, { screens: 21, rng: 31 });
});
