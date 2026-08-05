import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadNoPickObjectPileRecipe,
    verifyNoPickObjectPileSegment,
} from './run-no-pick-object-pile.mjs';

test('the no-pick pile matrix crosses the relevant option partitions', () => {
    const { segments, version } = loadNoPickObjectPileRecipe();
    // Version 5 recipes contain replay inputs without recorded answers.
    assert.equal(version, 5);
    // Four cases cross two autopickup values with two pile-limit branches.
    assert.equal(segments.length, 4);
    assert.ok(segments.every((segment) => !Object.hasOwn(segment, 'steps')));
    assert.deepEqual(
        segments.map(({ nethackrc }) => ({
            autopickup: !nethackrc.includes('!autopickup'),
            pileLimit: Number(/pile_limit:(\d+)/u.exec(nethackrc)?.[1]),
            rebound: nethackrc.includes('BINDINGS=x:reqmenu'),
        })),
        [
            { autopickup: false, pileLimit: 5, rebound: false },
            { autopickup: false, pileLimit: 2, rebound: true },
            { autopickup: true, pileLimit: 5, rebound: true },
            { autopickup: true, pileLimit: 2, rebound: false },
        ],
    );
});

test('every live no-pick route preserves its ordinary floor pile', async () => {
    for (const segment of loadNoPickObjectPileRecipe().segments)
        await verifyNoPickObjectPileSegment(segment);
});
