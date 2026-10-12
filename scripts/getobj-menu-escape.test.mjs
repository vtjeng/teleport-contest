import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadApplyPromptRecipe } from './run-apply-stethoscope.mjs';

test('getobj returns from the suggested inventory menu on Escape', async () => {
    // Reuse the checked-in independent Healer apply fixture, whose pack has
    // several suggested items and therefore opens a selection menu. The
    // extended command and menu keys exercise doapply -> getobj ->
    // display_pickinv without copying the admitted Wizard challenge recipe.
    const setup = loadApplyPromptRecipe().segments[0];
    await runSegment({
        ...setup,
        moves: '.#apply\n?\x1b',
    });

    // invent.c:getobj() treats Escape as a terminal cancellation: it prints
    // Never_mind and returns before asking for another object.
    assert.equal(game._pending_message, 'Never mind.');
});

test('getobj commits an empty suggested inventory menu on Enter', async () => {
    const setup = loadApplyPromptRecipe().segments[0];
    await runSegment({
        ...setup,
        moves: '.#apply\n?\n',
    });

    // invent.c:tty_select_menu returns NUL for Enter with no item selected;
    // getobj treats that as an empty result, not an Escape cancellation.
    assert.notEqual(game._pending_message, 'Never mind.');
});
