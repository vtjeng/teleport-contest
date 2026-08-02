import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    calibrationLines, deliveredSince, formatGoal, readGoals, validateGoals,
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
