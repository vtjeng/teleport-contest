import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadMentionDecorInertPileRecipe,
    verifyMentionDecorInertPileSegment,
} from './run-mention-decor-inert-pile.mjs';

test('the inert-decor recipe selects one ordinary room pile', () => {
    const { segments, version } = loadMentionDecorInertPileRecipe();
    // Version 5 stores replay inputs without recorded C output.
    assert.equal(version, 5);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].seed, 6231371);
    assert.ok(!Object.hasOwn(segments[0], 'steps'));
    assert.match(segments[0].nethackrc, /mention_decor/u);
    assert.match(segments[0].nethackrc, /!autopickup/u);
    assert.equal(segments[0].moves, ' llkkk .');
});

test('the live route retains decor memory and its object pile', async () => {
    for (const segment of loadMentionDecorInertPileRecipe().segments)
        await verifyMentionDecorInertPileSegment(segment);
});
