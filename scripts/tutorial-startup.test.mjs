import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import {
    ask_do_tutorial,
    buildTutorialMenuSpec,
    maybe_do_tutorial,
} from '../js/tutorial_startup.js';
import { TUTORIAL_MAP } from '../js/tutorial_level.js';

function tutorialState(keys = '', overrides = {}) {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    game.flags = { tutorial: true };
    game.iflags = {
        menu_overlay: true,
        menu_headings: { attr: 1, color: 8 },
    };
    game.program_state = {};
    game.specialLevels = [{
        proto: 'tut-1',
        dlevel: { dnum: 8, dlevel: 1 },
    }];
    Object.assign(game, overrides);
    for (const ch of keys) game.nhDisplay.pushKey(ch.charCodeAt(0));
    return game;
}

function rowText(state, row) {
    return state.nhDisplay.grid[row]
        .map((cell) => cell.ch).join('').trimEnd();
}

test('unset tutorial asks for an explicit yes or no choice', async () => {
    const state = tutorialState('y');
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        rows: Array.from({ length: 8 }, (_, row) => rowText(state, row)),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });

    assert.equal(await ask_do_tutorial(state), true);
    assert.deepEqual(boundaries, [{
        rows: [
            '                     Do you want a tutorial?',
            '',
            '                     y - Yes, do a tutorial',
            '                     n - No, just start play',
            '',
            '                     Put "OPTIONS=!tutorial" in .nethackrc to skip this query.',
            '                     (end)',
            '',
        ],
        cursor: [27, 6],
    }]);

    assert.equal(await ask_do_tutorial(tutorialState('n')), false);
});

test('pending welcome uses tty More before the tutorial menu', async () => {
    // The 75-column welcome leaves too little room for the eight-column
    // More prompt, so topl.c places the prompt at the start of row two.
    const welcome = 'Hello TutorialNo, welcome to NetHack!  You are a neutral male human Healer.';
    const state = tutorialState('x n', { _pending_message: welcome });
    state.nhDisplay.setCell(0, 1, 'Z', 3, 0);
    const boundaries = [];
    state._preNhgetchHook = () => boundaries.push({
        rows: Array.from({ length: 8 }, (_, row) => rowText(state, row)),
        cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
    });

    assert.equal(await ask_do_tutorial(state), false);
    assert.equal(boundaries.length, 3);
    assert.equal(boundaries[0].rows[0], welcome);
    assert.equal(boundaries[0].rows[1], '--More--');
    assert.deepEqual(boundaries[0].cursor, [8, 1]);
    assert.deepEqual(boundaries[1], boundaries[0]);
    assert.match(boundaries[2].rows[0], /Do you want a tutorial\?/u);
    assert.equal(boundaries[2].rows[1], 'Z');
    assert.equal(state._pending_message, '');
});

test('Space and Return rebuild the tutorial menu with a diagnostic', async () => {
    for (const repromptKey of [' ', '\n']) {
        const state = tutorialState(`${repromptKey}n`);
        const boundaries = [];
        state._preNhgetchHook = () => boundaries.push({
            rows: Array.from({ length: 8 }, (_, row) => rowText(state, row)),
            cursor: [state.nhDisplay.cursorCol, state.nhDisplay.cursorRow],
        });

        assert.equal(await ask_do_tutorial(state), false);
        assert.equal(boundaries.length, 2);
        assert.equal(boundaries[0].rows[6].trimStart(), '(end)');
        assert.equal(
            boundaries[1].rows[6].trimStart(),
            "(Please choose 'y' or 'n'.)",
        );
        assert.equal(boundaries[1].rows[7].trimStart(), '(end)');
        assert.deepEqual(boundaries[1].cursor, [27, 7]);
    }
});

test('Escape declines the tutorial without a reprompt', async () => {
    const state = tutorialState('\x1b');
    let boundaries = 0;
    state._preNhgetchHook = () => ++boundaries;

    assert.equal(await ask_do_tutorial(state), false);
    assert.equal(boundaries, 1);
});

test('configured tutorial true and false suppress the query', async () => {
    for (const enabled of [true, false]) {
        const state = tutorialState('', {
            tutorial_set_in_config: true,
            flags: { tutorial: enabled },
        });
        state._preNhgetchHook = () => {
            throw new Error('configured tutorial must not read input');
        };
        assert.equal(await ask_do_tutorial(state), enabled);
    }
});

test('maybe_do_tutorial exposes the transition target without mutating state', async () => {
    const state = tutorialState('', {
        tutorial_set_in_config: true,
        flags: { tutorial: true },
    });
    const before = structuredClone({ u: state.u, iflags: state.iflags });

    assert.deepEqual(await maybe_do_tutorial(state), {
        action: 'enter',
        level: { dnum: 8, dlevel: 1 },
        proto: 'tut-1',
    });
    assert.deepEqual({ u: state.u, iflags: state.iflags }, before);

    state.flags.tutorial = false;
    assert.deepEqual(await maybe_do_tutorial(state), {
        action: 'skip',
        reason: 'declined',
    });

    state.specialLevels = [];
    state.flags.tutorial = true;
    assert.deepEqual(await maybe_do_tutorial(state), {
        action: 'skip',
        reason: 'level-unavailable',
    });
});

test('tutorial menu uses the source config-file fallback text', () => {
    const state = tutorialState();
    state.configFileName = '/dev/null';
    const spec = buildTutorialMenuSpec(state);
    assert.equal(
        spec.items.at(-1).text,
        'Put "OPTIONS=!tutorial" in your configuration file to skip this query.',
    );
});

test('tutorial map preserves the source 75 by 18 descriptor', () => {
    assert.equal(TUTORIAL_MAP.length, 18);
    assert.ok(TUTORIAL_MAP.every((row) => row.length === 75));
});
