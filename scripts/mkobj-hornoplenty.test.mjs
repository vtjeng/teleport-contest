// Source-pinned regression for mkobj.c:hornoplenty()'s invalid-object arm.
// C impossible() emits a diagnostic and returns void, so hornoplenty() must
// return its unchanged zero object count instead of refusing the game path.

import assert from 'node:assert/strict';
import test from 'node:test';

import { resetGame } from '../js/gstate.js';
import { hornoplenty } from '../js/mkobj_hornoplenty.js';

test('hornoplenty records C impossible diagnostics and returns zero', async () => {
    const state = resetGame();
    // C's `!horn` arm is explicitly part of mkobj.c:hornoplenty().
    const invalidHorn = null;

    // The invalid input returns C's untouched object count; no object was made.
    const lines = [];
    const record = async (text) => { lines.push(text); };
    assert.equal(
        await hornoplenty(invalidHorn, false, null,
            { state, message: record, urgentMessage: record }),
        0,
    );
    // mkobj.c:2854-2855, then pline.c impossible()'s two fixed lines.
    assert.deepEqual(lines, [
        "bad horn o' plenty",
        'Program in disorder!',
        'Please report these messages to devteam@nethack.org.',
    ]);
});
