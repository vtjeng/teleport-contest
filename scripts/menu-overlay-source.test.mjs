// wintty.c tty_display_nhwindow() reads iflags.menu_overlay for every
// NHW_MENU and NHW_TEXT window it shows. The port once had each caller copy
// the option into an `overlay` field of its menu spec, and every caller that
// left the field out drew its menu over the map's right half even with the
// option off (#herecmdmenu among them). js/tty_menu.js menuOverlay() is now
// the only reader: the tty layouts call it with the state they draw for.
// This test fails when other game code reads the option itself or hands a
// window an `overlay` flag again.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { menuOverlay } from '../js/tty_menu.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// The option table and the help text name the option without reading it.
const NAMES_ONLY = new Set(['optlist_data.js', 'help_data.js']);

// Lines of `source` that read iflags.menu_overlay or pass a window an
// `overlay` flag, as file:line. In tty_menu.js, the body of menuOverlay()
// itself is the one permitted read.
export function overlayBypasses(source, file = '<source>') {
    const findings = [];
    const lines = source.split('\n');
    let inDefinition = false;
    lines.forEach((line, index) => {
        if (file === 'tty_menu.js' && /^export function menuOverlay\(/u.test(line))
            inDefinition = true;
        const code = line.replace(/\/\/.*$/u, '');
        const readsOption = /menu_overlay/u.test(code) && !inDefinition;
        const passesFlag = /(?<![\w$])overlay\s*:|\.overlay(?![\w$])/u.test(code);
        if (readsOption || passesFlag) findings.push(`${file}:${index + 1}`);
        if (inDefinition && /^\}/u.test(line)) inDefinition = false;
    });
    return findings;
}

test('only menuOverlay() reads menu_overlay, and no window takes an overlay flag',
    () => {
        const findings = [];
        for (const file of readdirSync(JS_DIR).sort()) {
            if (!file.endsWith('.js') || NAMES_ONLY.has(file)) continue;
            const source = readFileSync(join(JS_DIR, file), 'utf8');
            findings.push(...overlayBypasses(source, file));
        }
        assert.deepEqual(findings, []);
    });

test('the scan finds a direct read and a spec flag', () => {
    // Each fixture is one of the two forms the per-caller plumbing took.
    assert.deepEqual(overlayBypasses(
        'const on = state.iflags?.menu_overlay !== false;\n', 'cmd.js',
    ), ['cmd.js:1']);
    assert.deepEqual(overlayBypasses(
        'select_menu(state, {\n    items,\n    overlay: false,\n});\n',
        'cmd.js',
    ), ['cmd.js:3']);
    assert.deepEqual(overlayBypasses(
        'if (spec.overlay === false) offx = 0;\n', 'tty_menu.js',
    ), ['tty_menu.js:1']);
    // A comment that names the option is not a read.
    assert.deepEqual(overlayBypasses(
        '// iflags.menu_overlay decides the column\n', 'cmd.js',
    ), []);
});

test('menuOverlay() is on unless the option is explicitly off', () => {
    // optlist_data.js gives menu_overlay an initval of true, so a state
    // whose iflags never set it overlays, as C's default does.
    assert.equal(menuOverlay({ iflags: {} }), true);
    assert.equal(menuOverlay({ iflags: { menu_overlay: true } }), true);
    assert.equal(menuOverlay({ iflags: { menu_overlay: false } }), false);
});
