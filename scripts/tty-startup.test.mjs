import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import { plnamesuffix } from '../js/role_init.js';
import {
    renderTtyStartupBanner,
    ttyAskname,
} from '../js/tty_startup.js';
import { RECORDER_BUILD_DATE } from '../js/mdlib.js';
import { tty_init_nhwindows } from '../js/wintty.js';
import { copyright_banner_line, getversionstring } from '../js/version.js';

function startupState(keys = '') {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    for (const ch of keys) game.nhDisplay.pushKey(ch.charCodeAt(0));
    return game;
}

function plainScreen(state) {
    const rows = state.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join('').trimEnd(),
    );
    while (rows.at(-1) === '') rows.pop();
    return rows.join('\n');
}

// The banner as the judge's macOS recorder prints it: patchlevel.h's
// COPYRIGHT_BANNER_A, B and D, and mdlib.c bannerc_string() with PORT_ID
// "MacOS" and the build date recorder patch 001 pins. The judge's scorer
// normalizes "Version" lines (frozen/ps_test_runner.mjs), so no recording
// can catch a wrong third line; this test does.
const RECORDER_BANNER = [
    'NetHack, Copyright 1985-2026',
    '         By Stichting Mathematisch Centrum and M. Stephenson.',
    '         Version 5.0.0 MacOS, built May  2 2026 12:00:00.',
    '         See license for details.',
];

test('copyright_banner_line gives the recorder banner', () => {
    assert.deepEqual([1, 2, 3, 4].map(copyright_banner_line), RECORDER_BANNER);
    // version.c copyright_banner_line() returns "" for any other index.
    assert.equal(copyright_banner_line(0), '');
    assert.equal(copyright_banner_line(5), '');
    // version_id_string() shares the port name and build date.
    assert.equal(getversionstring(),
        'MacOS NetHack Version 5.0.0 - last build May  2 2026 12:00:00.');
});

test('the banner reads the recorder build\'s sources', () => {
    // patch 001 pins date.c populate_nomakedefs()'s build date, and the Linux
    // host profile gives a Linux recorder macOS's PORT_ID.
    assert.ok(readFileSync('nethack-c/patches/001-deterministic-runtime.patch', 'utf8')
        .includes(`: "${RECORDER_BUILD_DATE}");`));
    assert.match(readFileSync('nethack-c/host-profiles/linux-macos-output.patch', 'utf8'),
        /^\+#if defined\(__APPLE__\) \|\| defined\(__linux__\).*\n #define PORT_ID "MacOS"$/mu);
    assert.ok(RECORDER_BANNER[2].includes(` MacOS, built ${RECORDER_BUILD_DATE}.`));
    const patchlevel = readFileSync('nethack-c/upstream/include/patchlevel.h', 'utf8');
    // COPYRIGHT_BANNER_A, B and D are string literals there.
    for (const index of [0, 1, 3])
        assert.ok(patchlevel.includes(`"${RECORDER_BANNER[index]}"`), RECORDER_BANNER[index]);
});

test('tty startup banner prints copyright_banner_line(1) to (4) from row 4', () => {
    const state = startupState();
    tty_init_nhwindows(null, null, state);

    assert.equal(plainScreen(state), [
        '', '', '', '', ...RECORDER_BANNER,
    ].join('\n'));
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 11],
    );
});

// C ref: sys/share/unixtty.c setftty():258, reached from tty_init_nhwindows()
// before it draws anything.  iflags.cbreak records that the terminal mode
// changed, so it is raised whether or not this port has a surface to draw on;
// js/tty_message.js xwaitforspace() reads it to choose between the
// Return-only set and quitchars[].
test('the startup banner raises cbreak with no display attached', () => {
    const state = startupState();
    state.nhDisplay = null;
    state.iflags = {};
    renderTtyStartupBanner(state);
    assert.equal(state.iflags.cbreak, true);

    // A state with no iflags at all is the same boundary; the banner creates
    // it rather than throwing.
    const bare = { nhDisplay: null };
    renderTtyStartupBanner(bare);
    assert.equal(bare.iflags.cbreak, true);
});

test('tty_askname echoes one source-filtered character per input boundary', async () => {
    const state = startupState('1A2\u007f-ice\n');
    const screens = [];
    const cursors = [];
    state._preNhgetchHook = () => {
        screens.push(plainScreen(state));
        cursors.push([state.nhDisplay.cursorCol, state.nhDisplay.cursorRow]);
    };
    tty_init_nhwindows(null, null, state);

    await ttyAskname(state);

    assert.equal(state.plname, '_A-ice');
    assert.equal(state.iflags.renameallowed, true);
    assert.match(screens[0], /Who are you\?$/u);
    assert.match(screens[1], /Who are you\? _$/u);
    assert.match(screens[3], /Who are you\? _A2$/u);
    assert.match(screens[4], /Who are you\? _A$/u);
    assert.deepEqual(cursors.slice(0, 5), [
        [13, 12], [14, 12], [15, 12], [16, 12], [15, 12],
    ]);
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 13],
    );
});

