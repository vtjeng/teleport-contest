import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeScreen } from '../frozen/screen-decode.mjs';
import { Terminal as FrozenTerminal } from '../frozen/terminal.js';
import { GameDisplay } from '../js/game_display.js';
import {
    ATR_BOLD, ATR_INVERSE, ATR_UNDERLINE, CLR_GRAY, CLR_RED, Terminal,
} from '../js/terminal.js';

// NetHack's NO_COLOR, which serialize() writes as the default foreground.
const NO_COLOR = 8;

function display() {
    return new GameDisplay(new Terminal(null, { rows: 24, cols: 80 }));
}

function put(target, col, row, text, color, attr) {
    for (let i = 0; i < text.length; i++)
        target.setCell(col + i, row, text[i], color, attr);
}

test('TTY clears restore the default foreground after colored glyphs', () => {
    const disp = display();
    // These in-range cells use colored glyph sentinels so both C clear paths
    // must reset the foreground and attribute before capturing blanks.
    disp.setCell(4, 2, 'X', CLR_RED, ATR_BOLD);
    disp.clearRow(2);
    assert.deepEqual(disp.grid[2][4], { ch: ' ', color: NO_COLOR, attr: 0 });

    // Row 3 checks an interior cell; row 20, column 79 checks the last cell
    // in the recorder's 24-by-80 frame after full-screen clearing.
    disp.setCell(6, 3, 'Y', CLR_RED, ATR_UNDERLINE);
    disp.clearScreen();
    assert.deepEqual(disp.grid[3][6], { ch: ' ', color: NO_COLOR, attr: 0 });
    assert.deepEqual(disp.grid[20][79], { ch: ' ', color: NO_COLOR, attr: 0 });
});

test('serialize keeps inverse video on spaces before the first glyph', () => {
    // The spell-menu column header from davidbau/teleport-contest#18: four
    // inverse spaces at columns 20-23, then "Name". More than four leading
    // cells takes the cursor-forward branch. The expected string is the one
    // the issue quotes from the C recording.
    const disp = display();
    put(disp, 20, 0, '    Name', NO_COLOR, ATR_INVERSE);
    const screen = disp.serialize();
    assert.equal(screen, '\x1b[20C\x1b[7m    Name\x1b[0m');
    assert.equal(decodeScreen(screen)[0][20].attr, ATR_INVERSE);
});

test('serialize keeps inverse video on leading and trailing spaces', () => {
    // An options-menu heading, which options.c formats as " %-30s ", so the
    // highlight covers one space on each side. Its column 1 start takes the
    // literal-space branch for fewer than five leading cells.
    const disp = display();
    put(disp, 1, 1, ' Booleans ', NO_COLOR, ATR_INVERSE);
    assert.equal(disp.serialize(), '\n \x1b[7m Booleans \x1b[0m');
});

test('serialize keeps an underlined row below the last glyph', () => {
    // A row holding only underlined spaces, two rows under the only glyph,
    // exercises the last-row scan.
    const disp = display();
    put(disp, 0, 0, 'a', NO_COLOR, 0);
    put(disp, 0, 2, '   ', NO_COLOR, ATR_UNDERLINE);
    assert.equal(disp.serialize(), 'a\n\n\x1b[4m   \x1b[0m');
});

test('serialize matches the frozen method when no edge space is visible',
     () => {
         // Every other encoding path: colors, bold, a mid-row inverse run, a
         // bold space before the first glyph (bold paints nothing on a
         // space), a blank row between glyph rows, and both leading-blank
         // branches (seven cells, then three).
         const disp = display();
         const frozen = new FrozenTerminal(null, { rows: 24, cols: 80 });
         for (const target of [disp, frozen]) {
             put(target, 7, 0, 'You see here', CLR_GRAY, 0);
             put(target, 20, 0, ' a red gem', CLR_RED, ATR_BOLD);
             put(target, 2, 2, ' ', NO_COLOR, ATR_BOLD);
             put(target, 3, 2, 'a - ', NO_COLOR, 0);
             put(target, 7, 2, 'spellbook', NO_COLOR, ATR_INVERSE);
             put(target, 16, 2, ' of sleep', NO_COLOR, 0);
         }
         assert.equal(disp.serialize(), frozen.serialize());
     });

test('after hangup() every GameDisplay write leaves the screen as it was', () => {
    // windows.c nhwindows_hangup() swaps in hup_procs, whose output routines
    // draw nothing. Every terminal write in js/ goes through these methods
    // (none reaches display.terminal directly), so each must be a no-op.
    const disp = display();
    // A top-line prompt and a map cursor at (9,5) stand for the screen
    // getpos() leaves when the hangup arrives; any visible cell and any
    // cursor away from (0,0) would serve.
    put(disp, 0, 0, 'Pick a monster', CLR_GRAY, 0);
    disp.setCursor(9, 5);
    const before = disp.serialize();
    disp.hangup();
    // One call per mutator; the coordinates and text are arbitrary values
    // that would each change the screen or the cursor before the hangup.
    disp.clearScreen();
    disp.clearRow(0);
    disp.setCell(0, 0, 'X', CLR_RED, ATR_BOLD);
    disp.putstr(0, 1, 'text', CLR_RED, 0);
    disp.putstr_message('message');
    disp.setCursor(0, 0);
    disp.moveCursor(1, 1);
    disp.cursorCol = 3;
    disp.cursorRow = 3;
    disp.clearToEol();
    disp.putString('abc');
    disp.putCharAtCursor('z');
    disp.putChar(2, 2, 'q', 0);
    disp.scrollUp();
    assert.equal(disp.serialize(), before);
    assert.deepEqual([disp.cursorCol, disp.cursorRow], [9, 5]);
});
