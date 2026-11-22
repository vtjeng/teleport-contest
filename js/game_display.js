// game_display.js — NetHack-specific display wrapper around Terminal.
// Edit freely; the contest only freezes isaac64.js and terminal.js.
//
// Adds game state properties (topMessage, toplin) and
// message window handling. Delegates all terminal operations to
// the wrapped Terminal instance.
//
// Usage:
//   const terminal = new Terminal('game-container');
//   const display = new GameDisplay(terminal);
//   // display.putch, display.readKey etc. delegate to terminal
//   // display.topMessage is NetHack-specific

import {
    Terminal,
    NO_COLOR,
    ATR_INVERSE,
    ATR_UNDERLINE,
} from './terminal.js';
import { nomux_putch_byte } from './termcap.js';

const TOPLINE_EMPTY = 0;

// Attributes that paint a space: frozen/screen-decode.mjs SPACE_VISIBLE_ATTRS.
const SPACE_VISIBLE_ATTRS = ATR_INVERSE | ATR_UNDERLINE;

function visibleCell(cell) {
    return cell.ch !== ' ' || (cell.attr & SPACE_VISIBLE_ATTRS) !== 0;
}

// NetHack color (0..15) to ANSI foreground code; NO_COLOR (8) is 39, the
// default. CLR_BLACK (0) is the default too, as the recorder captures it:
// patch 006's nomux_start_fg(), which every tty term_start_color() reaches,
// stores it as 8 when use_darkgray is on, and nomux_capture_screen() reads
// a stored 0 as the default foreground otherwise. CLR_GRAY (7) is the
// default as well: nomux_capture_screen() starts every row at foreground 7
// and writes a change to 7 as SGR 39, never 37 (and on a terminal
// termcap.c init_hilite() gives hilites[CLR_GRAY] the empty string). Either
// way frozen/screen-decode.mjs reads the cell back as NO_COLOR, so no C
// screen ever holds color 0 or 7, and a caller may store the colour C
// passes to term_start_color() without converting it.
function colorToFg(color) {
    if (color === 0 || color === 7 || color === 8 || color < 0 || color > 15)
        return 39;
    return color < 8 ? 30 + color : 90 + (color - 8);
}

// The SGR sequence that moves from (curFg, curAttr) to (wantFg, wantAttr),
// or '' when none is needed.
function sgrTransition(curFg, curAttr, wantFg, wantAttr) {
    if (curFg === wantFg && curAttr === wantAttr) return '';
    const wantBold = (wantAttr & 2) !== 0;
    const wantUnder = (wantAttr & 4) !== 0;
    const wantInv = (wantAttr & 1) !== 0;
    const curBold = (curAttr & 2) !== 0;
    const curUnder = (curAttr & 4) !== 0;
    const curInv = (curAttr & 1) !== 0;
    // Clearing any attribute needs a full reset.
    const needReset = (curBold && !wantBold) || (curUnder && !wantUnder)
        || (curInv && !wantInv);
    const codes = [];
    if (needReset) {
        codes.push(0);
        if (wantBold) codes.push(1);
        if (wantUnder) codes.push(4);
        if (wantInv) codes.push(7);
        if (wantFg !== 39) codes.push(wantFg);
    } else {
        if (wantBold && !curBold) codes.push(1);
        if (wantUnder && !curUnder) codes.push(4);
        if (wantInv && !curInv) codes.push(7);
        if (wantFg !== curFg) codes.push(wantFg);
    }
    return codes.length ? `\x1b[${codes.join(';')}m` : '';
}

export class GameDisplay {
    constructor(terminalOrContainerId) {
        // Accept either a Terminal instance or a container ID (backward compat)
        if (terminalOrContainerId instanceof Terminal) {
            this.terminal = terminalOrContainerId;
        } else {
            this.terminal = new Terminal(
                terminalOrContainerId != null ? terminalOrContainerId : null,
                { rows: 24, cols: 80 }
            );
        }

        // Recorder patch 006 tracks tty_raw_print() output with its own row
        // and column, because ttyDisplay -- the struct whose curx and cury the
        // capture normally reads -- does not exist before
        // tty_init_nhwindows() or after exit_nhwindows().  `active` remains
        // sticky because it selects the recorder cursor for the rest of the
        // process.  `rawprint` is separate: it models C's
        // ttyDisplay->rawprint counter, which each tty_raw_print call raises
        // and a window display or tty_wait_synch clears.
        this.nomuxRaw = { active: false, rawprint: 0, row: 0, col: 0 };

        // C ref: windows.c nhwindows_hangup() (614-640) sets `windowprocs` to
        // hup_procs, whose output routines draw nothing.  hangup() is the one
        // caller; nothing switches the procedures back for the rest of the
        // process.  Every terminal write below goes through this class, so
        // these methods are where the swap takes effect.
        this.windowprocsHup = false;
        // C ref: wintty.c tty_exit_nhwindows() (863-864) frees ttyDisplay
        // under FREE_ALL_MEMORY, which include/config.h defines; recorder
        // patch 006 nomux_get_cursor() then reports 0,0 until raw output.
        this.ttyDisplayFreed = false;

        // NetHack-specific message state
        this.topMessage = null;
        this.messages = [];
        this.toplin = TOPLINE_EMPTY;
    }

