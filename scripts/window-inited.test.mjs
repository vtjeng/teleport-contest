// iflags.window_inited (flag.h:303) starts FALSE, the tty build raises it
// only at the first display of WIN_MESSAGE (wintty.c:1883), and clears it in
// tty_exit_nhwindows() (wintty.c:844), tty_destroy_nhwindow() of the message
// window (wintty.c:2022, reached from end.c really_done()) and panic()
// (end.c:410). The port once read a missing flag as "windows up" through
// `!== false` and `=== false` tests and never stored it at startup. This file
// keeps the port's writes at those sites, makes every JS reader test the flag
// by truth value as C does, and checks the startup display and the clears on
// a constructed state.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'acorn';

import { NHW_BASE, NHW_MESSAGE } from '../js/const.js';
import { zero_instance_flags } from '../js/flag.js';
import { GameDisplay } from '../js/game_display.js';
import { displayPendingTtyMessageWindow } from '../js/tty_message.js';
import { tty_create_nhwindow, tty_exit_nhwindows } from '../js/wintty.js';

const ROOT = new URL('../', import.meta.url);

function source(path) {
    return readFileSync(new URL(path, ROOT), 'utf8');
}

// Every write the port may make, as `file function value`. js/flag.js
// zero_instance_flags() is C's zeroed iflags, generated from flag.h, which
// js/gstate.js and options.js defaultResult() start from; the other four are
// the C sites named above.
const ALLOWED_WRITES = [
    'js/end.js panic false',
    'js/end.js really_done false',
    'js/flag.js zero_instance_flags false',
    'js/tty_message.js displayPendingTtyMessageWindow true',
    'js/wintty.js tty_exit_nhwindows false',
];

function jsFiles(dir = 'js/') {
    const files = [];
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
        const path = `${dir}${entry.name}`;
        if (entry.isDirectory()) files.push(...jsFiles(`${path}/`));
        else if (entry.name.endsWith('.js')) files.push(path);
    }
    return files.sort();
}

function isFlag(node) {
    if (!node) return false;
    if (node.type === 'ChainExpression') return isFlag(node.expression);
    return node.type === 'MemberExpression' && !node.computed
        && node.property.name === 'window_inited';
}

function literalText(node) {
    return node?.type === 'Literal' ? String(node.value) : '<computed>';
}

// The writes and the forbidden reads of window_inited in one file.
function scanFile(path) {
    const text = source(path);
    const writes = [];
    const forbidden = [];
    if (!text.includes('window_inited')) return { writes, forbidden };
    const ast = parse(text, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
    });
    const visit = (node, fnName) => {
        if (Array.isArray(node)) {
            for (const child of node) visit(child, fnName);
            return;
        }
        if (!node || typeof node.type !== 'string') return;
        let name = fnName;
        if ((node.type === 'FunctionDeclaration'
            || node.type === 'FunctionExpression') && node.id)
            name = node.id.name;
        const where = `${path}:${node.loc.start.line}`;
        if (node.type === 'AssignmentExpression' && isFlag(node.left)) {
            writes.push({ key: `${path} ${name} ${literalText(node.right)}`, where });
        } else if (node.type === 'Property'
            && (node.key.name ?? node.key.value) === 'window_inited') {
            writes.push({ key: `${path} ${name} ${literalText(node.value)}`, where });
        } else if (node.type === 'BinaryExpression'
            && /^[!=]==?$/u.test(node.operator)
            && (isFlag(node.left) || isFlag(node.right))) {
            forbidden.push(`${where} compares window_inited with ${node.operator}`);
        } else if (node.type === 'LogicalExpression' && node.operator === '??'
            && isFlag(node.left)) {
            forbidden.push(`${where} defaults window_inited with ??`);
        } else if (node.type === 'UnaryExpression' && node.operator === 'delete'
            && isFlag(node.argument)) {
            forbidden.push(`${where} deletes window_inited`);
        } else if (node.type === 'UpdateExpression' && isFlag(node.argument)) {
            forbidden.push(`${where} updates window_inited with ${node.operator}`);
        }
        for (const [key, value] of Object.entries(node)) {
            if (key !== 'loc' && value && typeof value === 'object')
                visit(value, name);
        }
    };
    visit(ast, '<module>');
    return { writes, forbidden };
}

test('js/ writes window_inited only where C does, and tests it by truth value', () => {
    const writes = [];
    const forbidden = [];
    for (const path of jsFiles()) {
        const found = scanFile(path);
        writes.push(...found.writes);
        forbidden.push(...found.forbidden);
    }
    // A `=== false` or `!== false` test reads a missing flag as TRUE, which
    // C's zeroed iflags never is.
    assert.deepEqual(forbidden, []);
    const unexpected = writes.filter((w) => !ALLOWED_WRITES.includes(w.key));
    assert.deepEqual(unexpected.map((w) => `${w.where} ${w.key}`), []);
    // Each allowed site is written exactly once: a removed write fails here
    // as well as an added one.
    assert.deepEqual(writes.map((w) => w.key).sort(), [...ALLOWED_WRITES].sort());
});

