import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import {
    ensureTtyPlayerName,
    isGenericPlayerName,
    renderTtyStartupBanner,
    ttyAskname,
    ttyPlayerNameAndSuffix,
} from '../js/tty_startup.js';
import { RECORDER_BUILD_DATE } from '../js/mdlib.js';
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
    renderTtyStartupBanner(state);

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
    renderTtyStartupBanner(state);

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
    renderTtyStartupBanner(state);

    await ttyAskname(state);

    assert.equal(state.plname, 'Good');
    assert.match(screens[1], /Enter a name for your character\.\.\.\nWho are you\?$/u);
    assert.match(screens[5], /Enter a name for your character\.\.\.\nWho are you\?$/u);
});

test('generic sysconf usernames prompt while ordinary names remain intact', async () => {
    assert.equal(isGenericPlayerName('player-Tourist'), true);
    // gp.plnamelen hides dashes which belong to an exact Unix username.
    assert.equal(isGenericPlayerName('ec2-user', 'ec2-user'.length), true);
    assert.equal(isGenericPlayerName('Player'), false);
    assert.equal(isGenericPlayerName('PlayerOne'), false);

    const state = startupState('Alice\n');
    state.plname = 'games-Healer';
    state.gp = { plnamelen: 0 };
    renderTtyStartupBanner(state);
    await ensureTtyPlayerName(state);

    assert.equal(state.plname, 'Alice');
    assert.equal(state.gp.plnamelen, 0);
});

test('suffix-only and NUL-cancelled names return to tty_askname', async () => {
    const state = startupState('-Wizard\n\0Alice\n');
    state.plname = '';
    state.flags = {
        initrole: -1,
        initrace: -1,
        initgend: -1,
        initalign: -1,
    };
    state.gp = { plnamelen: 0 };
    renderTtyStartupBanner(state);

    await ttyPlayerNameAndSuffix(state);

    assert.equal(state.plname, 'Alice');
    // Wizard is index 12 in the pinned role table. The suffix selection is
    // retained across both subsequent name attempts.
    assert.equal(state.flags.initrole, 12);
});

test('tty_askname truncates storage and echo at PL_NSIZ minus one', async () => {
    const state = startupState(`${'A'.repeat(40)}\n`);
    renderTtyStartupBanner(state);

    await ttyAskname(state);

    assert.equal(state.plname, 'A'.repeat(31));
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 13],
    );
});
