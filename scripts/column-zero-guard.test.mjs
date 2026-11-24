// Enforces the comparison scripts/column-zero-guard.mjs describes: a JS
// function tests a drawn square's column against zero or isok() as often as
// the C function of the same name. The first test scans the repository; the
// others pin what the scan counts on small hand-written sources.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    analyse, columns, drawCalls, guardTests, skipDeadConditionals,
} from './column-zero-guard.mjs';

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
// scan compares nothing for them. Each was compared by hand with the JS code
// that holds its drawing calls on 23 November 2026; none of those adds or
// drops a column test. Remove an entry when the function is ported under its
// C name. `node scripts/column-zero-guard.mjs --list` prints them.
const REVIEWED_UNPORTED = new Map([
    ['display.c under_ground', 'its callers test u.uburied, which only bury_you() in the '
        + 'same `#if 0` block sets, so no game reaches it and js/ has no counterpart'],
    ['display.c newsym_force', 'newsym() plus dirty bookkeeping; its six callers\' JS '
        + 'counterparts (see_nearby_objects(), pickup(), the two sit.c throne arms, '
        + 'zap.c bhito()\'s breaks() arm and getpos_sethilite()) call newsym() at the same '
        + 'square under the same tests'],
    ['engrave.c see_engraving', 'nothing in the C source calls it'],
    ['engrave.c feel_engraving', 'nothing in the C source calls it'],
    ['mail.c md_rush', 'js/ holds no mail daemon'],
    ['nhlobj.c l_obj_placeobj', 'js/nhlua.js tutorial_turn() places the food ration at '
        + 'the hero\'s square and calls newsym() there with no column test, as C does'],
    ['selvar.c selection_force_newsyms', 'C\'s loop starts at column 1; '
        + 'js/getpos.js getpos_getvalids_selection() also starts at 1, so the '
        + 'getpos_sethilite() loop never reaches column 0'],
    ['trap.c mkroll_launch', 'js/trap.js makeRollingBoulderLaunch() draws at the launch '
        + 'square with no column test, as C does; isclearpath()\'s isok() is in '
        + 'clearLaunchPath()'],
    ['vault.c gd_pick_corridor_gold', 'the gold arm of js/vault.js gd_move() makes the '
        + 'same draws with no column test, as C does'],
]);

test('each JS function tests a drawn column as often as its C function', () => {
    const result = analyse();
    console.log(JSON.stringify({
        cDraws: result.cDraws, functions: result.functions, same: result.same,
    }));
    // 625 drawing calls in 330 C functions when the scan last changed (it
    // skips `#if 0` blocks since 24 November 2026, which dropped dig.c
    // bury_monst()'s one call). A
    // large drop means the function or call patterns stopped matching and
    // the scan would pass without comparing; 550 and 300 leave room for a
    // changed C revision.
    assert.ok(result.cDraws >= 550, `only ${result.cDraws} C drawing calls found`);
    assert.ok(result.functions >= 300, `only ${result.functions} C functions found`);
    assert.deepEqual([...result.differing.keys()].sort(), [...REVIEWED.keys()].sort(),
        'compare each new function with C, then fix it or add it to REVIEWED with the reason');
    assert.deepEqual([...result.unported].sort(), [...REVIEWED_UNPORTED.keys()].sort(),
        'compare each new function with the JS code that draws for it, then fix it or add '
        + 'it to REVIEWED_UNPORTED with the reason');
});

test('columns() takes the last member of each drawn column', () => {
    // A C call through a pointer, a JS call through an object, and a plain
    // variable.
    const body = 'newsym(mtmp->mx, mtmp->my); map_invisible(mon.mx, mon.my);'
        + ' show_glyph(x, y, g);';
    assert.deepEqual([...columns(body)].sort(), ['mx', 'x']);
    // display.c:298, 315 and 335: map_trap(), map_engraving() and
    // map_object() draw at the square their argument records, so a caller's
    // guard is a test of that member.
    assert.deepEqual([...columns('map_object(obj, 1);')], ['ox']);
    assert.deepEqual([...columns('map_trap(ttmp, 0); map_engraving(ep, 1);')].sort(),
        ['engr_x', 'tx']);
    // remove_object() and unmap_object() are other functions.
    assert.deepEqual([...columns('remove_object(obj);')], []);
    // dig.c-style guard on an object's column before it is mapped.
    assert.equal(guardTests('if (obj->ox) map_object(obj, 0);', columns('map_object(obj, 0);')), 1);
    assert.equal(drawCalls('map_object(obj, 1); newsym(x, y); yield* map_trap_steps(t, 1);'), 3);
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

test('skipDeadConditionals() blanks what the compiler never sees', () => {
    // A whole function inside `#if 0`, as dig.c bury_monst() (2191-2283) is:
    // blanked, with its lines kept so that line numbers stay.
    const wholeFunction = 'a();\n#if 0\nvoid\nf(void)\n{\n    newsym(x, y);\n}\n#endif\nb();';
    assert.equal(skipDeadConditionals(wholeFunction), 'a();\n\n\n\n\n\n\n\nb();');
    // A block inside a function body, as in dungeon.c level_difficulty()
    // (2060), and its `#else` arm, which is compiled and keeps its #endif.
    assert.equal(
        skipDeadConditionals('{\n#if 0\n  x = 1;\n#else\n  x = 2;\n#endif\n}'),
        '{\n\n\n\n  x = 2;\n#endif\n}');
    // A nested conditional inside the dead arm: its `#else` and `#endif` do
    // not end the outer `#if 0`.
    assert.equal(
        skipDeadConditionals('#if 0\n#ifdef A\nx;\n#else\ny;\n#endif\nz;\n#endif\nw;'),
        '\n\n\n\n\n\n\n\nw;');
    // The `#else` arm of `#if 1` is dead; any other conditional keeps both
    // arms, since the scan does not evaluate conditions.
    assert.equal(skipDeadConditionals('#if 1\nx;\n#else\ny;\n#endif'), '#if 1\nx;\n\n\n');
    assert.equal(skipDeadConditionals('#ifdef A\nx;\n#else\ny;\n#endif'),
        '#ifdef A\nx;\n#else\ny;\n#endif');
    // `#if 0` followed by a comment, after stripComments() has blanked it.
    assert.equal(skipDeadConditionals('#if 0   \nx;\n#endif\ny;'), '\n\n\ny;');
});
