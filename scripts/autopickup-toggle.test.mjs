// Focused tests for options.c dotogglepickup(), the '@' command.
//
// dotogglepickup() flips flags.pickup and prints "Autopickup: ON/OFF."
// with oc_to_str() detail when ON. The three branches are: ON with no
// pickup_types and no apelist; ON with pickup_types; and OFF. The
// apelist branches (one exception / some exceptions) are exercised by
// count, since the linked-list walk is the same code.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    dotogglepickup,
    oc_to_str,
} from '../js/options.js';
import {
    FOOD_CLASS,
    RING_CLASS,
    WEAPON_CLASS,
} from '../js/objects.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { optionsMenuRecipe } from './run-options-menu.mjs';

// Start a game to the first command prompt with a blank top line, reusing
// the stock recipe that options-toggle.test.mjs records, whose seed and
// datetime are stable.
async function startStockGame() {
    const segment = optionsMenuRecipe('stock options menu').segments[0];
    await runSegment({ ...segment, moves: ' ' });
    clearTopline(game);
    return game;
}

// Clear the top line fully, matching options-toggle.test.mjs clearTopline().
function clearTopline(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
    state._ttyPreviousMessage = '';
    if (state.nhDisplay) state.nhDisplay.topMessage = '';
}

// Read the message shown at the top of the screen.
function topline(state) {
    return state.nhDisplay?.topMessage ?? '';
}

test('toggle ON with empty pickup_types and no apelist', async () => {
    const state = await startStockGame();
    // The compiled-in default is false (optlist_data.js initval for
    // autopickup), and no config statement changes it.
    assert.equal(state.flags.pickup, false);
    assert.deepEqual(state.flags.pickup_types, []);
    assert.equal(state.ga?.apelist ?? null, null);

    await dotogglepickup(state);

    // flags.pickup flipped to true.
    assert.equal(state.flags.pickup, true);
    // C's oc_to_str() on an empty pickup_types writes no characters, so
    // the condition at options.c:9263 chooses "all".
    assert.equal(topline(state), 'Autopickup: ON, for all objects.');
});

test('toggle OFF after being ON', async () => {
    const state = await startStockGame();
    // Start ON: toggle once to turn it on.
    state.flags.pickup = true;
    clearTopline(state);

    await dotogglepickup(state);

    // flags.pickup flipped to false.
    assert.equal(state.flags.pickup, false);
    // C's OFF branch at options.c:9270 sets buf to "OFF".
    assert.equal(topline(state), 'Autopickup: OFF.');
});

test('toggle ON with specific pickup_types', async () => {
    const state = await startStockGame();
    // Set pickup_types to food and rings, mirroring a player's
    // OPTIONS=pickup_types:%= configuration.
    state.flags.pickup = false;
    state.flags.pickup_types = [FOOD_CLASS, RING_CLASS];
    clearTopline(state);

    await dotogglepickup(state);

    assert.equal(state.flags.pickup, true);
    // oc_to_str() maps the oclass values to their def_oc_syms[] symbols.
    const expected = oc_to_str([FOOD_CLASS, RING_CLASS]);
    assert.equal(topline(state), `Autopickup: ON, for ${expected} objects.`);
});

test('toggle ON with one autopickup exception', async () => {
    const state = await startStockGame();
    state.flags.pickup = false;
    // Build a single-node apelist. add_autopickup_exception() is the
    // real builder; here a minimal stub is enough for count_apes().
    state.ga = state.ga ?? {};
    state.ga.apelist = { pattern: 'rock', grab: true, next: null };
    clearTopline(state);

    await dotogglepickup(state);

    assert.equal(state.flags.pickup, true);
    // options.c:9265-9266: count_apes() == 1 => ", with one exception".
    assert.equal(
        topline(state),
        'Autopickup: ON, for all objects, with one exception.',
    );
});

test('toggle ON with multiple autopickup exceptions', async () => {
    const state = await startStockGame();
    state.flags.pickup = false;
    state.ga = state.ga ?? {};
    // Two nodes: count_apes() returns 2.
    state.ga.apelist = {
        pattern: 'rock', grab: true,
        next: { pattern: 'arrow', grab: false, next: null },
    };
    clearTopline(state);

    await dotogglepickup(state);

    assert.equal(state.flags.pickup, true);
    // options.c:9267: count_apes() != 1 => ", with some exceptions".
    assert.equal(
        topline(state),
        'Autopickup: ON, for all objects, with some exceptions.',
    );
});
