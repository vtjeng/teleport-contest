// legacy_startup.js -- Opening story and its TTY text-window boundary.
// C refs: allmain.c newgame(); questpgr.c com_pager(), convert_line(), and
// deliver_by_window(); win/tty/wintty.c process_text_window() and dmore().

import { game } from './gstate.js';
import {
    menuOverlay,
    restoreCorner,
    writeTextWindowLine,
} from './tty_menu.js';
import { convertLine, initializeQuestPagerLua } from './questpgr.js';
import { QUEST_TEXT_DATA } from './quest_text_data.js';
import { tty_putmsghistory } from './topl.js';
import {
    clearTtyMessageWindow,
    dismissPendingTtyMessage,
    xwaitforspace,
} from './tty_message.js';
import { TOPLINE_EMPTY, TOPLINE_NEED_MORE } from './const.js';
import { rn2 } from './rng.js';
import { rankOf } from './roles.js';
import { CLR_GRAY, NO_COLOR } from './terminal.js';

const MORE_PROMPT = '--More--';

// dat/quest.lua questtext.common.legacy.text
const LEGACY_TEXT = Object.freeze([
    'It is written in the Book of %d:',
    '',
    '    After the Creation, the cruel god Moloch rebelled',
    '    against the authority of Marduk the Creator.',
    '    Moloch stole from Marduk the most powerful of all',
    '    the artifacts of the gods, the Amulet of Yendor,',
    '    and he hid it in the dark cavities of Gehennom, the',
    '    Under World, where he now lurks, and bides his time.',
    '',
    'Your %G %d seeks to possess the Amulet, and with it',
    'to gain deserved ascendance over the other gods.',
    '',
    'You, a newly trained %r, have been heralded',
    'from birth as the instrument of %d.  You are destined',
    'to recover the Amulet for your deity, or die in the',
    'attempt.  Your hour of destiny has come.  For the sake',
    'of us all:  Go bravely with %d!',
]);

// dat/quest.lua questtext.common.pauper_legacy.text
const PAUPER_LEGACY_TEXT = Object.freeze([
    'It is written in the Book of %d:',
    '',
    '    After the Creation, the cruel god Moloch rebelled',
    '    against the authority of Marduk the Creator.',
    '    Moloch stole from Marduk the most powerful of all',
    '    the artifacts of the gods, the Amulet of Yendor,',
    '    and he hid it in the dark cavities of Gehennom, the',
    '    Under World, where he now lurks, and bides his time.',
    '',
    'Your %G %d seeks to possess the Amulet, and with it',
    'to gain deserved ascendance over the other gods.',
    '',
    'You, an untrained %r, have been unable to adequately',
    'prepare to be the instrument of %d.  Nevertheless, you',
    'are destined to recover the Amulet for your deity, or die',
    'in the attempt.  Your hour of destiny has come.  For the',
    'sake of us all:  Go bravely with %d!',
]);

function originalAlignment(state) {
    // include/you.h: A_ORIGINAL is slot 1; slot 0 is A_CURRENT and can
    // change after an alignment conversion.
    return state.u?.ualignbase?.[1] ?? state.u?.ualign?.type ?? 0;
}

function rawAlignedGodName(state) {
    const role = state.urole ?? {};
    const alignment = originalAlignment(state);
    return alignment > 0
        ? role.lgod : alignment < 0 ? role.cgod : role.ngod;
}

function convertLegacyLine(state, line) {
    const godName = rawAlignedGodName(state);
    const replacements = {
        d: String(godName ?? 'someone').replace(/^_/u, ''),
        G: String(godName ?? '').startsWith('_') ? 'goddess' : 'god',
        r: rankOf(
            state.urole,
            state.u?.ulevel ?? 1,
            Boolean(state.flags?.female),
        ) ?? 'adventurer',
    };
    return line.replace(/%([dGr])/gu, (_match, key) => replacements[key]);
}

export function legacyIntroductionLines(state = game) {
    const template = state.u?.uroleplay?.pauper
        ? PAUPER_LEGACY_TEXT : LEGACY_TEXT;
    return template.map((line) => convertLegacyLine(state, line));
}

// deliver_by_window() uses NHW_MENU without start_menu()/end_menu().  Its
// buffered lines therefore flow through process_text_window(), not the menu
// selection renderer in tty_menu.js.
export function ttyLegacyLayout(state, lines) {
    const display = state.nhDisplay;
    const maxrow = lines.length;
    const maxcol = Math.max(0, ...lines.map((line) => line.length + 1));
    let offx = Math.min(
        82,
        Math.floor(display.cols / 2),
        display.cols - maxcol - 1,
    );
    if (offx < 0) offx = 0;
    const fullScreen = maxrow >= display.rows || !menuOverlay(state);
    if (fullScreen) offx = 0;
    return {
        offx,
        maxcol,
        maxrow,
        fullScreen,
        textColumn: offx ? offx + 1 : 0,
        promptColumn: offx + 1,
        promptRow: maxrow,
    };
}

