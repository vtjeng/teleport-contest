import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    loadStartupStatusHiliteRecipe,
    STARTUP_STATUS_HILITE_CASES,
    verifyStartupStatusHiliteSegment,
} from './run-startup-status-hilites.mjs';

test('the startup status highlight recipe covers field and condition counts',
    () => {
        const recipe = loadStartupStatusHiliteRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 15);
        for (const [index, segment] of recipe.segments.entries()) {
            const entry = STARTUP_STATUS_HILITE_CASES[index];
            assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
            assert.ok(segment.moves.includes('mO'), entry.label);
            assert.ok(segment.moves.endsWith('\x1b'), entry.label);
            const parsed = parseNethackrc(segment.nethackrc);
            assert.equal(
                parsed.iflags.hilite_delta,
                entry.expectedDelta ?? 3,
                entry.label,
            );
            if (entry.expectedStoredRules !== undefined) {
                assert.equal(
                    parsed.iflags.status_hilites.length,
                    entry.expectedStoredRules,
                    entry.label,
                );
            } else {
                assert.ok(parsed.iflags.status_hilites.length > 0, entry.label);
            }
        }
    });

test('each startup status highlight case reaches its optionsfull count',
    async () => {
        for (const segment of loadStartupStatusHiliteRecipe().segments)
            await verifyStartupStatusHiliteSegment(segment);
    });
