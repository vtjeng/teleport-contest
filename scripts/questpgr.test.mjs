import assert from 'node:assert/strict';
import test from 'node:test';

import { com_pager } from '../js/questpgr.js';

test('common array pager shuffles once, then chooses a Lua array entry', async () => {
    const draws = [];
    const lines = [];
    const result = await com_pager('angel_cuss', {}, {
        // Zero chooses the first stable result at each source RNG boundary.
        random(bound) {
            draws.push(bound);
            return 0;
        },
        message: async (line) => lines.push(line),
    });

    assert.equal(result, true);
    // The first two bounds are nhlib's private shuffle; 14 selects a cuss line.
    assert.deepEqual(draws, [3, 2, 14]);
    // This quoted text is the first common.angel_cuss Lua array entry.
    assert.deepEqual(lines, ['"Repent, and thou shalt be saved!"']);
});

test('common string pager converts Lua substitutions and emits one line', async () => {
    const draws = [];
    const lines = [];
    const state = {
        // No leader object makes questpgr.c:ldrname() use its source fallback.
        urole: { homebase: 'the Lonely Tower' },
    };
    await com_pager('quest_portal_demand', state, {
        // The Lua initializer shuffles its alignment table before lookup.
        random(bound) {
            draws.push(bound);
            return 0;
        },
        message: async (line) => lines.push(line),
    });

    // This message is a single string, so only the private shuffle draws occur.
    assert.deepEqual(draws, [3, 2]);
    // %l is converted by the same common pager path as portal and cuss text.
    assert.deepEqual(lines, ['You again sense your leader demanding your attendance.']);
});
