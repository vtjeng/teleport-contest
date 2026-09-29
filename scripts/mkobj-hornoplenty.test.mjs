// Source-pinned regression for mkobj.c:hornoplenty()'s invalid-object arm.
// C impossible() emits a diagnostic and returns void, so hornoplenty() must
// return its unchanged zero object count instead of refusing the game path.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { hornoplenty } from '../js/mkobj_hornoplenty.js';

test('hornoplenty records C impossible diagnostics and returns zero', async () => {
    const state = resetGame();
    // C's `!horn` arm is explicitly part of mkobj.c:hornoplenty().
    const invalidHorn = null;

    // The invalid input returns C's untouched object count; no object was made.
    assert.equal(
        await hornoplenty(invalidHorn, false, null, { state }),
        0,
    );
    assert.ok(
        game.unported.has('pline.c impossible'),
        'the void diagnostic remains recorded as an unported callee',
    );
});
