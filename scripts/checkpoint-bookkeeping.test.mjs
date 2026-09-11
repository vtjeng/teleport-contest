// Validate the actual metadata on both a full run and a bookkeeping-only run.
// The CLI unit tests use disposable fixtures and cannot catch malformed ledgers
// in the commit being assessed.
import test from 'node:test';
import { readGoals } from './goal-log.mjs';
import { readRows } from './score-log.mjs';

test('the checked-in goal and score ledgers parse and validate', () => {
    readGoals();
    readRows();
});
