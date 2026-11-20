import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'acorn';

import { MSGTYP_NOSHOW, PLNMSG_UNKNOWN } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { regex_compile, regex_init } from '../js/posixregex.js';
import { ttyPline, vplineRawArm } from '../js/tty_message.js';

// pline.c vpline() sends a line to raw_print() when it is nested in another
// vpline() or when iflags.window_inited is false. js/tty_message.js
// vplineRawArm() is that branch; every vpline() entry must pass through it.
const VPLINE_ENTRIES = [
    ['js/tty_message.js', 'ttyPlineCore'],
    ['js/getline.js', 'hooked_tty_getlin'],
    ['js/topl.js', 'tty_yn_function'],
];

function source(file) {
    return readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function upstream(file) {
    return source(`nethack-c/upstream/${file}`);
}

function functions(file) {
    const ast = parse(source(file), {
        ecmaVersion: 'latest', sourceType: 'module',
    });
    const found = new Map();
    for (const node of ast.body) {
        const fn = node.type === 'ExportNamedDeclaration'
            ? node.declaration : node;
        if (fn?.type === 'FunctionDeclaration') found.set(fn.id.name, fn);
    }
    return found;
}

function calledNames(node, names = []) {
    if (Array.isArray(node)) {
        for (const child of node) calledNames(child, names);
    } else if (node && typeof node.type === 'string') {
        if (node.type === 'CallExpression'
            && node.callee.type === 'Identifier')
            names.push(node.callee.name);
        for (const value of Object.values(node))
            if (value && typeof value === 'object') calledNames(value, names);
    }
    return names;
}

// A MSGTYPE=hide rule for `pattern`, the list options.c msgtype_add()
// builds.
function hideRule(pattern) {
    const regex = regex_init();
    assert.ok(regex_compile(pattern, regex));
    return { msgtype: MSGTYP_NOSHOW, regex, pattern, next: null };
}

function screenText(display) {
    return display.grid.map((row) => row.map(({ ch }) => ch).join(''));
}

// A state with a terminal and no hero on the map, so vpline() takes no map
// flush. `iflags` is the caller's.
function messageState(iflags) {
    return {
        nhDisplay: new GameDisplay(null),
        iflags: { cbreak: true, ...iflags },
        u: {},
        program_state: {},
        gp: { pline_flags: 0 },
        _ttyPreviousMessage: 'an earlier message',
    };
}

test('the C sources still take the raw_print() arm as ported', () => {
    // pline.c:236-243: in_pline is raised before window_inited is read, and
    // the arm resets last_msg and skips to pline_done, which lowers it.
    assert.match(
        upstream('src/pline.c'),
        /if \(in_pline\+\+ \|\| !iflags\.window_inited\) \{\s*\/\*[^*]*\*\/\s*raw_print\(line\);\s*iflags\.last_msg = PLNMSG_UNKNOWN;\s*goto pline_done;\s*\}/u,
    );
    // pline.c:266-271: the deferred vision recalculation runs with in_pline
    // cleared (js/tty_message.js vplineVisionRecalc()).
    assert.match(
        upstream('src/pline.c'),
        /int tmp_in_pline = in_pline;\s*in_pline = 0;\s*vision_recalc\(0\);\s*in_pline = tmp_in_pline;/u,
    );
    // wintty.c tty_destroy_nhwindow() clears the flag for the message
    // window, which end.c really_done() destroys after its last
    // display_nhwindow(WIN_MESSAGE, TRUE) (js/end.js).
    assert.match(
        upstream('win/tty/wintty.c'),
        /if \(cw->type == NHW_MESSAGE\)\s*iflags\.window_inited = 0;/u,
    );
    assert.match(
        upstream('src/end.c'),
        /display_nhwindow\(WIN_MESSAGE, TRUE\);\s*destroy_nhwindow\(WIN_MAP\),\s*WIN_MAP = WIN_ERR;\s*if \(WIN_STATUS != WIN_ERR\)\s*destroy_nhwindow\(WIN_STATUS\),\s*WIN_STATUS = WIN_ERR;\s*destroy_nhwindow\(WIN_MESSAGE\),\s*WIN_MESSAGE = WIN_ERR;/u,
    );
});

for (const [file, name] of VPLINE_ENTRIES) {
    test(`${name}() takes vpline()'s raw_print() arm through vplineRawArm()`,
        () => {
            const fn = functions(file).get(name);
            assert.ok(fn, `${file} has no function ${name}`);
            assert.ok(calledNames(fn).includes('vplineRawArm'));
        });
}

test('with window_inited false a pline() is raw_print()ed', async () => {
    const state = messageState({ window_inited: false, last_msg: 7 });
    // A MSGTYPE=hide entry for the same text: the raw arm precedes the
    // MSGTYPE lookup (pline.c:249), so the line is printed anyway.
    state.gp.plinemsg_types = hideRule('Goodbye.*');
    const display = state.nhDisplay;
    // A queued key shows that nothing waits for --More--.
    display.pushKey(' '.charCodeAt(0));

    assert.equal(await ttyPline('Goodbye, cruel world.', state), true);

    // tty_raw_print() enters patch 006's raw mode at the top left and puts()
    // the line, so the next raw line starts on row 1.
    assert.equal(screenText(display)[0].trimEnd(), 'Goodbye, cruel world.');
    assert.equal(display.nomuxRaw.active, true);
    assert.deepEqual([display.nomuxRaw.col, display.nomuxRaw.row], [0, 1]);
    // The line never reached the message window or gp.prevmsg.
    assert.equal(state._pending_message, undefined);
    assert.equal(state._ttyPreviousMessage, 'an earlier message');
    assert.equal(state.iflags.last_msg, PLNMSG_UNKNOWN);
    assert.equal(display.inputQueueLength, 1);
    assert.equal(state.in_pline, 0);
});

test('with window_inited never set a pline() is raw_print()ed', async () => {
    // C's iflags starts zeroed, so an absent flag is FALSE, not "windows up".
    const state = messageState({});
    assert.equal(await ttyPline('Too early.', state), true);
    assert.equal(screenText(state.nhDisplay)[0].trimEnd(), 'Too early.');
    assert.equal(state._pending_message, undefined);
});

test('a pline() nested in another vpline() is raw_print()ed', async () => {
    // The windows are up, so the outer call's raised in_pline alone selects
    // the raw arm.
    const state = messageState({ window_inited: true });
    let outerSawRaw = null;
    await vplineRawArm('outer', state, async () => {
        assert.equal(state.in_pline, 1);
        await ttyPline('inner', state);
        outerSawRaw = screenText(state.nhDisplay)[0].trimEnd();
        return true;
    });
    assert.equal(outerSawRaw, 'inner');
    assert.equal(state._pending_message, undefined);
    assert.equal(state.in_pline, 0);
});

test('with window_inited true a pline() reaches the message window', async () => {
    const state = messageState({ window_inited: true });
    // The same MSGTYPE=hide rule as above does suppress its line here.
    state.gp.plinemsg_types = hideRule('Goodbye.*');
    assert.equal(await ttyPline('Goodbye, cruel world.', state), false);
    assert.equal(state.nhDisplay.nomuxRaw.active, false);
    assert.equal(await ttyPline('Hello.', state), true);
    assert.equal(state._pending_message, 'Hello.');
    assert.equal(state._ttyPreviousMessage, 'Hello.');
    assert.equal(state.nhDisplay.nomuxRaw.active, false);
    assert.equal(state.in_pline, 0);
});
