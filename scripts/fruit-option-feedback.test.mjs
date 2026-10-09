// Source pins: options.c:1758-1760 fruitadd then give_opt_msg-controlled pline.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { parseNethackrc } from '../js/options.js';

for (const [name, expected, feedback] of [
    // Full menu gives the successful rename message after fruitadd.
    ['full-feedback', 'dragonberry', true],
    // Simple menu brackets give_opt_msg FALSE/TRUE, muting the same setter.
    ['simple-silent', 'snowberry', false],
    // initoptions_finish singularizes the independently configured plural.
    ['startup-silent', 'moonberry', false],
]) {
    test(`fruit option production feedback: ${name}`, async () => {
        const recipe = JSON.parse(readFileSync(new URL(
            `../recipes/options.c/fruit-option-${name}.session.json`, import.meta.url)));
        let boundary;
        const replay = await runSegment(recipe.segments[0], {
            onBoundary: error => { boundary = error; },
        });
        assert.equal(boundary, undefined);
        assert.equal(game.svp.pl_fruit, expected);
        assert.equal(replay.getScreens().some(screen => screen.includes('Fruit is now')), feedback);
        // The live result must never be placed in a startup-only event queue.
        assert.equal(game.startupEvents, undefined);
        assert.equal(game.give_opt_msg, true);
    });
}

test('fruit startup setter stays synchronous and does not queue live feedback', () => {
    // Source go.opt_initial TRUE skips fruitadd and its live message entirely.
    const parsed = parseNethackrc('OPTIONS=fruit:dragonberry\n');
    assert.equal(parsed.pl_fruit, 'dragonberry');
    assert.equal(parsed.startupEvents.some(event => event.text?.includes('Fruit is now')), false);
    const source = readFileSync(new URL('../nethack-c/upstream/src/options.c', import.meta.url), 'utf8');
    assert.ok(source.includes('(void) fruitadd(svp.pl_fruit, forig);'));
    assert.ok(source.includes('if (give_opt_msg)\n                pline("Fruit is now'));
});
