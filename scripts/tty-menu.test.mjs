import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import { parseNethackrc } from '../js/options.js';
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

test('a full-screen gameplay menu restores its base frame on dismissal', () => {
    const state = menuState();
    state.nhDisplay.setCell(12, 5, '@', 3, 1);
    state.nhDisplay.setCell(30, 22, 'S', 4, 2);
    state.nhDisplay.setCursor(12, 5);
    const lines = Array.from({ length: 21 }, (_, index) => `line ${index}`);
    const rendered = renderTtyMenu(state, {
        title: 'Full-screen gameplay menu',
        lines,
    });

    dismissTtyMenu(state, rendered);

    assert.deepEqual(
        [
            state.nhDisplay.grid[5][12].ch,
            state.nhDisplay.grid[5][12].color,
            state.nhDisplay.grid[5][12].attr,
        ],
        ['@', 3, 1],
    );
    assert.deepEqual(
        [
            state.nhDisplay.grid[22][30].ch,
            state.nhDisplay.grid[22][30].color,
            state.nhDisplay.grid[22][30].attr,
        ],
        ['S', 4, 2],
    );
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [12, 5],
    );
});

test('state-parameterized menus read only their supplied display and hook', async () => {
    const globalState = menuState('y');
    const foreign = {
        nhDisplay: new GameDisplay(null),
        iflags: {},
        program_state: {},
    };
    foreign.nhDisplay.pushKey('n'.charCodeAt(0));
    const boundaries = [];
    globalState._preNhgetchHook = () => boundaries.push('global');
    foreign._preNhgetchHook = () => boundaries.push('foreign');

    assert.equal(await selectTtyMenu(foreign, confirmation), 2);
    assert.deepEqual(boundaries, ['foreign']);
    assert.equal(globalState.nhDisplay.inputQueueLength, 1);
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

test('an invalid PICK_ONE key preserves a pending count', async () => {
    // 12 proves that the invalid x remains inside xwaitforspace(): Escape
    // clears the accumulated count instead of cancelling the whole menu.
    const state = menuState('12x\x1bn');
    assert.equal(await selectTtyMenu(state, confirmation), 2);
});

test('mapped page commands paginate PICK_ONE and defaults remain available', async () => {
    const state = menuState('><#z');
    state.iflags = parseNethackrc(
        'OPTIONS=menu_next_page:#',
    ).iflags;
    const footers = [];
    state._preNhgetchHook = () => footers.push(
        Array.from({ length: state.nhDisplay.rows }, (_, row) => (
            rowText(state, row)
        )).find((line) => /\(\d+ of \d+\)$/u.test(line)),
    );
    const items = Array.from({ length: 22 }, (_, index) => ({
        selector: index === 21 ? 'z' : 'a',
        label: `choice ${index}`,
        value: index,
        selected: index === 0,
    }));

    const selected = await selectTtyMenu(state, {
        title: 'Synthetic paginated choice',
        titleAttr: 0,
        items,
        preselected: 0,
    });

    assert.equal(selected, 21);
    // '>' and '<' retain their defaults; the configured '#' alias is an
    // additional way to invoke MENU_NEXT_PAGE.
    assert.deepEqual(footers, [
        ' (1 of 2)',
        ' (2 of 2)',
        ' (1 of 2)',
        ' (2 of 2)',
    ]);
});

test('PICK_ONE explicit choices beat mappings and deselection updates markers', async () => {
    const explicit = menuState('#');
    explicit.iflags = parseNethackrc(
        'OPTIONS=menu_next_page:#',
    ).iflags;
    assert.equal(await selectTtyMenu(explicit, {
        title: 'Synthetic collision',
        titleAttr: 0,
        items: [{ selector: '#', label: 'literal hash', value: 'hash' }],
    }), 'hash');

    const grouped = menuState('#');
    grouped.iflags = parseNethackrc(
        'OPTIONS=menu_next_page:#',
    ).iflags;
    assert.equal(await selectTtyMenu(grouped, {
        title: 'Synthetic group collision',
        titleAttr: 0,
        items: [{
            selector: 'a', groupSelector: '#', label: 'alpha', value: 'a',
        }],
    }), 'a');

    const deselected = menuState('#\n');
    deselected.iflags = parseNethackrc(
        'OPTIONS=menu_deselect_all:#',
    ).iflags;
    const markers = [];
    deselected._preNhgetchHook = () => markers.push(
        rowText(deselected, 4).slice(41),
    );
    assert.equal(await selectTtyMenu(deselected, confirmation), 1);
    assert.deepEqual(markers, [
        'y * Yes; start game',
        'y - Yes; start game',
    ]);
});

test('PICK_ONE can expose an empty commit without changing startup defaults', async () => {
    const state = menuState('\n');
    assert.equal(await selectTtyMenu(state, {
        title: 'Synthetic empty choice',
        titleAttr: 0,
        items: [{ selector: 'a', label: 'alpha', value: 'alpha' }],
        emptyValue: 'rebuild',
    }), 'rebuild');
});
