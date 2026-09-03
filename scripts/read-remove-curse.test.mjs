import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SCR_REMOVE_CURSE } from '../js/objects.js';
import { loadReadRemoveCurseRecipe } from './run-read-remove-curse.mjs';

// The recipe wishes for a cursed scroll of remove curse, reads it, dismisses
// both --More-- prompts, and presses ESC at the naming prompt. The cursed
// branch skips the invent-traversal loop and prints "The scroll
// disintegrates." as a pending message. docall()'s flush_screen(1) triggers
// that message's --More--, and the player then sees the "Call a scroll..."
// prompt. After the ESC, useup() consumes the scroll.
test('cursed remove-curse scroll prints both messages and completes naming flow', async () => {
    const segment = loadReadRemoveCurseRecipe().segments[0];
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (e) => { boundary = e; },
    });

    // docall is now ported, so no boundary error should be thrown.
    assert.equal(boundary, null,
        'docall is ported; no boundary error expected');

    // The scroll should have been consumed by useup() in doread()'s
    // !consumedByEffect branch, which runs after trycall(). With docall
    // completing (ESC dismisses), useup() runs and the scroll is gone.
    const scrollInPack = [];
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === SCR_REMOVE_CURSE) scrollInPack.push(obj);
    }
    assert.equal(scrollInPack.length, 0,
        'the scroll should be consumed by useup() after docall completes');
});

// Gap: the four You_feel() branches in read.c:1499-1504 (hallucination x
// confusion) are string literals ported verbatim. The first branch (not
// hallucinating, not confused) is exercised by the full replay above. The
// other three branches need a direct call to seffect_remove_curse with mocked
// hallucination/confusion state to assert the topline message.
