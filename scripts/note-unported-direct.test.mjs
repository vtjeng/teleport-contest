// Game code records a gap by calling note_unported() itself, not through a
// hook that no caller supplies.
//
// mcastu.js used to route its impossible() gaps through recordMcastGap(),
// which preferred an env.noteUnported hook, and its blindness-spell
// impossible() through an env.impossible hook; no game caller supplied
// either. mon.js vamp_stone() noted windows.c display_nhwindow() when its
// state was not the live game, which no caller passes since the dry run
// went. Each now calls note_unported() or the ported function directly.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

function stripComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');
}

function lineOf(source, index) {
    return source.slice(0, index).split('\n').length;
}

function jsSources() {
    return readdirSync(JS_DIR)
        .filter((file) => file.endsWith('.js'))
        .sort()
        .map((file) => [file, stripComments(readFileSync(join(JS_DIR, file), 'utf8'))]);
}

function findings(pattern, files = null) {
    const found = [];
    for (const [file, code] of jsSources()) {
        if (files && !files.includes(file)) continue;
        for (const match of code.matchAll(pattern))
            found.push(`${file}:${lineOf(code, match.index)}`);
    }
    return found;
}

test('no game code reads a noteUnported hook', () => {
    assert.deepEqual(findings(/\bnoteUnported\b/gu), []);
});

test('mcastu.js reads no impossible hook', () => {
    assert.deepEqual(findings(/\.impossible\b/gu, ['mcastu.js']), []);
});

test('no game code notes a window display as unported', () => {
    // display_nhwindow(WIN_MESSAGE, ...) is ported as tty_message.js
    // displayPendingTtyMessageWindow(), and display_nhwindow(WIN_MAP, TRUE)
    // as wintty.js tty_display_nhwindow_map_blocking(). Gap names have
    // spelled the C file several ways, so match any.
    assert.deepEqual(findings(/note_unported\(\s*'[^']*display_nhwindow/gu), []);
});
