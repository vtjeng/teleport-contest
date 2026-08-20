import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    loadStartupMsghistoryRecipe,
    STARTUP_MSGHISTORY_CASES,
    verifyStartupMsghistorySegment,
} from './run-startup-msghistory.mjs';

test('the startup msghistory recipe covers parser and clamp outcomes', () => {
    const recipe = loadStartupMsghistoryRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, STARTUP_MSGHISTORY_CASES.length);
    assert.equal(recipe.segments.length, 8);
    for (const [index, segment] of recipe.segments.entries()) {
        const entry = STARTUP_MSGHISTORY_CASES[index];
        assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
        assert.ok(segment.moves.includes('mO'), entry.label);
        assert.ok(segment.moves.endsWith('\x1b'), entry.label);
        const parsed = parseNethackrc(segment.nethackrc);
        assert.equal(parsed.iflags.msg_history, entry.parsed, entry.label);
        assert.equal(parsed.flags.msghistory, undefined, entry.label);
        assert.equal(
            parsed.configErrorFrame.num_errors > 0,
            Boolean(entry.reports),
            entry.label,
        );
    }
});

test('each startup msghistory case reaches its normalized optionsfull value',
    async () => {
        for (const segment of loadStartupMsghistoryRecipe().segments)
            await verifyStartupMsghistorySegment(segment);
    });
