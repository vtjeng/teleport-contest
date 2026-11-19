// Every terminal cell the port writes stands for a C output path, and
// recorder patch 006 (nethack-c/patches/006-nomux-capture.patch) captures
// each path by its own rule: a char handed to nomux_putch() leaves a high or
// control byte's cell as it was, g_putch() strips the high bit, a hook given
// an int stores the byte. js/game_display.js names a writer for each rule
// (see the comment above GameDisplay.setCell()). A redraw that wrote with
// setCell() directly drew bytes C's capture ignores (batch 23 D1: ^P
// redrawing a typed high-byte name), so this test fails when code in js/
// writes a cell other than through those writers, and pins every caller of
// putCaptured() and restoreCell(), the two writers that trust what their
// caller passes.
//
// The scan reads member names, so it cannot follow a grid row held in a
// variable (`const row = display.grid[r]; row[c].ch = 'x'`); it does catch
// an assignment whose target names `grid` and a destructured writer.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as acorn from 'acorn';

import { GameDisplay } from '../js/game_display.js';
import { NO_COLOR } from '../js/terminal.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// The files that implement the writers: Terminal itself (frozen by the
// scorer) and the GameDisplay wrapper around it.
const WRITER_FILES = new Set(['terminal.js', 'game_display.js']);

// Members that write the terminal without a capture rule. `terminal` is the
// Terminal behind a GameDisplay, whose own writers bypass all of them.
const BANNED = new Set([
    'setCell', 'putChar', 'putString', 'putCharAtCursor', 'terminal',
]);

// Each caller of a trusting writer, as file:function, and why it may trust
// its argument. A new caller must be added here with its reason; a removed
// one must be deleted, so the count moves in both directions.
//
// putCaptured(): the hook whose capture the caller has already applied.
const CAPTURED = Object.freeze({
    // The rebuilt screen: redotoplin()'s g_putch() of a mixed line's first
    // byte, which pager.js lookedGlyphText() rendered, and each map cell
    // tty_print_glyph() last printed.
    'display.js:_buildScreenOutput': 2,
    // docorner()'s map repair through tty_print_glyph()'s g_putch();
    // symbols.js symbol_at() applied nomux_g_putch_byte().
    'display.js:docorner': 1,
    // The mixed first byte again, for the pending line and its --More--.
    'tty_message.js:writePendingTtyMessagePrompt': 1,
    'topl.js:redrawTtyTopline': 1,
    // process_text_window()'s g_putch() of a line's first byte, stored one
    // column right (nomux_g_putch_byte()).
    'tty_menu.js:writeStyledText': 1,
    // process_menu_window()'s nomux_putch(glyphinfo.ttychar), an int.
    'tty_menu.js:renderTtyMenu': 1,
    // A putmixed() glyph in a text window, as textWindowGlyphCell() decided.
    'tty_menu.js:displayTtyTextWindow': 1,
    // nomux_raw_putch(), which stores an unsigned byte (nomux_raw_write()).
    'tty_rawprint.js:flush': 1,
});

// restoreCell(): where the cell it puts back was copied from.
const RESTORED = Object.freeze({
    // The rebuilt screen puts back a message cell the capture left alone
    // and the status cells held while bot() is disabled, both copied from
    // the grid before clearScreen().
    'display.js:_buildScreenOutput': 2,
    // _screenOverlay() cells, each recorded as C's shadow screen got it.
    'display.js:_applyScreenOverlay': 1,
    // The screen under the legacy introduction, from snapshotDisplay().
    'legacy_startup.js:restoreDisplay': 1,
    // The rows a menu covered, from copyRegion().
    'tty_menu.js:restoreRegion': 1,
});

const FUNCTION_TYPES = new Set([
    'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
]);

function memberName(node) {
    if (node?.type !== 'MemberExpression') return null;
    if (!node.computed) return node.property.name ?? null;
    return node.property.type === 'Literal' && typeof node.property.value === 'string'
        ? node.property.value : null;
}

// The banned member accesses in `source`, and the putCaptured() and
// restoreCell() calls by enclosing named function, as
// { banned: [{ line, name }], captured: Map, restored: Map }.
export function cellWrites(source) {
    const ast = acorn.parse(source, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const banned = [];
    const captured = new Map();
    const restored = new Map();
    const count = (map, owner) => map.set(owner, (map.get(owner) ?? 0) + 1);
    // An assignment target that reaches into a `grid`.
    const intoGrid = (node) => {
        for (let at = node; at?.type === 'MemberExpression'; at = at.object)
            if (memberName(at) === 'grid') return true;
        return false;
    };
    function visit(node, owner) {
        if (!node || typeof node.type !== 'string') return;
        let current = owner;
        if (FUNCTION_TYPES.has(node.type) && node.id?.name) current = node.id.name;
        if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
            && FUNCTION_TYPES.has(node.init?.type))
            current = node.id.name;
        const name = memberName(node);
        if (name && BANNED.has(name)) banned.push({ line: node.loc.start.line, name });
        if (name === 'putCaptured') count(captured, current);
        if (name === 'restoreCell') count(restored, current);
        // `const { setCell } = display` takes the method without a member
        // expression.
        if (node.type === 'Property' && !node.computed
            && BANNED.has(node.key?.name ?? node.key?.value))
            banned.push({ line: node.loc.start.line, name: node.key.name ?? node.key.value });
        if ((node.type === 'AssignmentExpression' && intoGrid(node.left))
            || (node.type === 'UpdateExpression' && intoGrid(node.argument)))
            banned.push({ line: node.loc.start.line, name: 'grid' });
        for (const key of Object.keys(node)) {
            if (key === 'loc') continue;
            const child = node[key];
            if (Array.isArray(child)) for (const item of child) visit(item, current);
            else if (child && typeof child.type === 'string') visit(child, current);
        }
    }
    visit(ast, null);
    return { banned, captured, restored };
}

