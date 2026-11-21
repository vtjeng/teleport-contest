// getline.c xwaitforspace() reads the extra key it accepts from
// ttyDisplay->dismiss_more and reports the key it took in morc. The port
// once took that key as an argument, so a caller that left it out -- every
// text window and menu page -- refused the Ctrl-P that tty_doprev_message()
// had armed. These tests keep the key in the display state, where one
// definition serves every --More--, and pin the function's results to
// getline.c:229-255.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { xwaitforspace } from '../js/tty_message.js';

const JS = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const sources = readdirSync(JS)
    .filter((name) => name.endsWith('.js'))
    .map((name) => [name, readFileSync(join(JS, name), 'utf8')]);

test('no caller hands xwaitforspace() or more() a dismiss key', () => {
    for (const [name, source] of sources) {
        // The option and parameter the port used to thread the key through.
        assert.doesNotMatch(source, /\bdismissMore\b/u, name);
        // xwaitforspace(state) or xwaitforspace(state, s): never a third
        // argument.
        for (const [call] of source.matchAll(/\bxwaitforspace\(([^()]*)\)/gu)) {
            if (call.includes('state = game')) continue; /* the definition */
            assert.ok(call.split(',').length <= 2, `${name}: ${call}`);
        }
    }
});

test('xwaitforspace() is defined once, in js/tty_message.js', () => {
    const owners = sources
        .filter(([, source]) => /function xwaitforspace\(/u.test(source))
        .map(([name]) => name);
    assert.deepEqual(owners, ['tty_message.js']);
});

// A display that supplies `keys` in order, with iflags.cbreak raised as
// setftty() leaves it once the windows are up.
function waiting(keys, dismissMore) {
    const queue = [...keys];
    return {
        iflags: { cbreak: true },
        nhDisplay: {
            dismiss_more: dismissMore,
            morc: 99, /* stale; xwaitforspace() starts with `morc = 0` */
            readKey: async () => queue.shift(),
        },
    };
}

const CTRL_A = 0x01;
const CTRL_P = 0x10;
const ESC = 0x1B;
const SPACE = 0x20;
const RETURN = 0x0A;

test('the dismiss_more key ends the wait and is left in morc', async () => {
    // topl.c tty_doprev_message() stores C('p') before redotoplin(); 'x' is
    // in neither " \r\n\033" nor dismiss_more, so it only rings the bell.
    const state = waiting(['x'.charCodeAt(0), CTRL_P], CTRL_P);
    assert.equal(await xwaitforspace(state), CTRL_P);
    assert.equal(state.nhDisplay.morc, CTRL_P);
    assert.equal(state.nhDisplay.dismiss_more, CTRL_P);
});

test('with dismiss_more clear, Ctrl-P is refused and space is taken', async () => {
    // dismiss_more 0 is its state outside the two functions that set it.
    const state = waiting([CTRL_P, SPACE], 0);
    assert.equal(await xwaitforspace(state), SPACE);
    assert.equal(state.nhDisplay.morc, SPACE);
    assert.equal(state.nhDisplay.dismiss_more, 0);
});

test('Return ends the wait with morc still 0', async () => {
    // getline.c:240-241 breaks before either assignment to morc.
    const state = waiting([RETURN], CTRL_P);
    assert.equal(await xwaitforspace(state), RETURN);
    assert.equal(state.nhDisplay.morc, 0);
});

test('Escape stores 1 in dismiss_more, so Ctrl-A ends the next wait', async () => {
    // getline.c:245-248: `ttyDisplay->dismiss_more = 1; morc = '\033';`.
    const state = waiting([ESC, CTRL_P, CTRL_A], 0);
    assert.equal(await xwaitforspace(state), ESC);
    assert.equal(state.nhDisplay.morc, ESC);
    assert.equal(state.nhDisplay.dismiss_more, 1);
    // Ctrl-P is still refused; Ctrl-A (1) now matches dismiss_more.
    assert.equal(await xwaitforspace(state), CTRL_A);
    assert.equal(state.nhDisplay.morc, CTRL_A);
});

test('before cbreak only Return ends the wait, and Escape changes nothing', async () => {
    // getline.c:243: the Escape and membership arms sit inside
    // `if (iflags.cbreak)`.
    const state = waiting([ESC, SPACE, RETURN], 0);
    state.iflags.cbreak = false;
    assert.equal(await xwaitforspace(state), RETURN);
    assert.equal(state.nhDisplay.morc, 0);
    assert.equal(state.nhDisplay.dismiss_more, 0);
});
