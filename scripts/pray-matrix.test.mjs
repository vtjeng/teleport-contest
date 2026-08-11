import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DECLINE_CASES, loadPrayDeclineRecipe } from './run-pray-command.mjs';

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
