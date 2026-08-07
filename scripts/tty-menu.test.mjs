import assert from 'node:assert/strict';
import test from 'node:test';

import { PICK_NONE } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import {
    encodeUtf8ByteString,
} from '../js/hacklib.js';
import { parseNethackrc } from '../js/options.js';
import { ttyPline } from '../js/tty_message.js';
import {
    displayTtyMenuTextWindow,
    dismissTtyMenu,
    renderTtyMenu,
    selectTtyMenu,
    ttyMenuLayout,
    ttyMenuTextData,
    ttyMenuTextLayout,
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

test('NHW_MENU text data keeps pre-wrap width and the split space', () => {
    const source = `${'A'.repeat(70)} ${'B'.repeat(20)}`;
    const data = ttyMenuTextData([source], 80);

    assert.equal(data.maxcol, source.length + 1);
    assert.deepEqual(data.lines, [
        `${'A'.repeat(70)} `,
        'B'.repeat(20),
    ]);

    const compressed = ttyMenuTextData([
        `  ${'C'.repeat(70)}     ${'D'.repeat(10)}\n  tail  `,
    ], 80);
    assert.equal(compressed.lines[0].startsWith('C'), true);
    assert.equal(compressed.lines.join('').includes('     '), false);
    assert.equal(compressed.lines.join('').endsWith('tail'), true);

    // strlen(str) == CO still enters compress_str(); a long line without a
    // newline distinguishes both terms of its source condition.
    const exactWidth = `  ${'E'.repeat(75)}   `;
    assert.equal(exactWidth.length, 80);
    assert.deepEqual(ttyMenuTextData([exactWidth], 80).lines, [
        'E'.repeat(75),
    ]);

    const longWithoutNewline = `  ${'F'.repeat(80)}     tail  `;
    assert.equal(
        ttyMenuTextData([longWithoutNewline], 80).lines.join('')
            .includes('     '),
        false,
    );

    // compress_str() reserves a byte for NUL in its BUFSZ-sized static
    // buffer, removing the last copied byte when it exactly fills the buffer.
    assert.equal(ttyMenuTextData(['G'.repeat(300)], 80).lines.join('').length,
        254);

    // n0 == CO is stored without entering tty_putstr()'s n0 > CO split arm.
    const fitsExactly = `${'H'.repeat(60)} ${'I'.repeat(18)}`;
    assert.equal(fitsExactly.length, 79);
    assert.deepEqual(ttyMenuTextData([fitsExactly], 80).lines, [fitsExactly]);
});

test('NHW_MENU text measures, truncates, and splits recorder bytes', () => {
    // These code points occupy two, three, and four UTF-8 bytes. Together
    // they distinguish byte strlen() from JavaScript code-unit length.
    const short = 'a caf\u00e9 \u20ac \ud83d\ude00';
    const shortBytes = encodeUtf8ByteString(short);
    const shortData = ttyMenuTextData([short], 80);
    assert.equal(shortData.maxcol, shortBytes.length + 1);
    assert.deepEqual(encodeUtf8ByteString(shortData.lines[0]), shortBytes);

    // Thirty-eight two-byte characters place the space at byte 76, before
    // tty_putstr()'s byte-79 search start, and leave a suffix after CO bytes.
    const long = `${'\u00e9'.repeat(38)} TAIL`;
    const longData = ttyMenuTextData([long], 80);
    assert.equal(longData.maxcol, encodeUtf8ByteString(long).length + 1);
    assert.deepEqual(
        longData.lines.map((line) => encodeUtf8ByteString(line)),
        [
            [...encodeUtf8ByteString('\u00e9'.repeat(38)), 0x20],
            encodeUtf8ByteString('TAIL'),
        ],
    );

    // The 253-byte ASCII prefix leaves two bytes of a three-byte code point
    // in compress_str()'s 255-byte copy limit. Its full-buffer rule removes
    // the second copied tail byte to reserve NUL, preserving 0xE2 alone.
    const truncated = `${'A'.repeat(253)}\u20ac`;
    const truncatedData = ttyMenuTextData([truncated], 80);
    const retained = encodeUtf8ByteString(truncatedData.lines.join(''));
    assert.equal(retained.length, 254);
    assert.deepEqual(retained.slice(-2), [0x41, 0xE2]);
});

test('NHW_MENU text uses H2344_BROKEN right-half geometry', () => {
    const state = menuState();
    const layout = ttyMenuTextLayout(state.nhDisplay, [
        'Things that are here:',
        'a dart',
        'a food ration',
    ]);

    assert.deepEqual(
        [
            layout.firstColumn,
            layout.lineColumn,
            layout.promptColumn,
            layout.promptRow,
            layout.maxcol,
        ],
        [40, 41, 41, 3, 22],
    );

    const terminalHeight = ttyMenuTextLayout(
        state.nhDisplay,
        Array.from({ length: 24 }, (_, index) => `line ${index}`),
    );
    assert.equal(terminalHeight.clearsScreen, true);
    assert.equal(terminalHeight.firstColumn, 0);

    const overlayDisabled = ttyMenuTextLayout(
        state.nhDisplay,
        ['Things that are here:', 'a dart'],
        false,
    );
    assert.equal(overlayDisabled.clearsScreen, true);
    assert.equal(overlayDisabled.firstColumn, 0);

    // An over-wide line can force offx to zero while overlay remains enabled.
    // C skips the initial clear in that case, then docrt() performs the full
    // repair at dismissal. This separates clearsScreen from fullRepair.
    const fullRepairWithoutClear = ttyMenuTextLayout(
        state.nhDisplay,
        [`${'\u00e9'.repeat(38)} TAIL`],
    );
    assert.equal(fullRepairWithoutClear.clearsScreen, false);
    assert.equal(fullRepairWithoutClear.fullRepair, true);
});

test('NHW_MENU text waits at --More-- and repairs through docorner',
    async () => {
        const state = menuState('x ');
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push({
            rows: Array.from({ length: 4 }, (_, row) => rowText(state, row)),
            cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        });

        assert.equal(await displayTtyMenuTextWindow(state, [
            'Things that are here:',
            'a dart',
            'a food ration',
        ]), ' '.charCodeAt(0));

        assert.equal(boundaries.length, 2);
        assert.deepEqual(boundaries[0], boundaries[1]);
        assert.deepEqual(boundaries[0], {
            rows: [
                `${' '.repeat(41)}Things that are here:`,
                `${' '.repeat(41)}a dart`,
                `${' '.repeat(41)}a food ration`,
                `${' '.repeat(41)}--More--`,
            ],
            // dmore() begins at layout column 41 and advances eight cells for
            // the complete source prompt, leaving the cursor at column 49 on
            // the fourth (zero-based row 3) line.
            cursor: [49, 3],
        });
        assert.equal(rowText(state, 4), 'NetHack, Copyright 1985-2026');
        assert.equal(rowText(state, 3), '');
    });

test('NHW_MENU text emits ASCII at recorder-byte columns', async () => {
    const state = menuState(' ');
    let boundary = null;
    state._preNhgetchHook = () => {
        const layout = ttyMenuTextLayout(state.nhDisplay, [
            'Things that are here:',
            'a \u00e9X \u20acY \ud83d\ude00Z',
            '\u00e9X',
        ]);
        boundary = {
            layout,
            row: state.nhDisplay.grid[1].map((cell) => cell.ch),
            leadingHighRow: state.nhDisplay.grid[2].map((cell) => cell.ch),
            style: {
                color: state.nhDisplay.grid[1][layout.lineColumn].color,
                attr: state.nhDisplay.grid[1][layout.lineColumn].attr,
            },
        };
    };

    await displayTtyMenuTextWindow(state, [
        'Things that are here:',
        // X, Y, and Z follow two-, three-, and four-byte code points. Their
        // columns pin curx's increment for each recorder byte.
        'a \u00e9X \u20acY \ud83d\ude00Z',
        // process_text_window() sends the first byte through g_putch().
        '\u00e9X',
    ]);

    const start = boundary.layout.lineColumn;
    assert.equal(boundary.row[start], 'a');
    assert.equal(boundary.row[start + 4], 'X');
    assert.equal(boundary.row[start + 9], 'Y');
    assert.equal(boundary.row[start + 15], 'Z');
    assert.deepEqual(boundary.style, { color: 8, attr: 0 });
    // Recorder patch 006 ignores these signed high-bit bytes after cl_end()
    // cleared the row, so each occupied byte column remains a plain space.
    for (const offset of [2, 3, 6, 7, 8, 11, 12, 13, 14])
        assert.equal(boundary.row[start + offset], ' ');
    // Recorder patch 006 strips the lead byte's high bit in g_putch(), ignores
    // the signed continuation byte, and emits X at byte offset two.
    assert.equal(boundary.leadingHighRow[start], 'C');
    assert.equal(boundary.leadingHighRow[start + 1], ' ');
    assert.equal(boundary.leadingHighRow[start + 2], 'X');
});

test('NHW_MENU text honors disabled overlays and refuses a paged boundary',
    async () => {
        const state = menuState(' ');
        state.iflags = { menu_overlay: false };
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push({
            first: rowText(state, 0),
            cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        });

        await displayTtyMenuTextWindow(state, [
            'Things that are here:',
            'a dart',
        ]);
        assert.deepEqual(boundaries, [{
            first: 'Things that are here:',
            // A clear-screen layout starts at column 0; dmore()'s menu offset
            // plus the eight-character prompt leaves column 9 on row 2.
            cursor: [9, 2],
        }]);

        const paged = menuState(' ');
        await assert.rejects(
            displayTtyMenuTextWindow(
                paged,
                Array.from({ length: 24 }, (_, index) => `line ${index}`),
            ),
            /paged tty menu text window is not supported/u,
        );
    });

test('NHW_MENU text dismisses a pending topline before drawing the window',
    async () => {
        // Two spaces dismiss the pending-message More and the menu More in
        // source order. The hook records both complete input boundaries.
        const state = menuState('  ');
        await ttyPline('A pending message.', state);
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push({
            first: rowText(state, 0),
            second: rowText(state, 1),
            cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        });

        await displayTtyMenuTextWindow(state, [
            'Things that are here:',
            'a caf\u00e9',
        ]);

        assert.equal(boundaries.length, 2);
        assert.deepEqual(boundaries[0], {
            first: 'A pending message.--More--',
            second: '',
            // Eighteen message bytes plus the eight-byte More prompt.
            cursor: [26, 0],
        });
        assert.equal(boundaries[1].first.endsWith('Things that are here:'), true);
        assert.equal(boundaries[1].second.endsWith('a caf'), true);
        assert.deepEqual(boundaries[1].cursor, [49, 2]);
        assert.equal(state.nhDisplay.inputQueueLength, 0);
    });

test('NHW_MENU text restores partial and full byte-window regions', async () => {
    for (const [label, overlay, line] of [
        // A short two-byte name retains the right-side overlay.
        ['partial', true, 'a caf\u00e9'],
        // Disabled overlays clear first and restore the complete display.
        ['full', false, 'a \u20ac and \ud83d\ude00'],
    ]) {
        const state = menuState(' ');
        state.iflags = { menu_overlay: overlay };
        // Row zero belongs to WIN_MESSAGE, so begin after the caller has
        // cleared it. Distinct attributes pin restoration as well as text.
        state.nhDisplay.clearRow(0);
        state.nhDisplay.setCell(17, 5, label[0], 2, 1);
        state.nhDisplay.setCursor(13, 7);
        const before = structuredClone(state.nhDisplay.grid);
        const cursorBefore = [
            state.nhDisplay.cursorCol,
            state.nhDisplay.cursorRow,
        ];

        await displayTtyMenuTextWindow(state, [
            'Things that are here:',
            line,
        ]);

        assert.deepEqual(state.nhDisplay.grid, before, label);
        if (!overlay) {
            assert.deepEqual(
                [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
                cursorBefore,
                label,
            );
        }
    }
});

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

// C ref: wintty.c process_menu_window() turns a page inside the window
// tty_display_nhwindow() already opened, so the base window
// tty_dismiss_nhwindow() repairs with docrt() is the one the first page
// covered, not the page a later one replaced.
test('a paged full-screen menu restores the frame its first page covered',
    () => {
        const state = menuState();
        state.nhDisplay.setCell(12, 5, '@', 3, 1);
        state.nhDisplay.setCursor(12, 5);
        // Two pages: 23 lines fill the first page and the title pair plus the
        // twenty-fourth line spill onto a second.
        const lines = Array.from({ length: 24 }, (_, i) => `line ${i}`);
        const spec = { title: 'Paged gameplay menu', lines };
        const first = renderTtyMenu(state, spec, 0);
        assert.equal(first.layout.pageCount, 2);
        assert.equal(first.layout.fullScreen, true);
        const second = renderTtyMenu(state, spec, 1, first);

        dismissTtyMenu(state, second);

        assert.deepEqual(
            [
                state.nhDisplay.grid[5][12].ch,
                state.nhDisplay.grid[5][12].color,
                state.nhDisplay.grid[5][12].attr,
            ],
            ['@', 3, 1],
        );
        assert.deepEqual(
            [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
            [12, 5],
        );
    });

// C ref: wintty.c tty_display_nhwindow()'s NHW_MENU arm (1921-1922).
test('a menu flushes an unacknowledged top line before it draws',
    async () => {
        // One space dismisses the pending-message More; 'y' answers the menu.
        const state = menuState(' y');
        await ttyPline('A pending message.', state);
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push(rowText(state, 0));

        await selectTtyMenu(state, confirmation);

        // The More boundary comes first, and the menu covers row 0 only after
        // the player has acknowledged it.
        assert.equal(boundaries.length, 2);
        assert.equal(boundaries[0], 'A pending message.--More--');
        assert.equal(boundaries[1].includes('--More--'), false);
        assert.equal(state.nhDisplay.inputQueueLength, 0);
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

test('PICK_NONE refuses every selection and ends only on a dismissal', async () => {
    // 'a' is a live selector, ':' opens the search prompt under PICK_ONE, and
    // '3' starts a count. process_menu_window() bells for the first two when
    // cw->how is PICK_NONE, so only the closing Escape ends the menu.
    const state = menuState('a:3');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push(rowText(state, 0).slice(41));

    assert.equal(await selectTtyMenu(state, {
        title: 'Synthetic display-only menu',
        titleAttr: 0,
        how: PICK_NONE,
        items: [{ selector: 'a', label: 'alpha', value: 'alpha' }],
        cancelValue: null,
    }), null);
    // The search prompt never replaced the menu's own first row, and the menu
    // was still up for each of the five keystrokes: the first Escape only
    // cancelled the pending count.
    assert.deepEqual(
        boundaries,
        new Array(5).fill('Synthetic display-only menu'),
    );
});

test('a highlighted line drops its style across a compressed space run', () => {
    // record-session.mjs turns every run of at least five spaces into
    // cursor-forward movement, which never carries the highlight; a shorter
    // run stays literal and keeps it.
    const state = menuState();
    const rendered = renderTtyMenu(state, {
        title: null,
        lines: [{ text: 'A    B     C', attr: 1 }],
    });
    const { startColumn } = rendered.layout;
    const attrs = [];
    for (let index = 0; index < 12; ++index)
        attrs.push(state.nhDisplay.grid[0][startColumn + index].attr);
    assert.deepEqual(attrs, [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1]);
    dismissTtyMenu(state, rendered);
});

// C ref: wintty.c tty_end_menu()'s accelerator loop. It runs over every
// stored line, including the prompt and its blank separator, so an item's
// letter depends on which page its line index falls on.
test('tty_end_menu assigns a fresh accelerator run to every page', () => {
    const state = menuState();
    // 24 terminal rows give lmax == 23. The prompt and its separator take the
    // first two lines, so 21 items finish page one and the 22nd opens page two.
    const items = [];
    for (let index = 0; index < 25; ++index)
        items.push({ text: `entry ${index}`, value: index + 1 });
    // A bare string is a display-only line, which consumes no letter.
    items.splice(3, 0, 'a plain line');
    const spec = { title: 'Pick some', items, overlay: false };

    const layout = ttyMenuLayout(state.nhDisplay, spec, 0);
    assert.equal(layout.pageSize, 23);
    assert.equal(layout.pageCount, 2);
    // The first item sits at line index 2 and takes 'a'.
    assert.equal(items[0].selector, 'a');
    assert.equal(items[2].selector, 'c');
    // The plain line takes none, so the item after it continues at 'd'.
    assert.equal(items[4].selector, 'd');
    // Line index 22 is the last of page one; line 23 opens page two at 'a'.
    // Three letters went to the items above the plain line, so the last item
    // on page one is 't' rather than 'u'.
    assert.equal(items[20].selector, 't');
    assert.equal(items[21].selector, 'a');
    assert.equal(items[25].selector, 'e');
    assert.equal(layout.lines[2].text, 'a - entry 0');

    // An item that arrives with its own selector keeps it and consumes no
    // letter, so its neighbours are unaffected.
    const explicit = [
        { text: 'help', value: 90, selector: '?' },
        { text: 'first', value: 1 },
    ];
    ttyMenuLayout(state.nhDisplay, { title: 'x', items: explicit, overlay: false });
    assert.equal(explicit[0].selector, '?');
    assert.equal(explicit[1].selector, 'a');
});
