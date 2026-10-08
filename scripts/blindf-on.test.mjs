// Tests for do_wear.c Blindf_on() (1461-1492) and potion.c
// toggle_blindness() (336-364). Each test initializes game state through
// runSegment with a debug-mode wish, then calls Blindf_on directly.
//
// Expected values come from reading the C source (do_wear.c, potion.c,
// youprop.h) and the constants they reference.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    W_TOOL,
    W_WEP,
} from '../js/const.js';
import {
    _doWearInternals,
} from '../js/do_wear.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    BLINDFOLD,
    TOOL_CLASS,
    TOWEL,
} from '../js/objects.js';
import { heroIsBlind } from '../js/startup_a11y.js';

const { Blindf_on } = _doWearInternals;

const { loadWearRecipe } = await import('./run-wear-armor.mjs');
const recipe = loadWearRecipe();

// A character whose ring and amulet slots start empty. The debug segment
// gives us a wish to set up the test item.
const BASE_SEGMENT = recipe.segments.find(s => s.moves === '.TWc.');

// Initialize game state with a debug-mode wish. The wish gives the hero
// an item and takes a turn ('.') so the turn counter advances.
function debugSegment(wishItem) {
    return {
        ...BASE_SEGMENT,
        seed: 7720141,
        nethackrc: BASE_SEGMENT.nethackrc.replace(
            'showexp', 'showexp,playmode:debug',
        ),
        // Ctrl-W wishes, then '.' waits one turn to consume any pending
        // messages from the wish itself.
        moves: `.\x17${wishItem}\n.`,
    };
}

// Run a debug segment and clear any pending message so the subsequent
// Blindf_on call starts from a clean display state.
// extraKeys: number of space keys to push into the display queue for
// arms that print multiple messages (on_msg + "You can't see" message).
async function initGame(wishItem, extraKeys = 0) {
    const seg = debugSegment(wishItem);
    await runSegment({ ...seg, moves: seg.moves });
    game._pending_message = '';
    game.nhDisplay.toplin = 0; // TOPLINE_EMPTY
    // Push extra space keys for arms that print messages needing dismissal.
    for (let i = 0; i < extraKeys; i++)
        game.nhDisplay.pushKey(0x20); // space
}

// A synthetic blindfold/towel suitable for Blindf_on. The function reads
// otyp, owornmask, oclass, dknown; setworn() inside sets owornmask to W_TOOL.
function syntheticEyewear(otyp) {
    return {
        oclass: TOOL_CLASS, otyp,
        owornmask: 0, dknown: true, known: false, spe: 0, quan: 1, where: 0,
    };
}

// ---- blindfold common path ----

test('Blindf_on with blindfold makes sighted hero blind', async () => {
    // do_wear.c:1463 already_blind = Blind (FALSE for a sighted hero).
    // do_wear.c:1466-1468 setworn(otmp, W_TOOL) then on_msg(). setworn sets
    // uprops[BLINDED].extrinsic |= W_TOOL through worn.c addSlotEffects.
    // do_wear.c:1470 Blind && !already_blind is TRUE, so changed = TRUE.
    // do_wear.c:1489-1491 toggle_blindness() fires.
    await initGame('blindfold', /* extraKeys */ 1);

    assert.equal(heroIsBlind(game), false,
        'hero starts sighted before putting on blindfold');

    const bf = syntheticEyewear(BLINDFOLD);
    await Blindf_on(bf, game);

    assert.equal(game.ublindf, bf,
        'blindfold is in the ublindf slot after Blindf_on');
    assert.equal(bf.owornmask & W_TOOL, W_TOOL,
        'blindfold has W_TOOL owornmask set');
    assert.equal(heroIsBlind(game), true,
        'hero is blind after putting on blindfold');
    // setworn sets BLINDED extrinsic through addSlotEffects.
    assert.equal(
        (game.u.uprops[BLINDED].extrinsic & W_TOOL), W_TOOL,
        'BLINDED extrinsic has W_TOOL bit set',
    );
});

test('Blindf_on with towel makes sighted hero blind', async () => {
    // Same path as blindfold. objects.h gives TOWEL the same oc_oprop (BLINDED)
    // as BLINDFOLD, so setworn sets the same extrinsic.
    await initGame('towel', /* extraKeys */ 1);

    assert.equal(heroIsBlind(game), false,
        'hero starts sighted before putting on towel');

    const tw = syntheticEyewear(TOWEL);
    await Blindf_on(tw, game);

    assert.equal(game.ublindf, tw,
        'towel is in the ublindf slot after Blindf_on');
    assert.equal(heroIsBlind(game), true,
        'hero is blind after putting on towel');
});

test('Blindf_on releases a wielded blindfold before wearing it', async () => {
    // do_wear.c1466 calls canonical remove_worn_item before setworn(W_TOOL).
    await initGame('blindfold', 1); // Dismiss on_msg before sight-loss feedback.
    const bf = syntheticEyewear(BLINDFOLD);
    bf.owornmask = W_WEP;
    game.uwep = bf;
    await Blindf_on(bf, game);
    assert.equal(game.uwep, null);
    assert.equal(game.ublindf, bf);
    assert.equal(bf.owornmask, W_TOOL);
    assert.equal(heroIsBlind(game), true);
});

// ---- toggle_blindness effects ----

test('Blindf_on sets disp.botl via toggle_blindness', async () => {
    // potion.c:341 disp.botl = TRUE. The flag requests a status-line redraw.
    await initGame('blindfold', /* extraKeys */ 1);

    game.disp.botl = false; // clear to observe the write
    const bf = syntheticEyewear(BLINDFOLD);
    await Blindf_on(bf, game);

    assert.equal(game.disp.botl, true,
        'disp.botl is set after Blindf_on');
});
