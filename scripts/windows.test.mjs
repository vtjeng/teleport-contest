// Focused tests for windows.c select_menu() and getlin(), the two
// interface-independent wrappers every core caller of a menu or a typed line
// goes through, and the only two writers of gb.bot_disabled a running game
// has. What the flag suppresses is pinned beside botl.c bot() and timebot() in
// scripts/display-symbols.test.mjs and beside wintty.c erase_menu_or_text() in
// scripts/tty-menu.test.mjs; these tests pin when it is up.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import { GameDisplay } from '../js/game_display.js';
import { renderTtyStartupBanner } from '../js/tty_startup.js';
import { getlin, select_menu } from '../js/windows.js';

// The same startup scripts/tty-menu.test.mjs uses: a display with the banner
// on it and the given keys queued, which is enough for one menu or one prompt.
function windowState(keys = '') {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    for (const ch of keys) game.nhDisplay.pushKey(ch.charCodeAt(0));
    renderTtyStartupBanner(game);
    return game;
}

// A two-line PICK_ONE menu, short enough to overlay the right half of the tty
// so its dismissal takes docorner() and leaves the status rows out of this.
const pickOne = {
    title: 'Pick one',
    lines: ['y * Yes', 'n - No'],
    choices: new Map([['y', 1], ['n', 2]]),
    preselected: 1,
    cancelValue: -1,
};

test('select_menu raises bot_disabled for the menu and lowers it after',
    async () => {
        const state = windowState('y');
        const duringMenu = [];
        state._preNhgetchHook = () =>
            duringMenu.push(state.gb?.bot_disabled);

        assert.equal(await select_menu(state, pickOne), 1);

        // windows.c:1861 sets it before win_select_menu() and :1863 puts the
        // saved value back, so every key the menu reads sees it raised.
        assert.deepEqual(duringMenu, [true]);
        assert.equal(state.gb.bot_disabled, false);
    });

// windows.c:1859 and :1863 save and restore rather than clearing, so a menu
// opened from inside another one -- role.c's 'reset role filtering' pick, and
// every handler options.c doset() runs over a committed selection -- leaves
// the outer menu's suppression in place when it returns.
test('select_menu restores an outer suppression rather than clearing it',
    async () => {
        const state = windowState('y');
        (state.gb ??= {}).bot_disabled = true;

        assert.equal(await select_menu(state, pickOne), 1);

        assert.equal(state.gb.bot_disabled, true);
    });

test('getlin raises bot_disabled for the prompt and lowers it after',
    async () => {
        // 'hi' then Return, which win/tty/getline.c hooked_tty_getlin() reads
        // one key at a time and terminates on the Return.
        const state = windowState('hi\r');
        const duringPrompt = [];
        state._preNhgetchHook = () =>
            duringPrompt.push(state.gb?.bot_disabled);

        assert.equal(await getlin('For what do you wish?', state), 'hi');

        // windows.c:1898 and :1900, the arm that reaches the window port.
        assert.deepEqual(duringPrompt, [true, true, true]);
        assert.equal(state.gb.bot_disabled, false);
    });

test('getlin restores an outer suppression rather than clearing it',
    async () => {
        const state = windowState('hi\r');
        (state.gb ??= {}).bot_disabled = true;

        assert.equal(await getlin('For what do you wish?', state), 'hi');

        assert.equal(state.gb.bot_disabled, true);
    });

// The wrappers only suppress the status rows for callers that go through them,
// so who imports what is part of the behaviour. C gets this for free:
// select_menu() is the entry every core caller already uses, and only
// process_menu_window()'s own MENU_SEARCH prompt reaches tty_getlin directly.
// The port had to route its call sites through new wrappers, and a site left
// reaching the tty layer directly is invisible to every other test here --
// reverting one such site leaves the suite byte-identical. This case is the
// only thing that fails when a caller is half-converted.
test('only the wrappers reach the tty menu and prompt entry points',
    async () => {
        const { readFileSync, readdirSync } = await import('node:fs');
        const importers = (symbol) => readdirSync('js')
            .filter((name) => name.endsWith('.js'))
            .filter((name) => {
                const source = readFileSync(`js/${name}`, 'utf8');
                // Import statements only: the same identifiers appear in
                // comments across the port, which a plain search would count.
                return [...source.matchAll(/^import[\s\S]*?from\s+'[^']+';/gmu)]
                    .some((match) => new RegExp(`\\b${symbol}\\b`, 'u')
                        .test(match[0]));
            })
            .sort();

        // js/tty_menu.js defines selectTtyMenu, so it never imports it.
        assert.deepEqual(importers('selectTtyMenu'), ['windows.js'],
            'js/windows.js select_menu() is the only route to the tty menu');
        // js/tty_menu.js is C's MENU_SEARCH exception; js/getline.js defines
        // the entry rather than importing it.
        assert.deepEqual(importers('tty_getlin'),
            ['tty_menu.js', 'windows.js'],
            'js/windows.js getlin() is the only other route to a typed line');
    });
