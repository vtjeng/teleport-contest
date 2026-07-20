import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import {
    ensureTtyPlayerName,
    isGenericPlayerName,
    renderTtyStartupBanner,
    TTY_STARTUP_BANNER,
    ttyAskname,
    ttyPlayerNameAndSuffix,
} from '../js/tty_startup.js';

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

test('tty startup banner uses the source and pinned-recorder build lines', () => {
    const state = startupState();
    renderTtyStartupBanner(state);

    assert.deepEqual(TTY_STARTUP_BANNER, [
        'NetHack, Copyright 1985-2026',
        '         By Stichting Mathematisch Centrum and M. Stephenson.',
        '         Version 5.0.0 Unix, built May  2 2026 12:00:00.',
        '         See license for details.',
    ]);
    assert.equal(plainScreen(state), [
        '', '', '', '', ...TTY_STARTUP_BANNER,
    ].join('\n'));
    assert.deepEqual(
        [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        [0, 11],
    );
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
