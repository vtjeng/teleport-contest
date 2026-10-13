// Source-pinned tests for the TTY message-history ring and its snapshot API.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeSession } from '../frozen/session_loader.mjs';
import {
    MSGTYP_NORMAL,
    NHW_MESSAGE,
    SUPPRESS_HISTORY,
    WIN_LOCKHISTORY,
} from '../js/const.js';
import { GLYPH_CMAP_STONE_OFF, GLYPH_UNEXPLORED_OFF } from '../js/glyph_offsets.js';
import { GameDisplay } from '../js/game_display.js';
import { game } from '../js/gstate.js';
import { ATR_INVERSE, CLR_RED, NO_COLOR } from '../js/terminal.js';
import { tty_create_nhwindow } from '../js/wintty.js';
import { docorner } from '../js/display.js';
import {
    addtopl,
    free_msghistory_snapshot,
    msghistory_snapshot,
    more,
    putsyms,
    remember_topl,
    tty_doprev_message,
    tty_getmsghistory,
    tty_putmsghistory,
    update_topl,
} from '../js/topl.js';
import {
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    ttyCustomPline,
} from '../js/tty_message.js';
import { runSegment } from '../js/jsmain.js';
import { QUEST_PAGER_OUTPUT } from '../js/questpgr.js';

const wrappedStartupRecording = normalizeSession(JSON.parse(readFileSync(
    new URL('../recordings/topl.c/wrapped-startup-topline.session.json', import.meta.url),
    'utf8',
)));
const TOPL_C = readFileSync(
    new URL('../nethack-c/upstream/win/tty/topl.c', import.meta.url), 'utf8',
);
const DISPLAY_C = readFileSync(
    new URL('../nethack-c/upstream/src/display.c', import.meta.url), 'utf8',
);
const DISPLAY_JS = readFileSync(
    new URL('../js/display.js', import.meta.url), 'utf8',
);
const QUESTPGR_C = readFileSync(
    new URL('../nethack-c/upstream/src/questpgr.c', import.meta.url), 'utf8',
);
const QUESTPGR_JS = readFileSync(
    new URL('../js/questpgr.js', import.meta.url), 'utf8',
);
const MONSTER_ACTIONS_JS = readFileSync(
    new URL('../js/unported_monster_actions.js', import.meta.url), 'utf8',
);

function historyState() {
    const state = {
        iflags: { msg_history: 20, cbreak: true },
        nhDisplay: new GameDisplay(null),
        program_state: {},
        wintty: { wins: [] },
    };
    tty_create_nhwindow(NHW_MESSAGE, state);
    return state;
}

test('quest pager sends synopsis history only through the live output route', () => {
    assert.match(QUESTPGR_C, /putmsghistory\(out_line, FALSE\)/u);
    assert.match(TOPL_C,
        /ttyDisplay->toplin == TOPLINE_NEED_MORE\)[\s\S]*?ttyDisplay->toplin = TOPLINE_NON_EMPTY/u);
    assert.match(QUESTPGR_JS, /await output\.history\?\.\(converted, state\)/u);
    assert.equal(typeof QUEST_PAGER_OUTPUT.history, 'function');
    assert.match(MONSTER_ACTIONS_JS,
        /const SILENT_QUEST_PAGER = Object\.freeze\(\{\s*pline:\s*async \(\) => \{\},\s*window:\s*async \(\) => \{\},\s*\}\)/u);
});

test('remember_topl advances the C message ring and respects its lock', () => {
    const state = historyState();
    const win = state.wintty.wins[state.wintty.messageWindow];
    state._ttyToplines = 'first';
    remember_topl(state);
    assert.equal(win.data[0], 'first');
    assert.equal(win.maxrow, 1);
    assert.equal(win.maxcol, 1);
    assert.equal(state._ttyToplines, '');

    win.flags |= WIN_LOCKHISTORY;
    state._ttyToplines = 'locked';
    remember_topl(state);
    assert.equal(win.data[1], null);
    assert.equal(state._ttyToplines, 'locked');
});

test('update_topl replaces stale pending text after an answered prompt', async () => {
    const state = historyState();
    // This exact answered query appears in the admitted fountain recording.
    const stalePrompt = 'Dry up fountain? [yn] (n) ';
    state._pending_message = stalePrompt;
    state._ttyToplines = stalePrompt;
    state.nhDisplay.toplines = stalePrompt;
    state.nhDisplay.toplin = TOPLINE_EMPTY;

    await update_topl('Someone removes your blindfold.', state, {
        msgtype: MSGTYP_NORMAL,
    });

    assert.equal(state._pending_message, 'Someone removes your blindfold.');
    assert.equal(state.nhDisplay.toplin, TOPLINE_NEED_MORE);
    assert.match(TOPL_C,
        /ttyDisplay->toplin == TOPLINE_NEED_MORE \|\| skip/u);
});

