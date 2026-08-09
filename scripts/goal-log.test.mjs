import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync }
    from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { COLUMNS } from './score-log.mjs';

import {
    assertStandingIsCurrent, buildForecast, calibrationLines, deliveredSince,
    formatGoal, readGoals, restateForecast, validateGoals,
} from './goal-log.mjs';

const dir = mkdtempSync(join(tmpdir(), 'goal-log-'));

// A minimal valid store: one closed goal with a closed slice and one queued
// goal, the two shapes the migration produced on 2026-08-01.
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
            id: 'object-pile-window',
            status: 'queued',
            boundary: 'look_here() opens the Things-that-are-here window',
            slices: [],
        },
    ],
};

test('the goal store validates statuses, ids, and the single open goal', () => {
    assert.doesNotThrow(() => validateGoals(store));
    const path = join(dir, 'goals.json');
    writeFileSync(path, JSON.stringify(store));
    assert.equal(readGoals(path).goals.length, 2);

    const duplicate = structuredClone(store);
    duplicate.goals[1].id = 'pet-inventory';
    assert.throws(() => validateGoals(duplicate), /duplicate goal id/u);

    const badStatus = structuredClone(store);
    badStatus.goals[0].status = 'finished';
    assert.throws(() => validateGoals(badStatus), /unknown status/u);

    // Two open goals cannot coexist: the loop runs one goal at a time and
    // close-goal's delivered figures assume one open standing.
    const twoOpen = structuredClone(store);
    twoOpen.goals[0].status = 'open';
    twoOpen.goals[1].status = 'open';
    assert.throws(() => validateGoals(twoOpen), /only one goal may be open/u);

    const badSlice = structuredClone(store);
    badSlice.goals[0].slices[0].status = 'done';
    assert.throws(() => validateGoals(badSlice), /unknown status done/u);
});

test('--detail adds the owners and traced findings the default omits', () => {
    // The queued-goal shape queue-goal writes: the two detail lines stand in
    // for the multi-line markdown recorded in the real entry's detail field,
    // and the owner mirrors GOALS.json's upstreamOwners strings.
    const goal = {
        id: 'object-pile-window',
        status: 'queued',
        boundary: 'look_here() opens the Things-that-are-here window',
        upstreamOwners: ['invent.c look_here'],
        forecast: {
            steps: 1,
            basis: 'fresh capped look-ahead',
            sessions: ['seed0004-feeding-pony'],
            witnesses: [{
                session: 'seed0004-feeding-pony',
                evidence: 'pickup.c pickup(1), automatic pickup path',
            }],
        },
        detail: 'line one\nline two',
        slices: [{ name: 'first', status: 'queued', closedBy: null }],
    };
    // The default stays terse because --current opens every task; detail
    // must not leak into it.
    const brief = formatGoal(goal);
    assert.ok(!brief.includes('line one'));
    assert.ok(!brief.includes('owners:'));
    // --detail prints the owners line and the detail block, each detail line
    // indented four spaces under its label.
    const full = formatGoal(goal, { detail: true });
    assert.ok(full.includes('owners: invent.c look_here'));
    assert.ok(full.includes('witness seed0004-feeding-pony: pickup.c pickup(1)'));
    assert.ok(full.includes('  detail:\n    line one\n    line two'));
});

