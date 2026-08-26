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
//
// The tests compare JS output against pre-recorded C reference fixtures
// adjacent to this file. To re-record the fixtures (after a C recorder
// change), run record-session.mjs for each seed:
//
//   node scripts/record-session.mjs <recipe.json> scripts/garlic-breath-seed100.fixture.json
//   node scripts/record-session.mjs <recipe.json> scripts/garlic-breath-seed200.fixture.json
//
// Break: to observe a parity test failing, change the throw at the
// CLOVE_OF_GARLIC case in eat.js fprefx() from the iter_mons_safe call
// to `throw new UnsupportedEatError('garlic_breath()')`. The comparison
// reports FAIL because the JS produces 4 screens (stopping at the
// boundary) while C produces 6 (completing the eat).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { formatReport } from './diff-fresh.mjs';
import {
    createScoringWorkspace,
    removeScoringWorkspace,
} from './scoring-workspace.mjs';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT_DIR = import.meta.dirname;
const JS_WORKER = join(ROOT, 'scripts', 'diff-fresh-worker.mjs');
const RESULT_MARKER = '__FRESH_DIFF_RESULT__';

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

// Run the JS port against a pre-recorded C reference fixture and return the
// comparison result. The worker runs in a subprocess for module isolation, the
// same way diff-fresh.mjs itself runs its JS replay.
function compareAgainstFixture(fixtureName) {
    const fixturePath = join(SCRIPT_DIR, fixtureName);
    // createScoringWorkspace copies js/ and frozen/ into a temp directory,
    // overlaying the three frozen scorer files. The session files argument is
    // empty because the worker reads the recording from fixturePath directly.
    const scoringRoot = createScoringWorkspace(SCRIPT_DIR, []);
    try {
        const stdout = execFileSync(
            process.execPath,
            [JS_WORKER, fixturePath, scoringRoot],
            { encoding: 'utf8', timeout: 120_000 },
        );
        const markerIndex = stdout.lastIndexOf(RESULT_MARKER);
        if (markerIndex < 0) {
            throw new Error('diff-fresh-worker result marker missing');
        }
        return JSON.parse(
            stdout.slice(markerIndex + RESULT_MARKER.length).trim(),
        );
    } finally {
        removeScoringWorkspace(scoringRoot);
    }
}

// Verify that a fixture recording matches the expected recipe fields, so a
// recipe change without a fixture re-recording causes an explicit failure.
function assertFixtureMatchesRecipe(fixtureName, recipe) {
    const fixture = JSON.parse(
        readFileSync(join(SCRIPT_DIR, fixtureName), 'utf8'),
    );
    const seg = fixture.segments[0];
    const expected = recipe.segments[0];
    assert.equal(seg.seed, expected.seed, 'fixture seed mismatch');
    assert.equal(seg.datetime, expected.datetime, 'fixture datetime mismatch');
    assert.equal(seg.nethackrc, expected.nethackrc, 'fixture nethackrc mismatch');
    assert.equal(seg.moves, expected.moves, 'fixture moves mismatch');
}

test('eating garlic reaches garlic_breath and the give_feedback message', () => {
    assertFixtureMatchesRecipe('garlic-breath-seed100.fixture.json', RECIPE);
    const result = compareAgainstFixture('garlic-breath-seed100.fixture.json');
    const report = formatReport(result);

    assert.match(report, /RESULT: PASS/u,
        'garlic recipe must achieve full PRNG and screen parity');
    // Confirm the screens were actually compared, not vacuously empty.
    // Seed 100 produces 6 screens: initial + 2 --More-- + eat prompt +
    // garlic selection + dismiss.
    assert.match(report, /Screen length: C=6, JS=6/u);
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

    assertFixtureMatchesRecipe('garlic-breath-seed200.fixture.json', recipe2);
    const result = compareAgainstFixture('garlic-breath-seed200.fixture.json');
    const report = formatReport(result);

    assert.match(report, /RESULT: PASS/u,
        'garlic recipe at seed 200 must achieve full parity');
});