    // --- Delegate all Terminal properties and methods ---

    get rows() { return this.terminal.rows; }
    get cols() { return this.terminal.cols; }
    get grid() { return this.terminal.grid; }
    get cursorCol() { return this.terminal.cursorCol; }
    set cursorCol(v) { if (!this.windowprocsHup) this.terminal.cursorCol = v; }
    get cursorRow() { return this.terminal.cursorRow; }
    set cursorRow(v) { if (!this.windowprocsHup) this.terminal.cursorRow = v; }
    get cursorVisible() { return this.terminal.cursorVisible; }
    set cursorVisible(v) {
        if (!this.windowprocsHup) this.terminal.cursorVisible = v;
    }
    get spans() { return this.terminal.spans; }
    get container() { return this.terminal.container; }
    get flags() { return this.terminal.flags; }
    set flags(v) { this.terminal.flags = v; }

    // C ref: windows.c nhwindows_hangup(). From here on the hup_procs
    // output routines are no-ops, so the screen keeps what it showed.
    hangup() { this.windowprocsHup = true; }

    // Display methods
    //
    // Game code writes a terminal cell only through the writers below, each
    // named for the rule recorder patch 006 (nethack-c/patches/
    // 006-nomux-capture.patch) applies to the C output it ports: putch() and
    // putstr() for a char, putCaptured() for a byte some other hook already
    // decided, clearCell(), clearRow() and clearScreen() for an erase, and
    // restoreCell() for a cell the screen already showed. setCell() itself is
    // for this class and for tests; scripts/cell-writer.test.mjs fails when
    // code in js/ calls it, or reaches the terminal some other way.
    setCell(col, row, ch, color, attr) {
        if (this.windowprocsHup) return undefined;
        return this.terminal.setCell(col, row, ch, color, attr);
    }
    // C's putchar(c) of a `char`, followed by recorder patch 006's
    // nomux_putch(c): topl_putsym(), tty_putstr(), tty_putsym(), dmore(),
    // tty_putstatusfield() and the menu and text window loops. The char is
    // signed on the recorder's x86-64 build, so a high byte arrives negative
    // and, like a control byte, leaves the shadow cell as it was
    // (termcap.js nomux_putch_byte()). `ch` is one
    // byte as a one-character string; a code unit above 0xFF is not a byte
    // and is left out the same way. Returns true when the cell was written.
    putch(col, row, ch, color = NO_COLOR, attr = 0) {
        const stored = nomux_putch_byte(String(ch).charCodeAt(0));
        if (stored === null) return false;
        this.setCell(col, row, String.fromCharCode(stored), color, attr);
        return true;
    }
    // tty_putstr() and dmore() print a string a char at a time, each through
    // the hook putch() models.
    putstr(col, row, str, color = NO_COLOR, attr = 0) {
        const text = String(str);
        for (let i = 0; i < text.length && col + i < this.cols; ++i)
            this.putch(col + i, row, text[i], color, attr);
    }
    // A cell whose captured character the caller has already worked out
    // under a hook other than putch()'s: g_putch(), which strips the high
    // bit (termcap.js nomux_g_putch_byte()), a hook given an int, which
    // stores a high byte, or nomux_raw_putch(). `ch` may be the rendering
    // the scorer reads for that byte, such as a DEC line-drawing character.
    // scripts/cell-writer.test.mjs pins every caller.
    putCaptured(col, row, ch, color = NO_COLOR, attr = 0) {
        return this.setCell(col, row, ch, color, attr);
    }
    // One cell of an erase: cl_end(), cl_eos(), term_clear_screen() or
    // docorner(). CLR_GRAY is kept only where a caller already stored it.
    clearCell(col, row, color = NO_COLOR) {
        return this.setCell(col, row, ' ', color, 0);
    }
    // Put back a cell copied from this screen's grid, such as one a window
    // covered or one a full rebuild cleared before reprojecting it. Nothing
    // is printed in C, so no capture rule applies.
    restoreCell(col, row, cell) {
        return this.setCell(col, row, cell.ch, cell.color, cell.attr);
    }
    setCursor(col, row) {
        if (this.windowprocsHup) return undefined;
        return this.terminal.setCursor(col, row);
    }
    // C's TTY clear operations leave the terminal's default foreground active.
    // The recorder shadow grid stores that as fg=7; its serializer emits no
    // color change because 7 is the terminal's initial foreground. Store the
    // same default explicitly here instead of Terminal's CLR_GRAY, which
    // GameDisplay.serialize() would encode as an observable [37m transition.
    clearScreen() {
        for (let row = 0; row < this.rows; ++row) this.clearRow(row);
        this.setCursor(0, 0);
    }
    clearRow(row) {
        for (let column = 0; column < this.cols; ++column)
            this.clearCell(column, row);
    }
    scrollUp() {
        if (this.windowprocsHup) return undefined;
        return this.terminal.scrollUp();
    }
    moveCursor(x, y) {
        if (this.windowprocsHup) return undefined;
        return this.terminal.moveCursor(x, y);
    }
    getChar(x, y) { return this.terminal.getChar(x, y); }
    clearToEol() {
        if (this.windowprocsHup) return undefined;
        return this.terminal.clearToEol();
    }
    cursSet(visibility) {
        if (this.windowprocsHup) return undefined;
        return this.terminal.cursSet(visibility);
    }
    flush() { return this.terminal.flush?.(); }
    getPreElement() { return this.terminal.getPreElement(); }
    getCanvas() { return this.terminal.getCanvas?.(); }
    colorToCss(color) { return this.terminal.colorToCss(color); }
    captureForShell() { return this.terminal.captureForShell(); }

