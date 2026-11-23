// display.c newsym() (928-936) reports a column-0 square through
// impossible() and draws nothing; a coordinate outside the map array reaches
// panic() instead. dog.c mon_arrive() reaches the report when mon.c
// restore_cham() reverts a shapeshifter that is not yet placed
// (recipes/display.c/newsym-column-zero-arriving-vampshifter-*).
//
// vision.c vision_recalc() (821-836) is the one C caller that avoids the
// report: its not_in_sight arm skips column 0. The port reaches that arm
// from two places, because C's `goto not_in_sight` is written out.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { newsymReportsOffMap, newsym_steps } from '../js/display.js';
import { ImpossibleCall } from '../js/source_steps.js';

test('newsym_steps() reports column 0 and draws nothing', () => {
    // <0,0> is where an unplaced monster's mx and my point; <0,7> is another
    // row of the same column.
    for (const [x, y] of [[0, 0], [0, 7]]) {
        const steps = newsym_steps(x, y);
        const first = steps.next();
        assert.ok(first.value instanceof ImpossibleCall);
        assert.equal(first.value.text,
            `newsym: attempting screen update for <${x},${y}>`);
        // C returns straight after the report.
        assert.equal(steps.next().done, true);
    }
});

test('newsymReportsOffMap() takes column 0 inside the map array only', () => {
    // display.c:932: x < 0, y < 0, x > COLNO - 1 (79) and y > ROWNO - 1 (20)
    // panic; the rest of !isok() is column 0, rows 0..20.
    assert.equal(newsymReportsOffMap(0, 0), true);
    assert.equal(newsymReportsOffMap(0, 20), true);
    assert.equal(newsymReportsOffMap(0, 21), false);
    assert.equal(newsymReportsOffMap(-1, 0), false);
    assert.equal(newsymReportsOffMap(80, 5), false);
    // An ordinary map square is not reported.
    assert.equal(newsymReportsOffMap(1, 0), false);
});

test('vision_recalc() skips column 0 in both not-in-sight arms', () => {
    const text = readFileSync(new URL('../js/vision.js', import.meta.url),
        'utf8');
    // Two: the written-out `goto not_in_sight` at vision.c:784 and the
    // final else arm at vision.c:821.
    assert.equal(
        text.match(/if \(col !== 0\) yield\* draw\(col, row\);/gu)?.length, 2,
    );
});
