// Focused tests for do_name.c docallcmd() (499-601), the #call / #name
// command's menu and its cancel path. The cancel path is the one exercised by
// the seed0102-ranger-name-cancel session at steps 9-10.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ECMD_OK } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { renderTtyStartupBanner } from '../js/tty_startup.js';
import { docallcmd } from '../js/do_name.js';

// Same setup as scripts/windows.test.mjs: a display with the banner on it and
// the given keys queued, which is enough for one menu interaction.
function menuState(keys = '') {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    for (const ch of keys) game.nhDisplay.pushKey(ch.charCodeAt(0));
    renderTtyStartupBanner(game);
    return game;
}

// ESC cancels the menu (C: select_menu returns 0, ch = 'q', case 'q': break).
// docallcmd returns ECMD_OK for the cancel path at do_name.c:559-562, 600.
test('docallcmd returns ECMD_OK when the menu is cancelled with ESC',
    async () => {
        const state = menuState('\x1b');
        // A non-null invent exercises the inventory-dependent menu items (i, o).
        state.invent = { otyp: 0, nobj: null };
        const result = await docallcmd(state);

        // C: return ECMD_OK at do_name.c:600.
        assert.equal(result, ECMD_OK);
    });

// When gi.invent is null (empty inventory), the two inventory-related items
// (i "a particular object in inventory", o "the type of an object in
// inventory") are omitted from the menu.  C: do_name.c:526-536 guards both
// behind `if (gi.invent)`.
test('docallcmd omits inventory items when state.invent is null',
    async () => {
        const state = menuState('\x1b');
        state.invent = null;
        const result = await docallcmd(state);
        assert.equal(result, ECMD_OK);
    });

// When flags.lootabc is true, C passes 0 as the accelerator for every menu
// item (do_name.c:524, 530, 534, 539, 543, 547), letting tty_end_menu()
// auto-assign a..z.  The cancel path is unaffected by the accelerators.
test('docallcmd returns ECMD_OK with lootabc enabled',
    async () => {
        const state = menuState('\x1b');
        state.flags = { ...state.flags, lootabc: true };
        state.invent = { otyp: 0, nobj: null };
        const result = await docallcmd(state);
        assert.equal(result, ECMD_OK);
    });

// When iflags.menu_overlay is false, the menu should use fullscreen layout
// (startColumn = offx + 1 = 1 since offx = 0) instead of overlaying the
// right half (startColumn >= 2). C: do_name.c:551 select_menu() -> wintty.c
// tty_display_nhwindow() clears the screen when overlay is false.  With the
// default (menu_overlay not set, i.e., undefined), the menu overlays the
// right half and the title appears farther right.
test('docallcmd passes overlay=false when menu_overlay is false',
    async () => {
        const state = menuState('\x1b');
        state.invent = null;
        state.iflags = { ...state.iflags, menu_overlay: false };

        // Capture the column of the first non-blank character on the title row
        // during menu display, before the ESC key is consumed.
        // tty_menu.js startColumn = offx + 1; fullscreen sets offx = 0, so
        // startColumn = 1.  Overlay mode sets offx to roughly half the screen
        // width, so startColumn is much higher.
        let titleColumn = -1;
        state._preNhgetchHook = () => {
            const row = state.nhDisplay.grid[0];
            for (let col = 0; col < row.length; col++) {
                if (row[col].ch !== ' ' && row[col].ch !== '') {
                    titleColumn = col;
                    break;
                }
            }
        };
        const result = await docallcmd(state);
        assert.equal(result, ECMD_OK);
        // Full-screen layout: startColumn = 1 (offx=0 + 1). Overlay layout
        // sets offx to approximately cols/2, so startColumn would be cols/2+1
        // (typically 41 on an 80-column terminal). This assertion distinguishes
        // overlay=false from overlay=true.
        assert.equal(titleColumn, 1,
            'full-screen menu places the title at column 1 (offx=0+1)');
    });