function snapshotDisplay(display) {
    return {
        grid: display.grid.map((row) => row.map((cell) => ({ ...cell }))),
        cursor: [display.cursorCol, display.cursorRow],
    };
}

function clearFrom(display, column, row) {
    if (row < 0 || row >= display.rows) return;
    for (let col = Math.max(0, column); col < display.cols; ++col)
        display.clearCell(col, row, CLR_GRAY);
}

function restoreDisplay(display, snapshot) {
    for (let row = 0; row < display.rows; ++row) {
        for (let col = 0; col < display.cols; ++col) {
            display.restoreCell(col, row, snapshot.grid[row][col]);
        }
    }
    display.setCursor(...snapshot.cursor);
}

export function renderTtyLegacyIntroduction(state = game) {
    const display = state.nhDisplay;
    if (!display)
        throw new Error('legacy introduction requires an initialized display');
    const lines = legacyIntroductionLines(state);
    const layout = ttyLegacyLayout(state, lines);
    if (layout.promptRow >= display.rows) {
        throw new Error('legacy introduction unexpectedly exceeds one tty page');
    }

    // wintty.c tty_display_nhwindow() 1930-1941: a full-screen window
    // clears the screen and empties the top line; an overlaid one clears the
    // message window first, so an answered prompt such as the reroll y_n()
    // neither shows beside the text nor returns when the snapshot is restored.
    if (layout.fullScreen) display.toplin = TOPLINE_EMPTY;
    else clearTtyMessageWindow(state);
    const snapshot = snapshotDisplay(display);
    if (layout.fullScreen) display.clearScreen();
    for (let row = 0; row < lines.length; ++row) {
        clearFrom(display, layout.offx, row);
        writeTextWindowLine(
            state, layout.textColumn, row, lines[row], NO_COLOR, 0,
        );
    }
    clearFrom(display, layout.offx, layout.promptRow);
    display.putstr(
        layout.promptColumn,
        layout.promptRow,
        MORE_PROMPT,
        NO_COLOR,
        0,
    );
    display.setCursor(
        layout.promptColumn + MORE_PROMPT.length,
        layout.promptRow,
    );
    return { layout, snapshot };
}

export async function dismissTtyLegacyIntroduction(state = game, rendered) {
    if (!rendered || !state.nhDisplay) return;
    const { layout, snapshot } = rendered;
    // wintty.c erase_menu_or_text() (966-984): a column-zero window calls
    // docrt() and flush_screen(1).  The story does not change game state, so
    // restoring this exact pre-page frame reproduces that redraw.  A fixture
    // with no map has nothing for docorner() to redraw either.
    if (layout.offx === 0 || !state.level || !state.u?.ux) {
        restoreDisplay(state.nhDisplay, snapshot);
        return;
    }
    // A corner window calls docorner(offx, maxrow + 1, 0) instead: cl_end()
    // from column offx - 1 on rows 0..maxrow, then display.c row_refresh(),
    // which leaves every GLYPH_UNEXPLORED cell blank even when S_unexplored
    // is not a space.  The covered frame therefore does not come back.
    const repairColumn = layout.offx - 1;
    await restoreCorner(
        state,
        state.nhDisplay,
        repairColumn,
        snapshot.grid.slice(0, layout.promptRow + 1)
            .map((row) => row.slice(repairColumn)),
    );
}

export async function ttyLegacyIntroduction(state = game, random = rn2) {
    if (!state.flags?.legacy) return false;
    initializeQuestPagerLua(random, state);
    // wintty.c tty_display_nhwindow() 1921-1922: an unacknowledged message
    // gets its --More-- before the text window covers it.  The NHW_MESSAGE
    // arm (1874-1877) then clears the top line; restoring NEED_MORE lets
    // clearTtyMessageWindow() erase it, as tty_menu.js does for menus.
    const display = state.nhDisplay;
    if (display?.toplin === TOPLINE_NEED_MORE
        && !state._ttyMessageStopped
        && await dismissPendingTtyMessage(state)) {
        display.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    }
    const rendered = renderTtyLegacyIntroduction(state);
    // dmore(cw, quitchars): Space, CR, LF or Escape dismisses the window,
    // and Escape stores 1 in ttyDisplay->dismiss_more.
    await xwaitforspace(state);
    await dismissTtyLegacyIntroduction(state, rendered);
    // C ref: questpgr.c com_pager_core() 597-609.  After the window, the
    // converted synopsis goes into message history for ^P recall without
    // being delivered as a message.
    const msgid = state.u?.uroleplay?.pauper ? 'pauper_legacy' : 'legacy';
    tty_putmsghistory(
        convertLine(QUEST_TEXT_DATA.common[msgid].synopsis, state),
        false,
        state,
    );
    return true;
}
