// display.c newsym() (928-936) reports a column-0 square through
// impossible() and draws nothing; a coordinate outside the map array reaches
// panic() instead. dog.c mon_arrive() reaches the report when mon.c
// restore_cham() reverts a shapeshifter that is not yet placed
// (recipes/display.c/newsym-column-zero-arriving-vampshifter-*).
//
// vision.c vision_recalc() (821-836) is the one C caller that avoids the
// report: its not_in_sight arm skips column 0. The port reaches that arm
// from two places, because C's `goto not_in_sight` is written out.
//
// The other arms of that loop call newsym() for any square in sight, so
// they rely on column 0 never being put in sight. Each C loop that sets
// IN_SIGHT starts at column 1 or later; night vision does at vision.c:686
// (`start = max(1, u.ux - ranges[dy])`). The port's night-vision loop began
// at the row's leftmost could-see column, which is 0 for a hero in column 1
// (recordings/explode.c/scatter-kicked-gold-off-map-edge and seven others).

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

test('night vision starts at column 1', () => {
    const text = readFileSync(new URL('../js/vision.js', import.meta.url),
        'utf8');
    // One: the night-vision loop in recalc_steps(), vision.c:686.
    assert.equal(
        text.match(/const start = Math\.max\(1, next_rmin\[row\]\);/gu)
            ?.length, 1,
    );
});

test('vision_recalc() redraws the hero unless the game is panicking', () => {
    const text = readFileSync(new URL('../js/vision.js', import.meta.url),
        'utf8');
    // vision.c:849-850 `if (!program_state.panicking) newsym(u.ux, u.uy)`
    // has no column test. Two: the Blind arm's written-out `goto skip` and
    // the end of the update loop.
    assert.equal(
        text.match(/if \(!state\.program_state\?\.panicking\) yield\* draw\(ux, uy\);/gu)
            ?.length, 2,
    );
    assert.equal(text.match(/ux > 0\) yield\* draw/gu), null);
});
