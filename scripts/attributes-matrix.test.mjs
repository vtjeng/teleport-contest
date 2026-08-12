import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ATTRIBUTE_CASES,
    MOVES,
    loadAttributesRecipe,
} from './run-attributes-command.mjs';

const INSIGHT_C = readFileSync(
    new URL('../nethack-c/upstream/src/insight.c', import.meta.url), 'utf8',
).split('\n');
const lineAt = (n) => INSIGHT_C[n - 1];

test('the attributes matrix carries replay inputs only', () => {
    const recipe = loadAttributesRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    // Every segment dismisses the welcome message, presses ^X, turns the page
    // and closes the window. A move wrongly spent on the command would shift
    // the closing screen, so the trailing <esc> has to be the last key.
    assert.equal(MOVES, '\x1B\x18 \x1B');
    assert.ok(recipe.segments.every(({ moves }) => moves === MOVES));
    // The seed list is the tripwire for a silent re-recording.
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [8151001, 8151002, 8151004, 8151005],
    );
});

test('the attributes matrix moves every term its rows claim to move', () => {
    // Three inputs decide what the window holds, and a matrix that varied only
    // one of them would pass with the other two wrong. Each must take both of
    // the values a recorded case can reach.
    const values = (key) => new Set(ATTRIBUTE_CASES.map((entry) => entry[key]));
    // insight.c:420-423, the MAGICENLIGHTENMENT gate.
    assert.deepEqual(values('discover'), new Set([true, false]));
    // insight.c:1800, magic_negation() answering 0 and 1.
    assert.deepEqual(values('mc'), new Set([0, 1]));
    // insight.c:435-437 against :439-441, the two reachable bones arms.
    assert.deepEqual(values('bones'), new Set([true, false]));

    // Only the explore rows can hold an "Attributes:" section, so the mc and
    // bones spreads have to live inside them rather than across the gate.
    const explore = ATTRIBUTE_CASES.filter((entry) => entry.discover);
    assert.deepEqual(new Set(explore.map((entry) => entry.mc)), new Set([0, 1]));
    assert.deepEqual(
        new Set(explore.map((entry) => entry.bones)), new Set([true, false]),
    );
});

test('the matrix cites insight.c lines that still say what it claims', () => {
    // Each line the matrix names is re-read here, so a renumbered or rewritten
    // insight.c fails this test rather than leaving the comments quietly
    // pointing at the wrong source.
    assert.match(lineAt(420), /if \(mode & MAGICENLIGHTENMENT\)/u);
    assert.match(lineAt(430), /"running in %s mode", wizard \? "debug"/u);
    assert.match(lineAt(436), /"disabled loading%s of bones levels"/u);
    assert.match(lineAt(440), /"haven't encountered", "didn't encounter"/u);
    assert.match(lineAt(1509), /piousness\(TRUE, "aligned"\)/u);
    assert.match(lineAt(1800), /armpro = magic_negation\(&gy\.youmonst\)/u);
    // :1946 is the same Sprintf inside `#if 0`; :1949 is the compiled one, and
    // js/insight.js ports that spelling rather than the disabled one.
    assert.match(lineAt(1946), /safely pray%s", can_pray\(FALSE\)/u);
    assert.match(lineAt(1949), /"%ssafely pray", can_pray\(FALSE\)/u);
    assert.match(lineAt(2014), /if \(wizard \|\| discover\)/u);
    assert.match(lineAt(2015), /mode \|= MAGICENLIGHTENMENT;/u);
});