test('the C sources still set and clear window_inited where the port does', () => {
    const wintty = source('nethack-c/upstream/win/tty/wintty.c');
    // wintty.c:1882-1883, in tty_display_nhwindow()'s NHW_MESSAGE arm, and
    // the `cw->active = 1` that ends every display (wintty.c:1949).
    assert.match(wintty,
        /case NHW_MESSAGE:[^}]*?\}\s*else\s*ttyDisplay->toplin = TOPLINE_EMPTY;\s*cw->curx = cw->cury = 0;\s*if \(!cw->active\)\s*iflags\.window_inited = TRUE;\s*break;/u);
    assert.match(wintty, /process_menu_window\(window, cw\);\s*break;\s*\}\s*cw->active = 1;\s*\}/u);
    // wintty.c:843-844, the end of tty_exit_nhwindows().
    assert.match(wintty, /term_shutdown\(\);[^\n]*\n\s*iflags\.window_inited = 0;\s*\}/u);
    // wintty.c:2021-2022, tty_destroy_nhwindow().
    assert.match(wintty, /if \(cw->type == NHW_MESSAGE\)\s*iflags\.window_inited = 0;/u);
    // end.c:404-411, panic().
    assert.match(source('nethack-c/upstream/src/end.c'),
        /if \(iflags\.window_inited\) \{\s*raw_print\("\\r\\nOops\.\.\."\);[\s\S]{0,300}?exit_nhwindows\(\(char \*\) 0\);\s*iflags\.window_inited = FALSE;/u);
    // allmain.c:756, init_sound_disp_gamewindows()'s first display of the
    // message window, which js/jsmain.js makes after status_initialize().
    assert.match(source('nethack-c/upstream/src/allmain.c'),
        /#ifndef STATUS_HILITES\s*display_nhwindow\(WIN_STATUS, FALSE\);\s*#endif\s*display_nhwindow\(WIN_MESSAGE, FALSE\);/u);
    // windows.c:653 and :692 are the hangup window procs. The port has no
    // hup_procs: cmd.js end_of_input() runs the tty_exit_nhwindows() that
    // hup_exit_nhwindows() would forward to, whose own clear stands for
    // windows.c:653, and nothing re-initializes windows after a hangup.
    const windows = source('nethack-c/upstream/src/windows.c');
    assert.match(windows,
        /hup_exit_nhwindows\(const char \*lastgasp\)\s*\{[\s\S]*?iflags\.window_inited = FALSE;\s*\}/u);
    assert.match(windows,
        /hup_init_nhwindows\(int \*argc_p UNUSED, char \*\*argv UNUSED\)\s*\{\s*iflags\.window_inited = TRUE;\s*\}/u);
    // No other write in the files the recorder's tty build compiles: three in
    // wintty.c, one in end.c, two in windows.c.
    const writes = ['src/end.c', 'src/windows.c', 'win/tty/wintty.c']
        .map((file) => (source(`nethack-c/upstream/${file}`)
            .match(/iflags\.window_inited = /gu) ?? []).length);
    assert.deepEqual(writes, [1, 2, 3]);
    for (const dir of ['src', 'sys/unix', 'win/tty']) {
        for (const name of readdirSync(new URL(`nethack-c/upstream/${dir}/`, ROOT))) {
            if (!name.endsWith('.c')) continue;
            const file = `${dir}/${name}`;
            if (['src/end.c', 'src/windows.c', 'win/tty/wintty.c'].includes(file))
                continue;
            assert.doesNotMatch(source(`nethack-c/upstream/${file}`),
                /iflags\.window_inited\s*=[^=]/u, file);
        }
    }
});

// A terminal with BASE_WINDOW and an undisplayed WIN_MESSAGE, as C has them
// between init_sound_disp_gamewindows()'s create_nhwindow(NHW_MESSAGE) and
// its display_nhwindow(WIN_MESSAGE, FALSE).
function windowState() {
    // iflags starts zeroed, window_inited FALSE among it; tty_create_nhwindow()
    // raises the zero msg_history to 20 as wintty.c:889-890 does.
    const state = {
        nhDisplay: new GameDisplay(null),
        iflags: zero_instance_flags(),
    };
    tty_create_nhwindow(NHW_BASE, state);
    tty_create_nhwindow(NHW_MESSAGE, state);
    return state;
}

test('the first display of WIN_MESSAGE raises window_inited', async () => {
    const state = windowState();
    await displayPendingTtyMessageWindow(state);
    assert.equal(state.iflags.window_inited, true);
    assert.equal(state.wintty.wins[state.wintty.messageWindow].active, true);
});

test('a display after the windows are cleared leaves window_inited false', async () => {
    // end.c really_done() clears the flag at destroy_nhwindow(WIN_MESSAGE)
    // after the window has been displayed; js/end.js keeps the descriptor,
    // which stays active, so a later display does not raise it again.
    const destroyed = windowState();
    await displayPendingTtyMessageWindow(destroyed);
    destroyed.iflags.window_inited = false;
    await displayPendingTtyMessageWindow(destroyed);
    assert.equal(destroyed.iflags.window_inited, false);

    const exited = windowState();
    await displayPendingTtyMessageWindow(exited);
    tty_exit_nhwindows(null, exited);
    assert.equal(exited.iflags.window_inited, false);
    await displayPendingTtyMessageWindow(exited);
    assert.equal(exited.iflags.window_inited, false);
});

test('a display with no message window leaves window_inited alone', async () => {
    const state = { nhDisplay: new GameDisplay(null), iflags: {} };
    await displayPendingTtyMessageWindow(state);
    assert.equal(state.iflags.window_inited, undefined);
});
