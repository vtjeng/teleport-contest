import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ACCEPT_CASES,
    DECLINE_CASES,
    DEFERRED_ANGER_CASES,
    loadPrayAcceptRecipe,
    loadPrayDeclineRecipe,
} from './run-pray-command.mjs';

const TOPL_C = readFileSync(
    new URL('../nethack-c/upstream/win/tty/topl.c', import.meta.url), 'utf8',
);

test('the #pray matrix carries replay inputs only', () => {
    const recipe = loadPrayDeclineRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Every segment issues the command through the extended-command prompt and
    // waits twice afterwards, so a move wrongly spent on a declined prayer
    // shifts a compared screen.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves.startsWith('.#pray\n') && moves.endsWith('..'),
    ));
    // The seed list is the tripwire for a silent re-recording.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [4410001, 4410002, 4410001, 4410002, 4410001],
    );
});

test('the #pray matrix covers every way the yn read loop can end', () => {
    // topl.c tty_yn_function()'s loop leaves through four doors. Each answer
    // below opens exactly one; a fifth answer key would have to name its own.
    const answers = DECLINE_CASES.map(({ answer }) => answer);
    assert.deepEqual(answers, ['n', '\x1B', ' ', 'zn', 'N']);

    // Each `arm` cites the source line the case is there to reach, and the
    // text of that line is re-read here so a renumbered or rewritten topl.c
    // fails this test rather than silently leaving an arm uncovered.
    const lines = TOPL_C.split('\n');
    const lineAt = (n) => lines[n - 1];
    for (const { arm } of DECLINE_CASES) {
        const [, range] = /^topl\.c:(\d+)(?:-\d+)?/u.exec(arm);
        assert.ok(lineAt(Number(range)).trim().length > 0, arm);
    }
    // The doors, spelled as topl.c spells them.
    assert.match(lineAt(433), /q = lowc\(q\);/u);
    assert.match(lineAt(463), /if \(q == '\\033'\)/u);
    assert.match(lineAt(471), /strchr\(quitchars, q\)/u);
    assert.match(lineAt(475), /!strchr\(resp, q\) && !digit_ok/u);
    // The one door no case opens, because no ported response set holds '#'.
    assert.match(lineAt(478), /q == '#' \|\| digit_ok/u);
});

test('the accepting #pray matrix carries replay inputs only', () => {
    const recipe = loadPrayAcceptRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Every segment confirms the prayer and then answers the --More-- that
    // angrygods()'s line raises. A segment that ended on that prompt instead
    // would compare the prayer's screens but never the rnz(300) below it.
    assert.ok(recipe.segments.every(
        ({ moves }) => moves.includes('#pray\ny ') && moves.endsWith(' '),
    ));
    // The seed list is the tripwire for a silent re-recording. Each was found
    // by scanning upward from 6120000 for the first that lands on the pair of
    // angrygods() cases the port owns, so a changed seed means a changed case.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [6120003, 6120001, 6120003, 6120003, 6120001, 6120007, 6120000],
    );
});

test('the accepting #pray matrix varies every term of maxanger', () => {
    // pray.c:712-723 builds maxanger from three inputs. A matrix that moved
    // only one of them would pass with two of the terms wrong, so each is
    // named here and the set of values each takes is asserted.
    const angers = ACCEPT_CASES.map(({ maxanger }) => maxanger);
    assert.deepEqual(angers, [6, 4, 6, 5, 4, 12, 4]);
    // The STRIDENT branch both ways: initrecord 0 pays -Luck and initrecord 10
    // pays -Luck / 3.
    assert.ok(angers.includes(6) && angers.includes(4));
    // -Luck / 3 truncating to 0 (the full-moon row) and the anger term at 2
    // (the two-prayer row) are each reached by exactly one case.
    assert.equal(angers.filter((value) => value === 5).length, 1);
    assert.equal(angers.filter((value) => value === 12).length, 1);

    // Every case names its own character, and between them they cover the two
    // roles whose initrecord straddles STRIDENT and both of the Valkyrie's
    // permitted alignments.
    const rcs = ACCEPT_CASES.map(({ nethackrc }) => nethackrc);
    assert.ok(rcs.some((rc) => rc.includes('role:Samurai')));
    assert.ok(rcs.some((rc) => rc.includes('role:Valkyrie,race:human,'
        + 'gender:female,align:lawful')));
    assert.ok(rcs.some((rc) => rc.includes('role:Valkyrie,race:human,'
        + 'gender:female,align:neutral')));
    // Exactly one case keeps its starting pet, so the three immobile turns run
    // dogmove.c dog_move() against C at least once.
    assert.equal(rcs.filter((rc) => !rc.includes('pettype:none')).length, 1);
});

test('the deferred angrygods cases stay out of the recorded matrix', () => {
    // These reach pray.c:731-778, which stops by name. Recording them would
    // fail the differential, so they live beside the matrix rather than in it,
    // and QUALITY.json entry angrygods-cases-above-1 carries the same inputs.
    const recorded = new Set(loadPrayAcceptRecipe().segments.map(
        ({ seed, nethackrc }) => `${seed}|${nethackrc}`,
    ));
    assert.equal(DEFERRED_ANGER_CASES.length, 2);
    for (const { seed, nethackrc, arm } of DEFERRED_ANGER_CASES) {
        assert.ok(!recorded.has(`${seed}|${nethackrc}`), arm);
    }
});
