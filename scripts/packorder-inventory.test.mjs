import assert from 'node:assert/strict';
import test from 'node:test';

import { oc_to_str, parseNethackrc } from '../js/options.js';
import {
    loadPackorderInventoryRecipe,
    PACKORDER_INVENTORY_CASES,
    verifyPackorderInventorySegment,
} from './run-packorder-inventory.mjs';

test('the packorder recipe contains replay inputs for each source branch',
    () => {
        const { segments, version } = loadPackorderInventoryRecipe();
        assert.equal(version, 5);
        assert.equal(segments.length, PACKORDER_INVENTORY_CASES.length);
        assert.equal(segments.length, 4);
        for (const [index, segment] of segments.entries()) {
            const entry = PACKORDER_INVENTORY_CASES[index];
            assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
            assert.ok(segment.moves.includes('i'), entry.label);
            assert.equal(
                oc_to_str(parseNethackrc(segment.nethackrc).flags.inv_order),
                entry.expectedOrder,
                entry.label,
            );
        }
    });

test('the i command renders each configured class order', async () => {
    for (const segment of loadPackorderInventoryRecipe().segments)
        await verifyPackorderInventorySegment(segment);
});