test('addtopl keeps the terminal cursor aligned while wrapping', () => {
    const state = historyState();
    const text = 'x'.repeat(81);

    addtopl(text, state);

    assert.deepEqual(state.nhDisplay.grid[0].slice(0, 79)
        .map((cell) => cell.ch), Array(79).fill('x'));
    assert.deepEqual(state.nhDisplay.grid[1].slice(0, 2)
        .map((cell) => cell.ch), ['x', 'x']);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow], [2, 1],
    );
    assert.match(TOPL_C, /if \(ttyDisplay->curx == CO - 1\)\s*topl_putsym\('\\n'\)/u);
    assert.match(TOPL_C, /void\s+addtopl\(const char \*s\)\s*\{[^}]*tty_curs\(BASE_WINDOW, cw->curx \+ 1, cw->cury\);[^}]*putsyms\(s\);[^}]*cl_end\(\);/su);
});

test('save snapshots read oldest first and restore puts prior-session lines first', () => {
    const state = historyState();
    state._ttyToplines = 'current session';
    remember_topl(state);
    state._ttyToplines = 'current topline';

    assert.deepEqual(msghistory_snapshot(false, state), [
        'current session', 'current topline',
    ]);
    assert.equal(
        tty_getmsghistory(true, state),
        'current session',
    );
    assert.equal(tty_getmsghistory(false, state), 'current topline');
    assert.equal(tty_getmsghistory(false, state), null);
    free_msghistory_snapshot(false, state);

    tty_putmsghistory('prior one', true, state);
    tty_putmsghistory('prior two', true, state);
    tty_putmsghistory(null, true, state);
    const win = state.wintty.wins[state.wintty.messageWindow];
    assert.deepEqual(win.data.slice(0, 3), [
        'prior one', 'prior two', 'current session',
    ]);
});

test('SUPPRESS_HISTORY shows feedback but keeps it out of Ctrl-P history', async () => {
    const state = historyState();
    state._ttyToplines = 'previous message';
    state.nhDisplay.toplines = 'previous message';

    await ttyCustomPline('Unknown command', SUPPRESS_HISTORY, state);

    const win = state.wintty.wins[state.wintty.messageWindow];
    assert.equal(win.data[0], 'previous message');
    assert.equal(win.maxrow, 1);
    assert.equal(state._ttyToplines, '');
    assert.equal(state._pending_message, 'Unknown command');
    assert.equal(state.nhDisplay.grid[0][0].ch, 'U');
    assert.equal(state.nhDisplay.grid[0][0].color, 8);
});

test('reversed history places the current topline before newest-to-oldest entries', async () => {
    const state = historyState();
    const win = state.wintty.wins[state.wintty.messageWindow];
    win.data[0] = 'oldest stored line';
    win.data[1] = 'newest stored line';
    win.maxrow = 2;
    win.maxcol = 2;
    state._ttyToplines = 'current topline';
    state.iflags.prevmsg_window = 'r';
    state.nhDisplay.pushKey(13);
    let menuFrame = '';
    state._preNhgetchHook = () => {
        menuFrame = state.nhDisplay.serialize();
    };

    await tty_doprev_message(state);

    const current = menuFrame.indexOf('current topline');
    const newest = menuFrame.indexOf('newest stored line');
    const oldest = menuFrame.indexOf('oldest stored line');
    assert.ok(current >= 0 && current < newest && newest < oldest, menuFrame);
});

test('combination history keeps looping across Ctrl-P More responses and clears dismiss_more', async () => {
    const state = historyState();
    const win = state.wintty.wins[state.wintty.messageWindow];
    win.data[0] = 'stored line that wraps '.repeat(5);
    win.maxrow = 1;
    win.maxcol = 1;
    state._ttyToplines = 'current line that wraps '.repeat(5);
    state.iflags.prevmsg_window = 'c';
    for (const key of [0x10, 0x10, 13]) state.nhDisplay.pushKey(key);

    await tty_doprev_message(state);

    assert.equal(state.nhDisplay.inputQueueLength, 0);
    assert.equal(state.nhDisplay.dismiss_more, 0);
    assert.equal(win.maxcol, 0);
});

test('non-single history is a no-op while the TTY is in a read', async () => {
    const state = historyState();
    const win = state.wintty.wins[state.wintty.messageWindow];
    win.maxrow = 3;
    win.maxcol = 1;
    state.iflags.prevmsg_window = 'f';
    state.nhDisplay.inread = 1;
    state.nhDisplay.dismiss_more = 7;
    state.nhDisplay.pushKey(13);

    await tty_doprev_message(state);

    assert.equal(win.maxcol, 1);
    assert.equal(state.nhDisplay.dismiss_more, 7);
    assert.equal(state.nhDisplay.inputQueueLength, 1);
});

test('more always writes its marker and honors standout on a blank topline',
    async () => {
        const state = historyState();
        state.flags = { standout: true };
        state.nhDisplay.setCursor(3, 1);
        state.nhDisplay.pushKey(32);

        let markerFrame = null;
        state._preNhgetchHook = () => {
            markerFrame = state.nhDisplay.grid[1].slice(3, 11);
        };
        await more(state);

        assert.deepEqual(markerFrame.map((cell) => cell.ch), [...'--More--']);
        assert.ok(markerFrame.every((cell) => cell.attr === ATR_INVERSE));
        assert.equal(state.nhDisplay.inmore, 0);
        assert.equal(state.nhDisplay.toplin, 0);
    });

