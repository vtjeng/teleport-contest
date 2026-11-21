// A prompt that redraws itself after a Ctrl-P recall clears the message
// window and then rewinds the recall index: C writes
// `tty_clear_nhwindow(WIN_MESSAGE); cw->maxcol = cw->maxrow;` each time.
// tty_clear_nhwindow() does not touch the index, so a port site that clears
// without rewinding makes the next Ctrl-P continue from the entry the
// prompt's recall stopped at. This check counts the C pairs and requires one
// recallFromNewest() call in js/ for each.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { recallFromNewest } from '../js/topl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Statements, in order, with blank lines and comments ignored.
const statements = (source) => source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/u, '').trim())
    .filter(Boolean);

// The lines on which `rewind` directly follows `clear`.
function pairs(source, clear, rewind) {
    const lines = statements(source);
    return lines.filter((line, i) =>
        i > 0 && rewind.test(line) && clear.test(lines[i - 1])).length;
}

const C_CLEAR = /^tty_clear_nhwindow\(WIN_MESSAGE\);$/u;
const C_REWIND = /^cw->maxcol = cw->maxrow;$/u;
const JS_CLEAR = /^(?:await )?clearMessageWindow\(state\);$/u;
const JS_REWIND = /^recallFromNewest\(state\);$/u;

const count = (source, pattern) => (source.match(pattern) ?? []).length;

test('tty_yn_function() rewinds the recall index at each C site', () => {
    const c = read('nethack-c/upstream/win/tty/topl.c');
    const js = read('js/topl.js');
    // topl.c:440-441 (a history window was shown inside the prompt) and
    // topl.c:455-456 (the key after a single-line recall): two pairs.
    assert.equal(pairs(c, C_CLEAR, C_REWIND), 2);
    assert.equal(pairs(js, JS_CLEAR, JS_REWIND), pairs(c, C_CLEAR, C_REWIND));
    // No rewind in topl.js stands apart from a clear.
    assert.equal(count(js, /\brecallFromNewest\(state\);/gu), 2);
});

test('hooked_tty_getlin() rewinds the recall index at each C site', () => {
    const c = read('nethack-c/upstream/win/tty/getline.c');
    const js = read('js/getline.js');
    // getline.c:91-92 (Escape over typed text), 126-127 (a history window
    // was shown) and 134-135 (the key after a single-line recall).
    assert.equal(pairs(c, C_CLEAR, C_REWIND), 3);
    // The port folds each C redraw into redrawPrompt(), which holds the one
    // clear-and-rewind pair; its call sites match the C pairs one for one.
    assert.equal(pairs(js, JS_CLEAR, JS_REWIND), 1);
    const body = js.slice(js.indexOf('function redrawPrompt('));
    assert.match(body.slice(0, body.indexOf('\n}\n')),
        /clearMessageWindow\(state\);\s*recallFromNewest\(state\);/u);
    assert.equal(count(js, /(?<!function )\bredrawPrompt\(/gu),
        pairs(c, C_CLEAR, C_REWIND));
});

test('no C file outside topl.c and getline.c rewinds the recall index', () => {
    // wintty.c tty_clear_nhwindow() leaves maxcol alone; if a later C
    // version rewinds elsewhere, this count changes and the port must follow.
    for (const file of ['wintty.c', 'termcap.c'])
        assert.equal(count(read(`nethack-c/upstream/win/tty/${file}`),
            /cw->maxcol = cw->maxrow;/gu), 0, file);
});

test('recallFromNewest() sets maxcol to maxrow and changes nothing else', () => {
    // maxrow 7 and maxcol 3 stand for a ring whose next write slot is 7
    // while Ctrl-P has walked back to slot 3; any unequal pair would do.
    const cw = { maxrow: 7, maxcol: 3, data: ['a'], flags: 0 };
    const state = { wintty: { messageWindow: 0, wins: [cw] } };
    recallFromNewest(state);
    assert.deepEqual(cw, { maxrow: 7, maxcol: 7, data: ['a'], flags: 0 });
});
