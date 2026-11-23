// botl.c stores the status title and the gold prefix as the bytes they are;
// wintty.c tty_putstatusfield() prints each through putchar(), and recorder
// patch 006's nomux_putch() decides there which bytes reach the shadow
// screen: a control byte or one above 0x7F leaves its cell alone.
//
// js/display.js once applied that rule where the text was built,
// _statusPlayerName() and _currentStatusGoldSymbol() replacing each such
// byte with a NUL marker that the row writers then tested for. The text
// lost the byte. It now holds the bytes, and _statusCellSkipped() applies
// js/termcap.js nomux_putch_byte() where a row is laid out or read back.
// recordings/topl.c/ctrlp-redraws-high-byte-name and
// recordings/wintty.c/high-byte-status-gold cover the output.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const display = readFileSync(new URL('../js/display.js', import.meta.url), 'utf8');
const code = display.replace(/^\s*\/\/.*$/gmu, '');

function body(name) {
    const start = code.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, name);
    return code.slice(start, code.indexOf('\n}\n', start));
}

test('js/display.js has no NUL marker for a skipped status byte', () => {
    assert.doesNotMatch(code, /'\\0'/u);
});

test('the status title and gold prefix are built without the capture rule', () => {
    for (const name of ['_statusPlayerName', '_currentStatusGoldSymbol']) {
        assert.doesNotMatch(body(name), /nomux_putch_byte|_statusCellSkipped|0x80/u, name);
    }
    assert.match(body('_statusPlayerName'), /return bytesText\(nameBytes\);/u);
});

test('the row writers apply the capture rule through _statusCellSkipped()', () => {
    assert.match(body('_statusCellSkipped'), /nomux_putch_byte\(ch\.charCodeAt\(0\)\) === null/u);
    // One call where _newStatusRow() lays a row out, three where
    // _recordRenderedStatus() reads the printed cells back.
    assert.equal(body('_newStatusRow').split('_statusCellSkipped(').length - 1, 1);
    assert.equal(body('_recordRenderedStatus').split('_statusCellSkipped(').length - 1, 3);
});
