import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadObjectPileCountRecipe,
    verifyObjectPileCountSegment,
} from './run-object-pile-count.mjs';

function optionValue(nethackrc, name) {
    const match = new RegExp(`(?:OPTIONS=|,)${name}:([^,\\n]+)`, 'u')
        .exec(nethackrc);
    assert.ok(match, `the recipe sets ${name}`);
    return match[1];
}

test('the object-pile count matrix has clean, independent replay inputs', () => {
    const { segments, version } = loadObjectPileCountRecipe();
    // Version 5 is the clean session schema whose recipes contain replay
    // inputs but no recorded answers.
    assert.equal(version, 5);
    // Four wording partitions and two menu controls independently replay the
    // count threshold and its outside-boundary behavior.
    assert.equal(segments.length, 6);
    assert.ok(segments.every((segment) => !Object.hasOwn(segment, 'steps')));

    const names = new Set(segments.map(
        ({ nethackrc }) => optionValue(nethackrc, 'name'),
    ));
    // Name does not affect look_here(), so varying it would add an irrelevant
    // input dimension to the differential.
    assert.deepEqual([...names], ['PileCount']);

    const limits = segments.map(
        ({ nethackrc }) => optionValue(nethackrc, 'pile_limit'),
    );
    assert.deepEqual(limits, [
        // Leading whitespace plus an explicit sign reaches C atoi()'s valid
        // signed-decimal prefix while equalling the two-object pile count.
        '   +2',
        // Equality at three pins skip_objects' `obj_cnt >= pile_limit` edge.
        '3',
        // Five is the first "several" count in invent.c look_here().
        '5',
        // Ten is the first "many" count and the configured maximum.
        '10',
        // Zero is the source's never-skip control and retains the menu path.
        '0',
        // Four is one above the three-object pile and retains the menu path.
        '4',
    ]);
});

test('the live wish route retains three balls and drops ten distinct nodes',
    async () => {
        const segment = loadObjectPileCountRecipe().segments.find(
            ({ nethackrc }) => nethackrc.includes('playmode:debug'),
        );
        assert.ok(segment, 'the matrix contains the debug wish route');
        // The verifier runs the real command seam twice: once through the
        // setup prefix to snapshot both floor chains, then through the final
        // re-entry and count transaction.
        await verifyObjectPileCountSegment(segment);
    });
