// Enforces the comparison scripts/column-zero-guard.mjs describes: a JS
// function tests a drawn square's column against zero or isok() as often as
// the C function of the same name. The first test scans the repository; the
// others pin what the scan counts on small hand-written sources.

import assert from 'node:assert/strict';
import test from 'node:test';

import { analyse, columns, guardTests } from './column-zero-guard.mjs';

// Functions whose counts differ, each compared with the C source by hand on
// 23 November 2026. None adds or drops a guard on a drawing call.
const REVIEWED = new Map([
    ['display.c newsym', 'C\'s !isok() report and its `x < 0` choice of panic() are '
        + 'newsymReportsOffMap() and newsymOffMapImpossible()'],
    ['dokick.c kick_ouch', 'the extra isok() chooses whether to read the map location; '
        + 'feel_location() sits under the same isok() as in C'],
    ['explode.c scatter', 'C\'s two isok(bhitpos) tests at 845 and 849 are one `!isok() || '
        + '!ZAP_POS()` condition'],
    ['hack.c domove_fight_empty', 'the extra isok() guards the remembered-glyph read that C '
        + 'makes after moving an off-map target to <0,1>'],
    ['region.c add_region', 'C\'s loop variables are i and j; the JS isok(x, y) is the same '
        + 'test'],
    ['teleport.c rloc_to_core', 'C\'s one `if (oldx)` block is two, because the departure '
        + 'message is awaited before the monster is removed'],
    ['vision.c vision_recalc', 'the loop is in recalc_steps(); '
        + 'scripts/newsym-column-zero.test.mjs pins its column tests'],
    ['worm.c toss_wsegs', 'C\'s `if (curr->wx)` is `if (!segment.x) continue`'],
    ['worm.c remove_worm', 'C\'s `if (curr->wx)` is `if (!segment.x) continue`'],
]);

// C functions that draw and have no JS function of the same name, so the
// scan compares nothing for them. Lower the count when one is ported under
// its C name.
const UNPORTED = 11;

test('each JS function tests a drawn column as often as its C function', () => {
    const result = analyse();
    console.log(JSON.stringify({
        cDraws: result.cDraws, functions: result.functions, same: result.same,
    }));
    // 585 drawing calls in 328 C functions when the scan was written. A
    // large drop means the function or call patterns stopped matching and
    // the scan would pass without comparing; 550 and 300 leave room for a
    // changed C revision.
    assert.ok(result.cDraws >= 550, `only ${result.cDraws} C drawing calls found`);
    assert.ok(result.functions >= 300, `only ${result.functions} C functions found`);
    assert.deepEqual([...result.differing.keys()].sort(), [...REVIEWED.keys()].sort(),
        'compare each new function with C, then fix it or add it to REVIEWED with the reason');
    assert.equal(result.unported.length, UNPORTED, result.unported.join(', '));
});

test('columns() takes the last member of each drawn column', () => {
    // A C call through a pointer, a JS call through an object, and a plain
    // variable; map_object() takes an object, not a square, and is not read.
    const body = 'newsym(mtmp->mx, mtmp->my); map_invisible(mon.mx, mon.my);'
        + ' show_glyph(x, y, g); map_object(obj, 1);';
    assert.deepEqual([...columns(body)].sort(), ['mx', 'x']);
    // The port's generator and cell spellings count as the same call.
    assert.deepEqual([...columns('yield* newsym_steps(ox, oy);')], ['ox']);
});

test('guardTests() counts comparisons with 0 or 1, truth tests and isok()', () => {
    const members = new Set(['mx']);
    // vault.c-style zero test, a truth test and an isok() call: one each.
    assert.equal(guardTests('if (mtmp->mx == 0) return;', members), 1);
    assert.equal(guardTests('if (mon.mx !== 0) draw();', members), 1);
    assert.equal(guardTests('if (grd->mx) {', members), 1);
    assert.equal(guardTests('if (a && !grd.mx) {', members), 1);
    assert.equal(guardTests('if (isok(mtmp->mx, mtmp->my))', members), 1);
    // A comparison with another value, or of another member, is not a guard.
    assert.equal(guardTests('if (mtmp->mx == u.ux || mtmp->my == 0)', members), 0);
});
