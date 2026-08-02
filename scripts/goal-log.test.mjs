import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { deliveredSince, readGoals, validateGoals } from './goal-log.mjs';

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
