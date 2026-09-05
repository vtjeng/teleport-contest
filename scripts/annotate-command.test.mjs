// Focused tests for dungeon.c donamelevel() (2571-2577) and
// query_annotation() (2499-2567).
//
// donamelevel() is the #annotate extended command. It calls
// query_annotation(NULL), which prompts the player to name the current
// dungeon level. The annotation is stored in the mapseen entry's
// custom / custom_lth fields.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ECMD_OK } from '../js/const.js';
import { donamelevel, find_mapseen } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

// Start a game so the full game state is initialized.
async function startedGame(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
}

// Clear the top line so hooked_tty_getlin() does not try to dismiss a
// pending --More-- and consume a queued key.
function clearTopline() {
    game._pending_message = '';
    game._ttyToplines = '';
    game._ttyPreviousMessage = '';
    game._ttyMessageStopped = false;
    if (game.nhDisplay) game.nhDisplay.toplin = 0;
}

// Queue keys for getlin: the text the player types, followed by Enter.
function queueText(text) {
    for (const ch of text) game.nhDisplay.pushKey(ch.charCodeAt(0));
    game.nhDisplay.pushKey(0x0d); // Enter
}

// ── donamelevel ──

// donamelevel() returns ECMD_OK after the player annotates the level.
// C ref: dungeon.c:2576 "return ECMD_OK".
test('donamelevel returns ECMD_OK and stores the annotation', async () => {
    await startedGame(990001, 'Annotate1');
    clearTopline();
    queueText('Test Label');
    const result = await donamelevel(game);
    assert.equal(result, ECMD_OK,
        'donamelevel should return ECMD_OK');
    const mptr = find_mapseen(game.u.uz, game);
    assert.equal(mptr.custom, 'Test Label',
        'the annotation should be stored on the mapseen entry');
    assert.equal(mptr.custom_lth, 'Test Label'.length,
        'custom_lth should equal the annotation length');
});

// Empty input (just Enter) aborts without changing the annotation.
// C ref: dungeon.c:2549 "if (!*nbuf || *nbuf == '\\033') return".
test('donamelevel with empty input does not set an annotation', async () => {
    await startedGame(990002, 'Annotate2');
    clearTopline();
    // Queue just Enter -- empty response.
    game.nhDisplay.pushKey(0x0d);
    const result = await donamelevel(game);
    assert.equal(result, ECMD_OK);
    const mptr = find_mapseen(game.u.uz, game);
    assert.equal(mptr.custom, null,
        'no annotation should be set on empty input');
});

// ESC cancels without changing the annotation.
// C ref: dungeon.c:2549.
test('donamelevel with ESC does not set an annotation', async () => {
    await startedGame(990003, 'Annotate3');
    clearTopline();
    // Queue Escape.
    game.nhDisplay.pushKey(0x1b);
    const result = await donamelevel(game);
    assert.equal(result, ECMD_OK);
    const mptr = find_mapseen(game.u.uz, game);
    assert.equal(mptr.custom, null,
        'no annotation should be set when Escape is pressed');
});

// All-spaces input discards the existing annotation.
// C ref: dungeon.c:2562 "if (*nbuf && strcmp(nbuf, \" \"))".
// mungspaces() collapses "   " to " ", and the strcmp guard prevents
// storing a single space as an annotation.
test('donamelevel with all-spaces input clears an existing annotation', async () => {
    await startedGame(990004, 'Annotate4');
    // First, set an annotation.
    clearTopline();
    queueText('Original');
    await donamelevel(game);
    const mptr = find_mapseen(game.u.uz, game);
    assert.equal(mptr.custom, 'Original');

    // Now "replace" with all spaces, which should clear it.
    clearTopline();
    queueText('   ');
    await donamelevel(game);
    assert.equal(mptr.custom, null,
        'all-spaces input should clear the existing annotation');
    assert.equal(mptr.custom_lth, 0,
        'custom_lth should be 0 after clearing');
});

// Replacing an existing annotation shows the "Replace annotation" prompt
// and stores the new value.
// C ref: dungeon.c:2515-2520, the #else branch of EDIT_GETLIN.
test('donamelevel replaces an existing annotation', async () => {
    await startedGame(990005, 'Annotate5');
    // Set initial annotation.
    clearTopline();
    queueText('First');
    await donamelevel(game);
    const mptr = find_mapseen(game.u.uz, game);
    assert.equal(mptr.custom, 'First');

    // Replace it.
    clearTopline();
    queueText('Second');
    await donamelevel(game);
    assert.equal(mptr.custom, 'Second',
        'the annotation should be replaced with the new value');
    assert.equal(mptr.custom_lth, 'Second'.length);
});

// Leading/trailing spaces and consecutive spaces are compressed by
// mungspaces(). C ref: dungeon.c:2552.
test('donamelevel compresses spaces in the annotation', async () => {
    await startedGame(990006, 'Annotate6');
    clearTopline();
    queueText('  hello   world  ');
    await donamelevel(game);
    const mptr = find_mapseen(game.u.uz, game);
    assert.equal(mptr.custom, 'hello world',
        'leading/trailing/consecutive spaces should be compressed');
});
