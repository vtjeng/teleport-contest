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
