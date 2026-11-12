// Pins js/display.js cmap_to_roguecolor() to display.c cmap_to_roguecolor()
// (2698-2719), which reset_glyphmap() uses under has_rogue_color.

import assert from 'node:assert/strict';
import test from 'node:test';

import { cmap_to_roguecolor } from '../js/display.js';
import {
    CLR_BROWN, CLR_GRAY, CLR_GREEN, CLR_MAGENTA, NO_COLOR,
} from '../js/terminal.js';
import {
    S_arrow_trap, S_corr, S_darkroom, S_hcdoor, S_litcorr, S_polymorph_trap,
    S_room, S_stone, S_upstair, S_vwall, S_water,
} from '../js/symbols.js';

// RogueEpyx on the Rogue level: gc.currentgraphics is ROGUESET (1) and its
// symset has 'Color: Yes', so nocolor is 0.
const colored = {
    gc: { currentgraphics: 1 },
    gs: { symset: [{ nocolor: 0 }, { nocolor: 0 }] },
};

test('walls and doors are brown, from S_vwall through S_hcdoor', () => {
    assert.equal(cmap_to_roguecolor(S_vwall, colored), CLR_BROWN);
    assert.equal(cmap_to_roguecolor(S_hcdoor, colored), CLR_BROWN);
});

test('traps are magenta, from S_arrow_trap through S_polymorph_trap', () => {
    assert.equal(cmap_to_roguecolor(S_arrow_trap, colored), CLR_MAGENTA);
    assert.equal(cmap_to_roguecolor(S_polymorph_trap, colored), CLR_MAGENTA);
});

test('corridors are gray; floor through water green except dark room', () => {
    assert.equal(cmap_to_roguecolor(S_corr, colored), CLR_GRAY);
    assert.equal(cmap_to_roguecolor(S_litcorr, colored), CLR_GRAY);
    assert.equal(cmap_to_roguecolor(S_room, colored), CLR_GREEN);
    // S_upstair lies between S_room and S_water in defsym order.
    assert.equal(cmap_to_roguecolor(S_upstair, colored), CLR_GREEN);
    assert.equal(cmap_to_roguecolor(S_water, colored), CLR_GREEN);
    assert.equal(cmap_to_roguecolor(S_darkroom, colored), NO_COLOR);
});

test('anything else, or a colorless active set, has no colour', () => {
    // S_stone precedes S_vwall and falls through every range.
    assert.equal(cmap_to_roguecolor(S_stone, colored), NO_COLOR);
    const colorless = {
        gc: { currentgraphics: 1 },
        gs: { symset: [{ nocolor: 0 }, { nocolor: 1 }] },
    };
    assert.equal(cmap_to_roguecolor(S_vwall, colorless), NO_COLOR);
});