test('tty_askname retries empty and escaped attempts on the source rows', async () => {
    const state = startupState('\nBad\u001bGood\n');
    const screens = [];
    state._preNhgetchHook = () => screens.push(plainScreen(state));
    tty_init_nhwindows(null, null, state);

    await ttyAskname(state);

    assert.equal(state.plname, 'Good');
    assert.match(screens[1], /Enter a name for your character\.\.\.\nWho are you\?$/u);
    assert.match(screens[5], /Enter a name for your character\.\.\.\nWho are you\?$/u);
});

// The recorder's sysconf GENERICUSERS line, which js/jsmain.js
// set_playmode() stores in sysopt.genericusers.
const GENERICUSERS = 'play player game games nethack nethacker ec2-user';

function unsetRoleFlags() {
    return { initrole: -1, initrace: -1, initgend: -1, initalign: -1 };
}

test('plnamesuffix() asks in place of a generic name and keeps an ordinary one', async () => {
    // role.c:1676-1684: the name up to its first '-' past gp.plnamelen is
    // looked up in the list, so "games-Healer" is generic and its suffix is
    // dropped with it.
    const state = startupState('Alice\n');
    state.plname = 'games-Healer';
    state.flags = unsetRoleFlags();
    state.gp = { plnamelen: 0 };
    state.sysopt = { genericusers: GENERICUSERS };
    tty_init_nhwindows(null, null, state);
    await plnamesuffix(state);
    assert.equal(state.plname, 'Alice');
    assert.equal(state.gp.plnamelen, 0);
    assert.equal(state.flags.initrole, -1);

    // findword(..., FALSE) is case-sensitive, and a longer name is not a
    // list word: no key is queued, so asking would fail the test.
    for (const name of ['Player', 'PlayerOne']) {
        const ordinary = startupState('');
        ordinary.plname = name;
        ordinary.flags = unsetRoleFlags();
        ordinary.gp = { plnamelen: 0 };
        ordinary.sysopt = { genericusers: GENERICUSERS };
        tty_init_nhwindows(null, null, ordinary);
        await plnamesuffix(ordinary);
        assert.equal(ordinary.plname, name);
    }

    // gp.plnamelen hides the dash of an exact Unix username (unixmain.c:195),
    // so the whole of "ec2-user" is looked up and found.
    const exact = startupState('Bob\n');
    exact.plname = 'ec2-user';
    exact.flags = unsetRoleFlags();
    exact.gp = { plnamelen: 'ec2-user'.length };
    exact.sysopt = { genericusers: GENERICUSERS };
    tty_init_nhwindows(null, null, exact);
    await plnamesuffix(exact);
    assert.equal(exact.plname, 'Bob');
});

test('plnamesuffix() tests the list once, so a generic answer is kept', async () => {
    // role.c:1671-1687 runs before the do loop (1689-1717): the name
    // askname() returns is not looked up again by the same call.
    const state = startupState('games-Hea\n');
    state.plname = 'player';
    state.flags = unsetRoleFlags();
    state.gp = { plnamelen: 0 };
    state.sysopt = { genericusers: GENERICUSERS };
    tty_init_nhwindows(null, null, state);
    await plnamesuffix(state);
    assert.equal(state.plname, 'games');
    // Healer is index 3 in the pinned role table.
    assert.equal(state.flags.initrole, 3);

    // The next call, which is role_init()'s, asks again.
    for (const ch of 'Carol\n') state.nhDisplay.pushKey(ch.charCodeAt(0));
    await plnamesuffix(state);
    assert.equal(state.plname, 'Carol');

    // GENERICUSERS=* makes every name generic (1672-1673).
    for (const ch of 'Dave\n') state.nhDisplay.pushKey(ch.charCodeAt(0));
    state.sysopt.genericusers = '*';
    await plnamesuffix(state);
    assert.equal(state.plname, 'Dave');
});

test('suffix-only and NUL-cancelled names return to tty_askname', async () => {
    const state = startupState('-Wizard\n\0Alice\n');
    state.plname = '';
    state.flags = unsetRoleFlags();
    state.gp = { plnamelen: 0 };
    tty_init_nhwindows(null, null, state);

    await plnamesuffix(state);

    assert.equal(state.plname, 'Alice');
    // Wizard is index 12 in the pinned role table. The suffix selection is
    // retained across both subsequent name attempts.
    assert.equal(state.flags.initrole, 12);
});

test('tty_askname truncates storage and echo at PL_NSIZ minus one', async () => {
    const state = startupState(`${'A'.repeat(40)}\n`);
    tty_init_nhwindows(null, null, state);

    await ttyAskname(state);

    assert.equal(state.plname, 'A'.repeat(31));
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 13],
    );
});
