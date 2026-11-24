// A C function and the JS function of the same name test the same
// visibility predicates in the same order: canspotmon(), canseemon(),
// sensemon(), cansee(), couldsee(), mon_visible() and flags.verbose.
// scripts/visibility-predicate.mjs reads both sides.
//
// The port once tested canseemon() in minion.c demon_talk() and in muse.c
// use_offensive()'s scroll of earth where C tests canspotmon(), and cansee()
// in do.c flooreffects() where C tests Blind. Each printed the wrong line
// only for a hero who senses a monster without seeing it, which no recording
// held.
//
// Where the two sequences differ for a reason other than a different
// predicate, such as a helper that holds the test, an injected alias the
// scan cannot read, or C code under #if 0,
// scripts/visibility-predicate-reviewed.json records the JS sequence that
// was compared with C by hand and why it differs. Changing a listed
// function's predicates fails this test until the entry is reviewed again.
//
// Limits: the scan takes an alias such as canSeeMonster for the predicate
// its name suggests and does not read what the alias is bound to (dungeon.c
// update_lastseentyp()'s once defaulted to "never"), and it takes equal
// sequences as agreement, so two opposite swaps in one function pass.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { analyse, normalizeJs, sequence } from './visibility-predicate.mjs';

const REVIEWED = JSON.parse(readFileSync(
    new URL('./visibility-predicate-reviewed.json', import.meta.url), 'utf8'));

// Functions whose sequences differ and were compared by hand on 23 November
// 2026. Lower this when an entry is removed; give a reason in the JSON file
// for each one added. 81 since hack.c notice_mon() and notice_all_mons()
// moved to js/hack.js under their C names (24 November 2026).
const REVIEWED_COUNT = 81;

// C functions that test a predicate and have no JS function of the same
// name, so the scan compares nothing for them:
// - dig.c bury_monst() and region.c enter_force_field() are under #if 0.
// - mail.c md_start() is not ported.
// - display.c mon_overrides_region() and get_bkglyph_and_framecolor(),
//   dokick.c watchman_thief_arrest() and watchman_door_damage(), and vault.c
//   gd_pick_corridor_gold() are written inline in their one caller, which
//   the reviewed list covers for newsym(), kick_door() and gd_move().
const UNPORTED = [
    'dig.c bury_monst',
    'display.c mon_overrides_region',
    'display.c get_bkglyph_and_framecolor',
    'dokick.c watchman_thief_arrest',
    'dokick.c watchman_door_damage',
    'mail.c md_start',
    'region.c enter_force_field',
    'vault.c gd_pick_corridor_gold',
];

// C sites outside a function body: dbridge.c e_canseemon() and monmove.c
// flees_light() are macros, display.c:177-205 are the function forms of
// sensemon(), mon_visible() and canseemon(), and dig.c:2277 is bury_obj()
// under #if 0.
const OUTSIDE = [
    'dbridge.c:341', 'dig.c:2277', 'display.c:177', 'display.c:191',
    'display.c:205', 'monmove.c:455',
];

test('same-named C and JS functions test the same visibility predicates', () => {
    const result = analyse();
    const unreviewed = [];
    for (const [key, { c, js }] of result.differing) {
        if (REVIEWED[key]?.js === js) continue;
        unreviewed.push(`${key}\n  C:  ${c}\n  JS: ${js}`
            + (REVIEWED[key] ? `\n  reviewed JS: ${REVIEWED[key].js}` : ''));
    }
    assert.deepEqual(unreviewed, [], 'compare each function with the C '
        + 'source; fix a wrong predicate, or record the reviewed JS sequence '
        + 'and the reason in scripts/visibility-predicate-reviewed.json');
    const stale = Object.keys(REVIEWED).filter((key) => !result.differing.has(key));
    assert.deepEqual(stale, [], 'these functions now match C; remove their '
        + 'entries and lower REVIEWED_COUNT');
    assert.equal(Object.keys(REVIEWED).length, REVIEWED_COUNT);
    for (const [key, { reason }] of Object.entries(REVIEWED))
        assert.ok(reason?.length > 20, `${key} needs a reason`);
    assert.deepEqual(result.unported, UNPORTED);
    assert.deepEqual(result.outside, OUTSIDE);
    // 1033 predicate sites in 473 C functions at the pinned C revision, of
    // which 381 functions match token for token. A large drop means the
    // scan stopped reading one side.
    assert.equal(result.sites, 1033);
    assert.equal(result.functions, 473);
    assert.equal(result.same + result.differing.size + result.unported.length,
        result.functions);
    assert.ok(result.same >= 381, `only ${result.same} functions match`);
});

test('the scan tells a swapped predicate from the same one', () => {
    // minion.c demon_talk()'s first test, and the two forms the port had.
    const c = sequence('if (canspotmon(mtmp))\n    pline("%s looks very angry.", Amonnam(mtmp));');
    assert.equal(c, 'canspotmon');
    assert.equal(sequence(normalizeJs('if (canspotmon(mtmp, state))')), c);
    assert.equal(sequence(normalizeJs('if (canseemon(mtmp, state))')), 'canseemon');
    // demon_talk() is compared, not excused.
    assert.ok(!('minion.c demon_talk' in REVIEWED));
    assert.ok(!analyse().differing.has('minion.c demon_talk'));
});

test('the scan reads a use of an injected alias and skips its definition', () => {
    // One line per form: a use of each alias, then a default, a property
    // and an assignment, which define an alias without testing anything,
    // and a comment.
    const source = [
        'if (canSpotMonster(mon, state)) a();',
        'if (!canSeeMonster(mon, state)) b();',
        'if (env.canSee(x, y)) c();',
        'if (couldSee(x, y)) d();',
        'if (state.flags?.verbose) e();',
        'const canSee = env.canSee ?? cansee;',
        'const ops = { canSeeMonster: canseemon };',
        'spotMonster = canspotmon;',
        '// canseemon(mon) in a comment',
    ].join('\n');
    assert.equal(sequence(normalizeJs(source)),
        'canspotmon canseemon cansee couldsee verbose');
    // An alias handed on by shorthand counts as a use, which is why a
    // function that passes one to a callee is on the reviewed list.
    assert.equal(sequence(normalizeJs('await monflee(mon, { couldSee });')),
        'couldsee');
});