function scanRepository() {
    const banned = [];
    const captured = {};
    const restored = {};
    for (const file of readdirSync(JS_DIR).filter((name) => name.endsWith('.js')).sort()) {
        if (WRITER_FILES.has(file)) continue;
        const found = cellWrites(readFileSync(join(JS_DIR, file), 'utf8'));
        for (const { line, name } of found.banned) banned.push(`js/${file}:${line} ${name}`);
        for (const [owner, n] of found.captured) captured[`${file}:${owner}`] = n;
        for (const [owner, n] of found.restored) restored[`${file}:${owner}`] = n;
    }
    return { banned, captured, restored };
}

test('code in js/ writes cells only through the GameDisplay writers', () => {
    assert.deepEqual(scanRepository().banned, []);
});

test('every putCaptured() and restoreCell() caller is listed with its reason', () => {
    const { captured, restored } = scanRepository();
    assert.deepEqual(captured, { ...CAPTURED });
    assert.deepEqual(restored, { ...RESTORED });
});

test('the scan finds each way around the writers', () => {
    // Each numbered line bypasses the writers.
    const { banned, captured, restored } = cellWrites([
        "display.setCell(0, 0, 'x', 7, 0);", // 1: direct call
        "state.nhDisplay['setCell'](0, 0, 'x');", // 2: computed key
        'const write = display.setCell;', // 3: method taken as a value
        "display.terminal.putstr(0, 0, 'x');", // 4: the Terminal behind it
        "display.putString('x');", // 5
        'const { setCell } = display;', // 6: destructured
        "display.grid[0][0].ch = 'x';", // 7: into the grid
        "display.grid[0][1] = { ch: 'x', color: 7, attr: 0 };", // 8
        'function redraw(display) {',
        "    display.putCaptured(0, 0, 'q');", // counted for redraw
        '    display.restoreCell(0, 1, cell);', // counted for redraw
        '}',
        "const paint = (display) => display.putCaptured(1, 0, 'q');",
        "display.putch(0, 0, 'x');", // a writer: allowed
        'const ch = display.grid[0][0].ch;', // a read: allowed
    ].join('\n'));
    assert.deepEqual(banned.map(({ line }) => line), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(Object.fromEntries(captured), { redraw: 1, paint: 1 });
    assert.deepEqual(Object.fromEntries(restored), { redraw: 1 });
});

function display() {
    return new GameDisplay(null);
}

test('putch() leaves the cell of a byte the char hook ignores', () => {
    const disp = display();
    // A visible 'Z' in each probed cell shows whether putch() wrote it.
    for (let col = 0; col < 7; ++col) disp.setCell(col, 0, 'Z', NO_COLOR, 0);
    // 0x20 and 0x7E bound the bytes nomux_putch() stores; 0x1F and 0x80 sit
    // just outside them; 0xE9 is a typed Latin-1 letter; NUL is
    // tty_message.js ttyByteText()'s marker; U+20AC is not a byte at all.
    const probes = ['\x20', '\x7E', '\x1F', '\x80', '\xE9', '\0', '€'];
    const written = probes.map((ch, col) => disp.putch(col, 0, ch));
    assert.deepEqual(written, [true, true, false, false, false, false, false]);
    assert.deepEqual(disp.grid[0].slice(0, 7).map((cell) => cell.ch),
        [' ', '~', 'Z', 'Z', 'Z', 'Z', 'Z']);
});

test('putstr() prints through putch(), keeping the column of a skipped byte', () => {
    const disp = display();
    // 'Y' fills the row so a skipped cell stays visible.
    for (let col = 0; col < 8; ++col) disp.setCell(col, 1, 'Y', NO_COLOR, 0);
    // A name with one high byte, 0xEA, in the middle: tty_putstr() advances
    // past it, so 'l' lands in column 4.
    disp.putstr(1, 1, 'Mi\xEAle');
    assert.equal(disp.grid[1].slice(0, 7).map((cell) => cell.ch).join(''), 'YMiYleY');
});
