// State that C keeps for the life of the process and does not write to the
// save file must come out of a restore as the new process built it, not as
// the restored struct flag would rebuild it.
//
// C refs: options.c initoptions_finish():7364 update_rest_on_space();
// restore.c restgamestate():571 Sfi_flag() and dorecover():944-948;
// botl.c bot_via_windowport():973-974.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { commandForKey } from '../js/command_bindings.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';

function memoryStorage() {
    const store = new Map();
    return {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
    };
}

// A character no recording uses. !legacy and !tutorial leave no startup
// prompt, the short name keeps the welcome line clear of a --More--, and
// pettype:none leaves no pet to act.
const CHARACTER = 'OPTIONS=name:Otto,role:Tourist,race:human,gender:male,'
    + 'align:neutral,!legacy,!tutorial,!autopickup,pettype:none\n';
// Two weekdays on which moveloop_preamble() prints no new-moon, full-moon or
// Friday-the-13th message, so no --More-- holds the game short of its first
// moveloop_core() pass. The second test asserts the bare welcome line.
const SAVE_CLOCK = '20320121101500';
const RESTORE_CLOCK = '20320122101500';
// Arbitrary; nothing here depends on the level or the random-number stream.
const SEED = 60422917;
const SPACE = ' '.charCodeAt(0);

async function saveThenRestore(saveOptions, restoreOptions, restoreMoves = '') {
    const storage = memoryStorage();
    await runSegment({
        seed: SEED,
        datetime: SAVE_CLOCK,
        nethackrc: CHARACTER + saveOptions,
        // 'S' asks "Really save?"; 'y' saves and ends the segment.
        moves: 'Sy',
        storage,
    });
    return runSegment({
        seed: SEED + 1,
        datetime: RESTORE_CLOCK,
        nethackrc: CHARACTER + restoreOptions,
        moves: restoreMoves,
        storage,
    });
}

function topLine(replay) {
    const screens = replay.getScreens();
    return screens[screens.length - 1].split('\n')[0];
}

test('a restore keeps the <space> binding the new configuration made', async () => {
    // Saved with the option off, restored under an rc that turns it on:
    // restgamestate() reads the saved false over flags.rest_on_space, and
    // <space> stays bound to the wait command update_rest_on_space() gave it.
    await saveThenRestore('OPTIONS=!rest_on_space\n', 'OPTIONS=rest_on_space\n');
    assert.equal(game.flags.rest_on_space, false);
    assert.equal(commandForKey(game.commandBindings, SPACE), 'wait');

    // The reverse: the saved flag is on, and <space> stays unbound.
    const replay = await saveThenRestore(
        'OPTIONS=rest_on_space\n', 'OPTIONS=!rest_on_space\n', ' ');
    assert.equal(game.flags.rest_on_space, true);
    assert.equal(commandForKey(game.commandBindings, SPACE), null);
    assert.match(topLine(replay), /Unknown command ' '\./);
});

test('a restored game reaches its first command after two status passes', async () => {
    // dorecover() has no bot() of its own: welcome()'s pline() makes the
    // first pass through flush_screen(), and moveloop_core() the second
    // (allmain.c:473-474, after moveloop_preamble() sets disp.botlx). Each
    // toggles gn.now_or_before_idx, which starts at 0, so it is 0 again.
    const replay = await saveThenRestore('', '');
    assert.match(topLine(replay), /welcome back to NetHack!$/);
    assert.equal(game.gb.now_or_before_idx, 0);
});