    // Input methods — delegate to terminal with NetHack-specific defaults
    pushKey(code) { return this.terminal.pushKey(code); }
    clearInputQueue() { return this.terminal.clearInputQueue(); }
    get isWaitingForInput() { return this.terminal.isWaitingForInput; }
    get inputQueueLength() { return this.terminal.inputQueueLength; }
    get waitEpoch() { return this.terminal.waitEpoch; }

    /**
     * Read a key with NetHack-specific options bundled.
     * Apps set keyMapper, onInterrupt, onEmptyQueue on GameDisplay;
     * these are passed through to terminal.readKey on every call.
     */
    readKey(extraOptions) {
        return this.terminal.readKey({
            keyMapper: this.keyMapper,
            onInterrupt: this.onInterrupt,
            onEmptyQueue: this.onEmptyQueue,
            ...extraOptions,
        });
    }

    /** NetHack key mapper — converts browser keys to game codes. */
    keyMapper = null;
    /** Ctrl-C handler. */
    onInterrupt = null;
    /** Called when input queue is empty (headless replay). */
    onEmptyQueue = null;

    // --- NetHack-specific methods ---

    renderStatus(_player) {
        // TODO: full status line rendering from player stats
    }

    moveCursorTo(col, row = 0) {
        this.setCursor(col, row);
    }

    /**
     * The screen string js/jsmain.js records at each input boundary and
     * animation frame. It uses the wire format of frozen/terminal.js
     * serialize(): rows joined by newlines, a row's leading blank cells
     * written as "\x1b[NC" when there are more than four, and trailing blank
     * cells and rows dropped.
     *
     * The frozen method treats every space as blank, so it writes the spaces
     * before a row's first glyph without their inverse video or underline
     * (davidbau/teleport-contest#18). The C recording keeps those
     * attributes, and frozen/screen-decode.mjs compares them because they
     * are visible on a space. Here such a space counts as visible when
     * choosing a row's first and last cell and the last row. For a grid with
     * no inverse or underlined space in those positions, the output is
     * byte-identical to the frozen method's.
     */
    serialize() {
        let lastRow = 0;
        for (let r = 0; r < this.rows; r++) {
            if (this.grid[r].some(visibleCell)) lastRow = r;
        }
        let out = '';
        let curFg = 39, curAttr = 0;
        for (let r = 0; r <= lastRow; r++) {
            const row = this.grid[r];
            const lastCol = row.findLastIndex(visibleCell);
            if (lastCol < 0) { if (r < lastRow) out += '\n'; continue; }
            const firstCol = row.findIndex(visibleCell);
            if (firstCol > 4) out += `\x1b[${firstCol}C`;
            else if (firstCol > 0) out += ' '.repeat(firstCol);
            for (let c = firstCol; c <= lastCol; c++) {
                const cell = row[c];
                const wantFg = colorToFg(cell.color);
                const wantAttr = cell.attr | 0;
                out += sgrTransition(curFg, curAttr, wantFg, wantAttr);
                curFg = wantFg;
                curAttr = wantAttr;
                // record-session.mjs compressAnsiLine() writes a run of five
                // or more consecutive literal spaces -- one with no SGR
                // change inside it -- as cursor-forward movement, which
                // frozen/screen-decode.mjs reads back as default blank
                // cells, dropping the run's colour and attributes.
                let run = 0;
                while (c + run <= lastCol && row[c + run].ch === ' '
                    && colorToFg(row[c + run].color) === wantFg
                    && (row[c + run].attr | 0) === wantAttr) ++run;
                if (run >= 5) {
                    out += `\x1b[${run}C`;
                    c += run - 1;
                    continue;
                }
                out += cell.ch;
            }
            // Reset at the end of the line so the next row's cursor-forward
            // escape does not carry this row's color.
            out += sgrTransition(curFg, curAttr, 39, 0);
            curFg = 39;
            curAttr = 0;
            if (r < lastRow) out += '\n';
        }
        return out;
    }
}
