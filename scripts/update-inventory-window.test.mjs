// invent.c update_inventory() calls the window port's win_update_inventory,
// which the recorder's tty build implements as wintty.c
// tty_update_inventory(). That build leaves TTY_PERM_INVENT undefined, so the
// function draws nothing whether or not iflags.perm_invent is set. The port
// once stood a caller-supplied `updateInventory` hook in for it and refused
// every refresh whose caller had not supplied one while perm_invent was set,
// which stopped games at wishes, pickups, burning lamps and turn boundaries.
// js/wintty.js tty_update_inventory() is now the one window entry point; this
// test fails when code supplies, requires or calls such a hook again, or when
// update_inventory() stops routing through tty_update_inventory().

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { update_inventory } from '../js/invent.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'js');
const C_SRC = join(ROOT, 'nethack-c', 'upstream');

function jsSources() {
    return readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .map((name) => ({
            name,
            text: readFileSync(join(JS_DIR, name), 'utf8'),
        }));
}

function functionBody(text, signature) {
    const start = text.indexOf(signature);
    assert.ok(start >= 0, `missing ${signature}`);
    return text.slice(start, text.indexOf('\n}\n', start));
}

test('the recorder tty build has no permanent inventory window', () => {
    // include/config.h ships the define commented out, and the hints file
    // nethack-c/build-recorder.sh uses adds no -DTTY_PERM_INVENT.
    const config = readFileSync(join(C_SRC, 'include', 'config.h'), 'utf8');
    assert.match(config, /^\/\* #define TTY_PERM_INVENT \*\/$/mu);
    const build = readFileSync(join(ROOT, 'nethack-c', 'build-recorder.sh'),
        'utf8');
    assert.match(build, /HINTS_FILE="sys\/unix\/hints\/linux-minimal"/u);
    assert.doesNotMatch(build, /TTY_PERM_INVENT/u);
    const hints = readFileSync(
        join(C_SRC, 'sys', 'unix', 'hints', 'linux-minimal'), 'utf8');
    assert.doesNotMatch(hints, /TTY_PERM_INVENT/u);

    const wintty = readFileSync(join(C_SRC, 'win', 'tty', 'wintty.c'), 'utf8');
    assert.match(wintty,
        /tty_update_inventory\(int arg UNUSED\)\s*\{\s*#ifdef TTY_PERM_INVENT\s*sync_perminvent\(\);[^\n]*\s*#else\s*\/\* do nothing \*\/\s*#endif\s*return;\s*\}/u);
});

test('update_inventory routes through tty_update_inventory alone', () => {
    const invent = readFileSync(join(JS_DIR, 'invent.js'), 'utf8');
    const body = functionBody(invent, 'export function update_inventory(');
    assert.match(body, /tty_update_inventory\(0\);/u);
    assert.doesNotMatch(body, /hooks/u);
    const perminv = functionBody(invent, 'export async function doperminv(');
    assert.match(perminv, /tty_update_inventory\(1\);/u);
    assert.doesNotMatch(perminv, /hooks/u);

    const definitions = jsSources().filter(({ text }) =>
        /export (?:async )?function update_inventory\(/u.test(text));
    assert.deepEqual(definitions.map(({ name }) => name), ['invent.js']);
});

test('no JavaScript supplies or requires an updateInventory window hook', () => {
    const offenders = jsSources()
        .filter(({ text }) => /\bupdateInventory\b/u.test(text))
        .map(({ name }) => name);
    assert.deepEqual(offenders, []);
});

test('a perm_invent refresh in the move loop completes and restores prices', () => {
    // suppress_price 7 is an arbitrary nonzero caller value that
    // invent.c:2806-2809 must put back after its forced 0.
    const state = {
        program_state: { in_moveloop: 1 },
        iflags: { perm_invent: true, suppress_price: 7 },
    };
    assert.equal(update_inventory({ state }), undefined);
    assert.equal(state.iflags.suppress_price, 7);
});
