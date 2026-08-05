import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadDecoratedObjectPileRecipes,
    verifyDecoratedObjectPileSegment,
} from './run-decorated-object-pile.mjs';

test('the decorated-pile matrix contains two clean terrain cases', () => {
    const recipes = loadDecoratedObjectPileRecipes();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.ok(recipes.every(({ version }) => version === 5));
    // One menu case and one count case cover the two source output paths.
    assert.equal(recipes.length, 2);
    assert.ok(recipes.every(({ segments }) => segments.length === 1));
    const segments = recipes.flatMap(({ segments }) => segments);
    assert.ok(segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    assert.deepEqual(
        segments.map(({ seed }) => seed),
        // A single seed holds both independently reached terrain fixtures.
        [6200242, 6200242],
    );
    assert.deepEqual(
        segments.map(({ nethackrc }) =>
            /pile_limit:(\d+)/u.exec(nethackrc)?.[1]),
        // Five retains the two-object menu; two triggers the count shortcut.
        ['5', '2'],
    );
});

test('both live setup routes retain their decorated floor piles', async () => {
    for (const { segments } of loadDecoratedObjectPileRecipes())
        for (const segment of segments)
            await verifyDecoratedObjectPileSegment(segment);
});
