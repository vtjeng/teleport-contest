import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ROOM,
    TOPLINE_NEED_MORE,
    TOPLINE_SPECIAL_PROMPT,
} from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { tty_wait_synch } from '../js/tty_rawprint.js';
import { windowsUp } from './test-fixtures/windows-up.mjs';

const WINTTY_C = readFileSync(
    new URL('../nethack-c/upstream/win/tty/wintty.c', import.meta.url),
    'utf8',
);

// A live map window: mapWindowLive() needs a display, a level and
// iflags.window_inited, and the map arm needs ttyDisplay->rawprint == 0.
function mapWindowState() {
    return windowsUp({
        nhDisplay: new GameDisplay(null),
        iflags: { cbreak: true },
        level: { at: () => ({ typ: ROOM }) },
        u: { ux: 0, uy: 0 },
        program_state: { gameover: 0 },
    });
}

function screenText(display) {
    return display.grid.map((row) => row.map(({ ch }) => ch).join(''));
}

// Writes `text` on row 0 the way update_topl() leaves a message awaiting
// acknowledgement: the cursor ends after the text and toplin is NEED_MORE.
function showPendingMessage(state, text) {
    const display = state.nhDisplay;
    display.putstr(0, 0, text);
    display.setCursor(text.length, 0);
    state._pending_message = text;
    display.topMessage = text;
    display.toplin = TOPLINE_NEED_MORE;
}

test('tty_wait_synch() follows wintty.c\'s HUPSKIP, rawprint and inmore arms', () => {
    // wintty.c:3623-3647. The map arm draws --More-- only while more() is
    // active, and the interrupted-read arm is its `else`.
    assert.match(
        WINTTY_C,
        /tty_wait_synch\(void\)\s*\{\s*HUPSKIP\(\);[\s\S]*?if \(WIN_MAP == WIN_ERR \|\| !ttyDisplay \|\| ttyDisplay->rawprint\) \{\s*getret\(\);[\s\S]*?\} else \{\s*tty_display_nhwindow\(WIN_MAP, FALSE\);\s*if \(ttyDisplay->inmore\) \{\s*addtopl\("--More--"\);\s*\(void\) fflush\(stdout\);\s*\} else if \(ttyDisplay->inread > program_state\.gameover\) \{\s*\/\*[^*]*\*\/\s*ttyDisplay->toplin = TOPLINE_SPECIAL_PROMPT;/u,
    );
});

test('a message awaiting --More-- outside more() gets no marker from the map arm', async () => {
    // The ordinary case: a pline() left TOPLINE_NEED_MORE, and more() is not
    // running (inmore == 0, its value from tty_init_nhwindows()). C repaints
    // the map and writes nothing on the top line; the next more() or
    // display_nhwindow(WIN_MESSAGE) draws the marker.
    const state = mapWindowState();
    const display = state.nhDisplay;
    display.inmore = 0;
    showPendingMessage(state, 'You die...');
    const before = screenText(display);
    // A queued key shows that the map arm does not wait.
    display.pushKey(' '.charCodeAt(0));

    await tty_wait_synch(state);

    assert.deepEqual(screenText(display), before);
    // Column 10 is just past 'You die...' (10 characters) on row 0, where
    // showPendingMessage() left the cursor; the map arm does not move it.
    assert.deepEqual([display.cursorCol, display.cursorRow], [10, 0]);
    assert.equal(display.toplin, TOPLINE_NEED_MORE);
    assert.equal(display.inputQueueLength, 1);
});

test('the map arm appends --More-- at the cursor while more() is active', async () => {
    // Only an interrupt reaches tty_wait_synch() inside more(); construct
    // that state directly. more() has already printed its marker, so
    // addtopl("--More--") writes a second one where the cursor stands, and
    // the inread arm is skipped because it is the `else` (inread 1 would
    // otherwise exceed gameover 0).
    const state = mapWindowState();
    const display = state.nhDisplay;
    showPendingMessage(state, 'Hello--More--');
    display.inmore = 1;
    display.inread = 1;

    await tty_wait_synch(state);

    assert.equal(screenText(display)[0].trimEnd(), 'Hello--More----More--');
    // Column 21: the 13-character 'Hello--More--' plus the 8-character
    // marker that addtopl() appended.
    assert.deepEqual([display.cursorCol, display.cursorRow], [21, 0]);
    // topl.c addtopl() ends by setting TOPLINE_NEED_MORE.
    assert.equal(display.toplin, TOPLINE_NEED_MORE);
    assert.equal(display.intr ?? 0, 0);
});

test('the map arm marks an interrupted read as a special prompt', async () => {
    // wintty.c:3637-3644: inread (1) exceeds gameover (0) while more() is
    // idle. The arm sets TOPLINE_SPECIAL_PROMPT, recalls two messages and
    // counts the interrupt. This state has no message window, so the port's
    // tty_doprev_message() returns at once (topl.c's wins[WIN_MESSAGE] is
    // never null in C) and leaves the assigned state visible.
    const state = mapWindowState();
    const display = state.nhDisplay;
    showPendingMessage(state, 'What do you want to name it?');
    display.inmore = 0;
    display.inread = 1;
    display.intr = 0;

    await tty_wait_synch(state);

    assert.equal(display.toplin, TOPLINE_SPECIAL_PROMPT);
    assert.equal(display.intr, 1);
});

test('a hangup makes tty_wait_synch() a no-op that leaves morc at Escape', async () => {
    // wintty.c HUPSKIP(): with program_state.done_hup set, C returns before
    // either arm, without reading a key or clearing ttyDisplay->rawprint.
    const state = mapWindowState();
    const display = state.nhDisplay;
    state.program_state.done_hup = 1;
    // A nonzero rawprint selects the getret() arm without HUPSKIP(), so a
    // queued key would be consumed if the hangup test were missing.
    display.nomuxRaw.rawprint = 1;
    display.pushKey(' '.charCodeAt(0));

    await tty_wait_synch(state);

    assert.equal(display.inputQueueLength, 1);
    assert.equal(display.nomuxRaw.rawprint, 1);
    // 27 is ESC ('\033'), the value HUPSKIP() stores in morc.
    assert.equal(display.morc, 27);
});
