// worm.c detect_wsegs() glyph choice, pinned to its three source arms
// (worm.c:523-540): detected_monnum_to_glyph() when use_detection_glyph is
// set, petnum_to_glyph() for a tame worm, otherwise monnum_to_glyph(), each
// with the worm's gender and the species what_mon() chose once.
import assert from 'node:assert/strict';
import test from 'node:test';

import { wormTailGlyphInfo, wormTailSpeciesDraw } from '../js/display.js';
import {
    GLYPH_DETECT_FEM_OFF,
    GLYPH_MON_MALE_OFF,
    GLYPH_PET_FEM_OFF,
} from '../js/glyph_offsets.js';
import { resetGame } from '../js/gstate.js';
import { monst_globals_init, PM_LONG_WORM, PM_LONG_WORM_TAIL }
    from '../js/monsters.js';
import { initialize_symbols_from_options } from '../js/symbols.js';

function wormState() {
    const state = resetGame();
    state.flags = {};
    // No HALLUC property, so what_mon() keeps PM_LONG_WORM_TAIL.
    state.u = { uprops: [] };
    monst_globals_init(state);
    initialize_symbols_from_options({ flags: {} }, state);
    return state;
}

test('detect_wsegs() keeps the tail species without hallucination', () => {
    assert.equal(wormTailSpeciesDraw(wormState()), PM_LONG_WORM_TAIL);
});

test('detect_wsegs() picks the detected, pet or ordinary tail glyph', () => {
    const state = wormState();
    // An untamed male worm: monnum_to_glyph(), the arm map_monst() reaches.
    const worm = { data: state.mons[PM_LONG_WORM], female: 0, mtame: 0 };
    assert.equal(
        wormTailGlyphInfo(worm, PM_LONG_WORM_TAIL, false, state).glyph,
        GLYPH_MON_MALE_OFF + PM_LONG_WORM_TAIL);
    // A tame female worm (mtame 10, any nonzero value): petnum_to_glyph().
    const pet = { ...worm, female: 1, mtame: 10 };
    assert.equal(
        wormTailGlyphInfo(pet, PM_LONG_WORM_TAIL, false, state).glyph,
        GLYPH_PET_FEM_OFF + PM_LONG_WORM_TAIL);
    // use_detection_glyph is tested first, so it wins over tameness.
    assert.equal(
        wormTailGlyphInfo(pet, PM_LONG_WORM_TAIL, true, state).glyph,
        GLYPH_DETECT_FEM_OFF + PM_LONG_WORM_TAIL);
});