test('calibration pairs GOALS.json ratios with SCORE.tsv goal rows', () => {
    // The trap goal's real calibration figures from docs/goal-history.md:
    // forecast 46, delivered 8, so the ratio prints 0.17 and sits above the
    // one-tenth retirement line in .agents/selection.md.
    const store = {
        goals: [{
            id: 'trap',
            status: 'closed',
            boundary: 'walking onto a trap triggers it',
            forecast: { steps: 46, basis: 'unlocks', sessions: [] },
            delivered: { screens: 8, rng: 100 },
            slices: [],
        }],
    };
    // One full goal row and one with blank screen cells, the shape of the
    // hand-appended 2026-07-22 rows; the blank cells must render as `-`
    // rather than dropping the row. A row of another event must not appear.
    const rows = [
        { utc: '2026-07-22T01:00:00Z', sha: 'b'.repeat(40), event: 'goal',
            screens_matched: '', screens_total: '',
            holdout_screens_matched: '', holdout_screens_total: '', note: 'early' },
        { utc: '2026-08-01T01:00:00Z', sha: 'c'.repeat(40), event: 'goal',
            screens_matched: '520', screens_total: '7765',
            holdout_screens_matched: '139', holdout_screens_total: '3640',
            note: 'pet-inventory' },
        { utc: '2026-08-01T02:00:00Z', sha: 'd'.repeat(40), event: 'slice',
            screens_matched: '520', screens_total: '7765',
            holdout_screens_matched: '', holdout_screens_total: '', note: '' },
    ];
    const lines = calibrationLines(store, rows);
    assert.ok(lines.some((line) => line.includes(
        'trap: delivered 8 screens, forecast 46 steps (0.17 of forecast)')));
    assert.ok(lines.some((line) => line.includes('screens -/-')));
    assert.ok(lines.some((line) => line.includes('screens 520/7765')
        && line.includes('holdout 139/3640')));
    assert.equal(lines.filter((line) => line.startsWith('  20')).length, 2);
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
 * A throwaway repository holding the two scripts, one open goal, and a
 * SCORE.tsv whose development row names `standingSha(head)`.
 *
 * `close-goal` resolves both files from its own location and reads the head
 * from the working directory, so a copy of the scripts in a temporary
 * repository exercises the real command without touching this one.
 */
function closeGoalFixture(standingSha) {
    const root = mkdtempSync(join(tmpdir(), 'goal-log-close-'));
    mkdirSync(join(root, 'scripts'));
    for (const name of ['goal-log.mjs', 'score-log.mjs']) {
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
            status: 'open',
            boundary: 'a demonstration goal',
            slices: [],
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

test('a nonzero forecast requires one C-path witness per named session', () => {
    const forecast = buildForecast({
        'forecast-steps': '61',
        'forecast-basis': 'capped look-ahead at the current commit',
        sessions: 'seed0004-feeding-pony,seed0030-ten-diverse-deaths',
        'forecast-witness': [
            // Each value names the session before `=` and records the exact C
            // branch after it. Two sessions exercise the one-to-one check.
            'seed0004-feeding-pony=pickup.c pickup(1), flags.pickup is true',
            'seed0030-ten-diverse-deaths=pickup.c check_here(FALSE)',
        ],
    });
    assert.deepEqual(forecast.witnesses, [
        {
            session: 'seed0004-feeding-pony',
            evidence: 'pickup.c pickup(1), flags.pickup is true',
        },
        {
            session: 'seed0030-ten-diverse-deaths',
            evidence: 'pickup.c check_here(FALSE)',
        },
    ]);

    assert.throws(() => buildForecast({
        'forecast-steps': '61',
        'forecast-basis': 'capped look-ahead',
        sessions: 'seed0004-feeding-pony',
    }), /missing C-path witness.*seed0004-feeding-pony/u);
    assert.throws(() => buildForecast({
        'forecast-steps': '61',
        'forecast-basis': 'capped look-ahead',
        sessions: 'seed0004-feeding-pony',
        'forecast-witness': [
            'some-other-session=pickup.c check_here(FALSE)',
        ],
    }), /witness names a session outside the forecast/u);
});

test('a queued forecast can be restated but an open one is immutable', () => {
    const queued = structuredClone(store);
    const forecast = {
        steps: 1,
        basis: 'fresh capped look-ahead',
        sessions: ['seed0004-feeding-pony'],
        witnesses: [{
            session: 'seed0004-feeding-pony',
            evidence: 'pickup.c pickup(1), automatic pickup path',
        }],
    };
    const updated = restateForecast(queued, 'object-pile-window', forecast);
    assert.equal(updated.forecast, forecast);

    const opened = structuredClone(store);
    opened.goals[1].status = 'open';
    assert.throws(
        () => restateForecast(opened, 'object-pile-window', forecast),
        /is open, not queued/u,
    );
});
