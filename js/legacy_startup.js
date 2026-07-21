// legacy_startup.js -- Opening story and its TTY text-window boundary.
// C refs: allmain.c newgame(); questpgr.c com_pager(), convert_line(), and
// deliver_by_window(); win/tty/wintty.c process_text_window() and dmore().

import { game } from './gstate.js';
import { nhgetch } from './input.js';
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
export function ttyLegacyLayout(display, lines, menuOverlay = true) {
    const maxrow = lines.length;
    const maxcol = Math.max(0, ...lines.map((line) => line.length + 1));
    let offx = Math.min(
        82,
        Math.floor(display.cols / 2),
        display.cols - maxcol - 1,
    );
    if (offx < 0) offx = 0;
    const fullScreen = maxrow >= display.rows || !menuOverlay;
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
        display.setCell(col, row, ' ', CLR_GRAY, 0);
}

function restoreDisplay(display, snapshot) {
    for (let row = 0; row < display.rows; ++row) {
        for (let col = 0; col < display.cols; ++col) {
            const cell = snapshot.grid[row][col];
            display.setCell(col, row, cell.ch, cell.color, cell.attr);
        }
    }
    display.setCursor(...snapshot.cursor);
}

export function renderTtyLegacyIntroduction(state = game) {
    const display = state.nhDisplay;
    if (!display)
        throw new Error('legacy introduction requires an initialized display');
    const lines = legacyIntroductionLines(state);
    const layout = ttyLegacyLayout(
        display,
        lines,
        state.iflags?.menu_overlay !== false,
    );
    if (layout.promptRow >= display.rows) {
        throw new Error('legacy introduction unexpectedly exceeds one tty page');
    }

    const snapshot = snapshotDisplay(display);
    if (layout.fullScreen) display.clearScreen();
    for (let row = 0; row < lines.length; ++row) {
        clearFrom(display, layout.offx, row);
        display.putstr(layout.textColumn, row, lines[row], NO_COLOR, 0);
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

export function dismissTtyLegacyIntroduction(state = game, rendered) {
    if (!rendered || !state.nhDisplay) return;
    // tty_dismiss_nhwindow() repairs a corner with docorner().  A full-screen
    // text window instead calls docrt()/flush_screen().  The story does not
    // change game state, so restoring this exact pre-page frame reproduces
    // both paths and preserves the immediate post-dismissal screen.
    restoreDisplay(state.nhDisplay, rendered.snapshot);
}

export async function ttyLegacyIntroduction(state = game) {
    if (!state.flags?.legacy) return false;
    const rendered = renderTtyLegacyIntroduction(state);
    for (;;) {
        const code = await nhgetch(state);
        // tty_nhgetch() maps NUL to Escape. xwaitforspace(quitchars) accepts
        // Space, CR, LF, or Escape and rings the bell for every other key.
        if (code === 0 || code === 27 || code === 32
            || code === 10 || code === 13) break;
    }
    dismissTtyLegacyIntroduction(state, rendered);
    return true;
}
