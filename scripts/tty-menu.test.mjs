import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import {
    dismissTtyMenu,
    renderTtyMenu,
    selectTtyMenu,
    ttyMenuLayout,
} from '../js/tty_menu.js';
import { renderTtyStartupBanner } from '../js/tty_startup.js';

function menuState(keys = '') {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    for (const ch of keys) game.nhDisplay.pushKey(ch.charCodeAt(0));
    renderTtyStartupBanner(game);
    return game;
}

function rowText(state, row) {
    return state.nhDisplay.grid[row].map((cell) => cell.ch).join('').trimEnd();
}

const confirmation = {
    title: 'Is this ok? [ynq]',
    lines: [
        'Pick the neutral female human Ranger',
        '',
        'y * Yes; start game',
        'n - No; choose role again',
        'q - Quit',
    ],
    choices: new Map([['y', 1], ['n', 2], ['q', -1]]),
    preselected: 1,
    cancelValue: -1,
};

test('narrow tty menus overlay the right half and restore it on dismissal', () => {
    const state = menuState();
    const layout = ttyMenuLayout(state.nhDisplay, confirmation);
    assert.deepEqual(
        [layout.firstColumn, layout.startColumn, layout.footerRow],
        [40, 41, 7],
    );

    const rendered = renderTtyMenu(state, confirmation);
    assert.equal(rowText(state, 0).slice(41), 'Is this ok? [ynq]');
    assert.equal(rowText(state, 2).slice(41),
        'Pick the neutral female human Ranger');
    assert.equal(rowText(state, 4).slice(41), 'y * Yes; start game');
    assert.equal(state.nhDisplay.grid[0][41].attr, 1);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [47, 7],
    );

    dismissTtyMenu(state, rendered);
    assert.equal(rowText(state, 4), 'NetHack, Copyright 1985-2026');
});

test('corner rendering reserves the extra docorner row until dismissal', () => {
    const state = menuState();
    const spec = confirmation;
    const layout = ttyMenuLayout(state.nhDisplay, spec);
    assert.equal(layout.fullScreen, false);

    // process_menu_window() clears item and footer rows, while the later
    // docorner(offx, maxrow + 1, 0) repair reaches one row farther.
    state.nhDisplay.setCell(layout.firstColumn, layout.maxrow, 'Z', 2, 1);
    const rendered = renderTtyMenu(state, spec);
    assert.equal(
        state.nhDisplay.grid[layout.maxrow][layout.firstColumn].ch,
        'Z',
    );

    dismissTtyMenu(state, rendered);
    assert.equal(
        state.nhDisplay.grid[layout.maxrow][layout.firstColumn].ch,
        'Z',
    );
});

test('a 24-row role menu becomes full-screen', () => {
    const state = menuState();
    const lines = Array.from({ length: 21 }, (_, index) => `line ${index}`);
    const spec = { title: 'Pick a role or profession', lines };
    const rendered = renderTtyMenu(state, spec);

    assert.equal(rendered.layout.fullScreen, true);
    assert.equal(rendered.layout.startColumn, 1);
    assert.equal(rowText(state, 0), ' Pick a role or profession');
    assert.equal(rowText(state, 23), ' (end)');
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [7, 23],
    );
});

test('PICK_ONE defaults, explicit selectors, and invalid keys follow tty', async () => {
    const state = menuState('x n');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push([
        rowText(state, 0),
        state.nhDisplay.cursorCol,
        state.nhDisplay.cursorRow,
    ]);

    const result = await selectTtyMenu(state, confirmation);

    assert.equal(result, 1);
    assert.equal(boundaries.length, 2);
    assert.deepEqual(boundaries[0], boundaries[1]);

    const explicit = menuState('n');
    assert.equal(await selectTtyMenu(explicit, confirmation), 2);
});

test('PICK_ONE MENU_SEARCH uses tty_getlin and immediately chooses a match', async () => {
    const state = menuState(':CHOOSE R?LE\n');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        top: rowText(state, 0),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });

    assert.equal(await selectTtyMenu(state, confirmation), 2);
    assert.deepEqual(boundaries[1], {
        top: 'Search for:',
        cursor: [12, 0],
    });
    assert.equal(boundaries.at(-1).top, 'Search for: CHOOSE R?LE');
    assert.equal(rowText(state, 4), 'NetHack, Copyright 1985-2026');

    // Search sees tty_add_menu()'s stored '-' marker even though this
    // preselected entry is initially rendered with '*'.
    const preselected = menuState(':y - yes\n');
    assert.equal(await selectTtyMenu(preselected, confirmation), 1);
});

test('an unmatched PICK_ONE search resumes the menu at its footer', async () => {
    const state = menuState(':missing\nn');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        top: rowText(state, 0),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });

    assert.equal(await selectTtyMenu(state, confirmation), 2);
    assert.deepEqual(boundaries.at(-1), {
        top: '',
        cursor: [47, 7],
    });
});

test('Escape clears a pending PICK_ONE count before it can cancel', async () => {
    // 12 is multi-digit so this covers both count accumulation and the
    // source rule that one Escape clears the whole pending count.
    const state = menuState('12\x1bn');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push(rowText(state, 0));

    assert.equal(await selectTtyMenu(state, confirmation), 2);
    assert.equal(boundaries.length, 4);
    assert.equal(boundaries[2], boundaries[3]);

    const nul = menuState('1\0n');
    assert.equal(await selectTtyMenu(nul, confirmation), 2);
});
