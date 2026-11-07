// Enforces js/cmd.js's answer type rule: a yes/no answer is C's `char` as a
// one-character string, and no game code compares it with a key code. The
// first tests pin what scripts/yn-answer-type.mjs finds; the last ones check
// that each yes/no function returns the character C returns.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    cmdq_add_key,
    cmdq_add_userinput,
    cmdq_add_dir,
    paranoid_query,
    paranoid_ynq,
    y_n,
    yn_function,
    ynq,
} from '../js/cmd.js';
import { CQ_CANNED } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { resetGame } from '../js/gstate.js';
import { tty_yn_function } from '../js/topl.js';
import {
    PROJECT_ROOT,
    YN_FUNCTIONS,
    scanRepository,
    ynAnswerFindings,
} from './yn-answer-type.mjs';

const lines = (source) => ynAnswerFindings(source).map(({ line }) => line);

test('no game code compares a yes/no answer with a key code', () => {
    assert.deepEqual(scanRepository(), []);
});

test('every yes/no function the scan names is declared in js/', () => {
    // A renamed function would otherwise drop out of the scan silently.
    const sources = ['cmd.js', 'topl.js'].map((name) =>
        readFileSync(join(PROJECT_ROOT, 'js', name), 'utf8')).join('\n');
    for (const name of YN_FUNCTIONS)
        assert.match(sources, new RegExp(`export async function ${name}\\(`, 'u'), name);
});

test('the scan finds direct, stored, switched and aliased key-code comparisons', () => {
    // Each numbered line holds one mistake; line 1 is the module's first line.
    assert.deepEqual(lines([
        "if (await y_n('Eat it?', state) === 'y'.charCodeAt(0)) eat();", // 1: literal code
        "const KEY_Q = 'q'.charCodeAt(0);",
        'async function f(state) {',
        "    const c = await ynq('Go?', state);",
        '    if (c === KEY_Q) return;', // 5: KEY_* constant
        '    if (c !== 0x79) return;', // 6: number literal
        '    switch (await yn_function(q, "yn", "n", true, state)) {',
        '    case 0x6e: break;', // 8: key-code case
        "    case 'y': break;",
        '    }',
        '}',
        'async function g(env, state) {',
        "    const ask = env.ynq ?? ((query) => ynq(query, state));",
        "    const c = await ask('Unlock it?');",
        "    if (c === 'y'.charCodeAt(0)) return;", // 15: via a local alias
        "    if (await (env.yn ?? yn_function)(q, 'yn', 'n', true, state) === 0x6e) return;", // 16
        '}',
        "async function h({ ask = (query) => y_n(query, game) } = {}) {",
        "    return await ask('Advance?') === 'y'.charCodeAt(0);", // 19: parameter default
        '}',
        "const yes = 'y'.charCodeAt(0);",
        "async function k(state) { return await paranoid_ynq(true, 'Die?', false, state) === yes; }", // 22
    ].join('\n')), [1, 5, 6, 8, 15, 16, 19, 22]);
});

test('the scan accepts character comparisons and explicit key-code conversions', () => {
    assert.deepEqual(lines([
        "if (await y_n('Eat it?', state) === 'y') eat();",
        'async function f(state) {',
        "    const c = await ynq('Go?', state);",
        "    if (c === 'q' || c === '\\x1b') return;",
        "    switch (c) { case 'y': break; default: break; }",
        // getdir() and dowhatdoes() convert the answer for their key tables.
        "    const dirsym = (await yn_function('Dir?', null, '\\0', false, state)).charCodeAt(0);",
        '    if (dirsym === 0x1b) return;',
        '}',
        'async function g(state) {',
        // A variable that never holds an answer may be compared with codes.
        '    const c = await readchar(state);',
        '    if (c === 0x1b) return;',
        '}',
    ].join('\n')), []);
});

function promptState(keys) {
    const state = resetGame();
    state.nhDisplay = new GameDisplay(null);
    state.iflags = {};
    state.program_state = { input_state: 'command' };
    state.u = {}; // No hero position, so the prompt skips the map flush.
    for (const key of keys) state.nhDisplay.pushKey(key.charCodeAt(0));
    return state;
}

test('tty_yn_function and yn_function answer C characters, including Escape', async () => {
    // topl.c:463-470: Escape answers 'q' when the response set has one, 'n'
    // when it has 'n' but no 'q', and otherwise the default.
    assert.equal(await tty_yn_function('Go?', 'ynq', 'n', promptState(['\x1b'])), 'q');
    assert.equal(await tty_yn_function('Go?', 'yn', 'y', promptState(['\x1b'])), 'n');
    assert.equal(await tty_yn_function('Go?', 'rl', '\0', promptState(['\x1b'])), '\0');
    // An unrestricted prompt returns the key itself; '&' is outside every
    // response set, so only that arm can answer it.
    assert.equal(await yn_function('What?', null, '\0', false, promptState(['&'])), '&');
    // A key code queued by a canned command answers as its character.
    const canned = promptState([]);
    cmdq_add_key(CQ_CANNED, 'y'.charCodeAt(0), canned);
    assert.equal(await yn_function('Go?', 'ynq', 'q', true, canned), 'y');
    // cmd.c:5508-5509: any other queued node answers Escape without a
    // prompt. Escape is outside 'ynq', so cmd.c:5545-5570 reports it through
    // impossible() and answers the default instead.
    const direction = promptState([]);
    cmdq_add_dir(CQ_CANNED, 1, 0, 0, direction);
    assert.equal(await yn_function('Go?', 'ynq', 'q', true, direction), 'q');
    assert.match(direction.nhDisplay.topMessage ?? '', /Please report/);
    // An unrestricted prompt accepts that Escape unchanged.
    const unrestricted = promptState([]);
    cmdq_add_dir(CQ_CANNED, 1, 0, 0, unrestricted);
    assert.equal(
        await yn_function('Dir?', null, '\0', true, unrestricted), '\x1b');
    // A queued user-input marker reads the answer from the window port.
    const marker = promptState(['n']);
    cmdq_add_userinput(CQ_CANNED, marker);
    assert.equal(await yn_function('Go?', 'ynq', 'q', true, marker), 'n');
});

test('y_n, ynq and paranoid_ynq answer what hack.h and cmd.c return', async () => {
    // hack.h:1329-1330 defaults: a space answers 'n' for y_n and 'q' for ynq.
    assert.equal(await y_n('Go?', promptState([' '])), 'n');
    assert.equal(await ynq('Go?', promptState([' '])), 'q');
    // A non-key queued node gives ynq Escape, which cmd.c:5545-5570
    // replaces with ynq's default 'q'.
    const direction = promptState([]);
    cmdq_add_dir(CQ_CANNED, 1, 0, 0, direction);
    assert.equal(await ynq('Go?', direction), 'q');
    // cmd.c:5645-5647 folds every answer but 'y' (and 'q' with accept_q)
    // into 'n'.
    assert.equal(await paranoid_ynq(false, 'Go?', false, promptState(['y'])), 'y');
    assert.equal(await paranoid_ynq(false, 'Go?', true, promptState(['q'])), 'q');
    assert.equal(await paranoid_ynq(false, 'Go?', false, promptState(['\x1b'])), 'n');
    assert.equal(await paranoid_query(false, 'Go?', promptState(['y'])), true);
});
