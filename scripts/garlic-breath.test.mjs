// Verify that eating a clove of garlic reaches fprefx()'s CLOVE_OF_GARLIC arm,
// runs iter_mons(garlic_breath), falls through to the default give_feedback
// label, and produces "This clove of garlic is delicious!" with full PRNG and
// screen parity against the C reference.
//
// C ref: eat.c garlic_breath() (2084-2089) and fprefx() CLOVE_OF_GARLIC case
// (2162-2168).
//
// garlic_breath() calls monflee(mtmp, 0, FALSE, FALSE) for each monster with
// olfaction(mtmp->data) within squared distance 7 of the hero. With
// fleeTime=0 and showMessage=FALSE, monflee makes no random-number calls, so
// the PRNG log is the same whether or not monsters qualify. The parity check
// therefore validates both the call sequence and the iter_mons traversal order,
// even when no monster is close enough to flee.
//
// The recipe starts a Priest (who begins with a clove of garlic at letter 'e')
// in debug mode with no pet, disables the tutorial, and eats the garlic
// immediately. u_init.c's Priest[] table creates the garlic as the fifth item
// (after mace 'a', robe 'b', small shield 'c', and holy water 'd'), so the
// garlic lands at inventory letter 'e'. The eat command key is also 'e', so
// the recipe presses 'e' twice: once to start eating and once to select the
// garlic. The final space dismisses the --More-- after "delicious!".

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(import.meta.dirname, '..');

// Seed 100: a Priest on D:1. The garlic is inventory letter 'e'.
// Moves:
//   ' '  dismiss the opening --More--
//   ' '  dismiss the second --More-- (location message)
//   'e'  start the eat command
//   'e'  select the clove of garlic (letter 'e')
//   ' '  dismiss the "This clove of garlic is delicious!" --More--
const RECIPE = {
    version: 5,
    segments: [{
        seed: 100,
        datetime: '20000110090000',
        nethackrc: [
            'OPTIONS=name:TestPriest,role:Priest,race:human,gender:male,',
            'align:neutral,playmode:debug,suppress_alert:3.4.3,',
            'symset:DECgraphics',
            '\nOPTIONS=!autopickup,!legacy,!tutorial,pettype:none',
        ].join(''),
        moves: '  ee ',
    }],
};

// Break: to observe this test failing, change the throw at the
// CLOVE_OF_GARLIC case in eat.js fprefx() from the iter_mons_safe call
// to `throw new UnsupportedEatError('garlic_breath()')`. The diff
// reports FAIL because the JS produces 4 screens (stopping at the
// boundary) while C produces 6 (completing the eat).
test('eating garlic reaches garlic_breath and the give_feedback message', () => {
    const recipePath = join(ROOT, 'scripts', '.garlic-breath-recipe.tmp.json');
    writeFileSync(recipePath, JSON.stringify(RECIPE));

    let stdout;
    try {
        stdout = execFileSync(
            process.execPath,
            [join(ROOT, 'scripts', 'diff-fresh.mjs'), recipePath],
            { encoding: 'utf8', timeout: 120_000 },
        );
    } finally {
        try { unlinkSync(recipePath); } catch { /* ignore */ }
    }

    // diff-fresh.mjs exits 0 on full parity and 1 on mismatch. The
    // execFileSync throws on nonzero exit, so reaching here means exit 0.
    assert.match(stdout, /RESULT: PASS/u,
        'garlic recipe must achieve full PRNG and screen parity');
    // Confirm the screens were actually compared, not vacuously empty.
    // Seed 100 produces 6 screens: initial + 2 --More-- + eat prompt +
    // garlic selection + dismiss.
    assert.match(stdout, /Screen length: C=6, JS=6/u);
});

test('garlic recipe uses only expected inputs', () => {
    // The recipe presses space (dismiss --More--) and 'e' (eat command /
    // garlic selection). No other key appears.
    const expected = new Set([' ', 'e']);
    for (const ch of RECIPE.segments[0].moves) {
        assert.ok(expected.has(ch),
            `unexpected input character ${JSON.stringify(ch)}`);
    }
});

// Vary the seed to confirm garlic eating is not seed-specific. Seed 200
// places the Priest in a different temple layout; the garlic remains at
// letter 'e' because u_init.c always gives Priest the same starting kit.
test('garlic eating matches at a second seed', () => {
    const recipe2 = structuredClone(RECIPE);
    recipe2.segments[0].seed = 200;

    const recipePath = join(ROOT, 'scripts', '.garlic-breath-recipe2.tmp.json');
    writeFileSync(recipePath, JSON.stringify(recipe2));

    let stdout;
    try {
        stdout = execFileSync(
            process.execPath,
            [join(ROOT, 'scripts', 'diff-fresh.mjs'), recipePath],
            { encoding: 'utf8', timeout: 120_000 },
        );
    } finally {
        try { unlinkSync(recipePath); } catch { /* ignore */ }
    }

    assert.match(stdout, /RESULT: PASS/u,
        'garlic recipe at seed 200 must achieve full parity');
});
