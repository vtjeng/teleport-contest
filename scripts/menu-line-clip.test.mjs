import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CLIP_CASES,
    loadMenuLineClipRecipe,
    verifyMenuLineClipSegment,
} from './run-menu-line-clip.mjs';

// wintty.c tty_end_menu():2728-2733 compares `strlen(curr->str) + 2` with
// ttyDisplay->cols, so the boundary sits at cols - 2 and the comparison is
// strict. Asserting that property rather than the four numbers means a
// re-recorded matrix that drifted off the boundary fails here.
const COLS = 80;

test('the menu-clip matrix straddles the cols - 2 boundary', () => {
    const recipe = loadMenuLineClipRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));

    const cut = CLIP_CASES.map(({ stored }) => stored + 2 > COLS);
    assert.ok(cut.includes(false), 'no case stays inside the terminal');
    assert.ok(cut.includes(true), 'no case overflows the terminal');
    // The two cases either side of the boundary are what separate a cut at
    // cols - 2 from one at cols - 1 or at cols.
    assert.ok(CLIP_CASES.some(({ stored }) => stored === COLS - 2),
        'no case stores exactly cols - 2 characters');
    assert.ok(CLIP_CASES.some(({ stored }) => stored === COLS - 1),
        'no case stores exactly cols - 1 characters');
    // And one line longer than the terminal itself, so the cut cannot be
    // mistaken for trimming a fixed number of characters.
    assert.ok(CLIP_CASES.some(({ stored }) => stored > COLS),
        'no case stores more than a full terminal row');

    // Every segment wishes in debug mode, which is the only way to name an
    // object more widely than the dungeon ever does.
    assert.ok(recipe.segments.every(
        ({ nethackrc }) => nethackrc.includes('playmode:debug'),
    ));
    // The label's length is the only thing that varies between segments, so
    // nothing else about the recorded screens can explain a difference.
    const shapes = new Set(recipe.segments.map(
        ({ moves }) => moves.replace(/a+/gu, 'a'),
    ));
    assert.equal(shapes.size, 1);
    // Four labels, four distinct lengths.
    assert.equal(new Set(CLIP_CASES.map(({ stored }) => stored)).size,
        CLIP_CASES.length);
});

test('every menu-clip case reaches the length it was chosen for', async () => {
    for (const segment of loadMenuLineClipRecipe().segments)
        await verifyMenuLineClipSegment(segment);
});