test('wrapped Escape more redraws lower rows from the current glyph buffer',
    async () => {
        const state = historyState();
        const display = state.nhDisplay;
        state.flags = { standout: false };
        const message = 'wrapped TTY history message '.repeat(5);
        state._pending_message = message;
        state._ttyToplines = message;
        display.toplines = message;
        display.topMessage = message;
        display.toplin = 1;
        for (let column = 0; column < display.cols; ++column)
            display.setCell(column, 1, 'M', 0, 0);
        display.pushKey(27);

        let markerCell = null;
        state._preNhgetchHook = () => {
            markerCell = display.grid[1].find((cell) => cell.ch === '-');
        };
        await more(state);

        assert.equal(markerCell?.attr ?? 0, 0);
        assert.ok(display.grid[1].every((cell) => cell.ch === ' '));
        assert.equal(display.cursorCol, 0);
        assert.equal(display.cursorRow, 0);
        assert.equal(display.inmore, 0);
        assert.equal(display.toplin, 0);
        assert.equal(state._ttyMessageStopped, true);
    });

test('docorner skips an unexplored buffer glyph even when map memory is known',
    async () => {
        // The wrapped-startup recording initializes the full glyph map. Game
        // coordinate 27,0 maps to terminal column 26, row 1 in this fixture.
        const [segment] = wrappedStartupRecording.segments;
        await runSegment(segment);
        const state = game;
        const location = state.level.at(27, 0);
        location.remembered_glyph = { glyph: GLYPH_CMAP_STONE_OFF };
        location.disp_glyph = {
            glyph: GLYPH_UNEXPLORED_OFF,
            ch: '#',
            color: NO_COLOR,
            dec: false,
        };
        location.disp_ch = '#';
        location.disp_color = NO_COLOR;
        location.disp_decgfx = false;
        location.disp_attr = 0;
        // Seed the stale physical cell that docorner() must clear before its
        // source-ordered row_refresh() consults the live glyph number.
        state.nhDisplay.setCell(26, 1, '#', NO_COLOR, 0);

        docorner(1, 1, 0, state);

        assert.equal(state.nhDisplay.grid[1][26].ch, ' ');
        // C row_refresh() still prints an unexplored glyph when its valid map
        // cell has an active frame colour; this records that exceptional draw.
        state.iflags.bgcolors = true;
        state.gw = { wsettings: { map_frame_color: CLR_RED } };
        const setCell = state.nhDisplay.setCell.bind(state.nhDisplay);
        const painted = [];
        state.nhDisplay.setCell = (column, row, ...cell) => {
            if (column === 26 && row === 1) painted.push(cell);
            return setCell(column, row, ...cell);
        };
        docorner(1, 1, 0, state);
        assert.equal(painted.length, 1);
        assert.equal(painted[0][0], ' ');
        assert.match(TOPL_C,
            /case '\\n':\s*cl_end\(\);\s*ttyDisplay->curx = 0;\s*ttyDisplay->cury\+\+/u);
        assert.match(DISPLAY_C,
            /if \(force \|\| glyph != GLYPH_UNEXPLORED\s*\|\| bkglyphinfo\.framecolor != NO_COLOR\)/u);
        assert.match(DISPLAY_JS,
            /const glyph = loc\.disp_glyph\?\.glyph \?\? GLYPH_UNEXPLORED_OFF/u);
    });

test('putsyms stops at the first embedded NUL like the C byte-string loop', () => {
    const state = historyState();
    putsyms('ab\0cd', state);

    assert.equal(state.nhDisplay.grid[0][0].ch, 'a');
    assert.equal(state.nhDisplay.grid[0][1].ch, 'b');
    assert.equal(state.nhDisplay.grid[0][2].ch, ' ');
    assert.equal(state.nhDisplay.cursorCol, 2);
});

test('wrapped startup topline reproduces the committed C recording', async () => {
    // This two-step C recording exposes a cleared blank between map glyphs;
    // retaining its exact screens, cursors and RNG calls catches default-color
    // drift that a newly recorded C recipe would not detect.
    const [segment] = wrappedStartupRecording.segments;
    const replay = await runSegment(segment);

    assert.deepEqual(
        replay.getScreens(),
        segment.steps.map(({ screen }) => screen),
    );
    assert.deepEqual(
        replay.getCursors(),
        segment.steps.map(({ cursor }) => cursor),
    );
    const normalizeRng = (entry) => String(entry)
        .replace(/\s*@\s.*$/u, '')
        .replace(/^\d+\s+/u, '')
        .trim();
    assert.deepEqual(
        replay.getRngLog().map(normalizeRng),
        segment.steps.flatMap(({ rng }) => rng).map(normalizeRng),
    );
});
