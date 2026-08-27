// save-command.test.mjs -- Tests for dosave() and dosave0() (save.c).
//
// Exercises: the 'save' command admission, the "Really save?" prompt, the
// luck-adjustment undo for Friday-13th and full-moon dates, game-state
// serialization to VFS storage, the "Be seeing you..." exit message, and the
// segment-ending gameover flag.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMITTED_COMMANDS } from '../js/cmd.js';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { InMemoryStorage } from '../js/storage.js';

test('save is in ADMITTED_COMMANDS', () => {
    // The 'save' command must be admitted so that admitParsedCommand() does
    // not throw UnsupportedHeroCommandBoundaryError when the player presses
    // S (key 0x53, extcmdlist row "save").
    assert.ok(
        ADMITTED_COMMANDS.includes('save'),
        'ADMITTED_COMMANDS must include "save"',
    );
});

// Build a segment that reaches dosave. Seed 13 with datetime 20001013090000
// is a Friday the 13th, matching the witness session.
//
// The moves string includes the minimal setup from the session: enough
// movement and space dismissals to reach the point where 'S' can be typed,
// followed by 'Sy' to save.
//
// This test only exercises segment 0 (the save). Segment 1 (restore) is a
// future slice.
test('dosave serializes state and ends the segment on Friday 13th', async () => {
    const storage = new InMemoryStorage();
    // Replay the session's segment 0 inputs verbatim. The final 'Sy' is
    // the save command with a 'y' confirmation.
    const seg = {
        seed: 13,
        datetime: '20001013090000',
        nethackrc: [
            'OPTIONS=name:Sneaky,role:Rogue,race:human,gender:female,align:chaotic',
            'OPTIONS=!tutorial',
            'OPTIONS=suppress_alert:3.4.3',
            'OPTIONS=symset:DECgraphics',
            'OPTIONS=disclose:yi ya yv yg yc yo',
        ].join('\n'),
        moves: 'LlKLLlJLLLKLhhhh,,da #chat\nhFhFhFhFh    nnSy',
        storage,
    };

    const nhGame = await runSegment(seg);

    // The segment should have ended via program_state.gameover, not via a
    // boundary error or input exhaustion.
    assert.ok(
        game.program_state?.gameover,
        'program_state.gameover must be true after a successful save',
    );

    // u.uhp should be -1 (universal game-over indicator, save.c:58).
    assert.equal(
        game.u.uhp, -1,
        'u.uhp must be -1 after save (universal game-over indicator)',
    );

    // The save file must exist in VFS storage.
    const saveData = storage.getItem('vfs:nhsave');
    assert.ok(
        saveData !== null,
        'VFS storage must contain the save file at "nhsave"',
    );

    // The save data must be valid JSON.
    let snapshot;
    assert.doesNotThrow(() => {
        snapshot = JSON.parse(saveData);
    }, 'save data must be valid JSON');

    // The snapshot must contain the hero's moves counter (a basic sanity
    // check that the serialization produced meaningful state).
    assert.ok(
        typeof snapshot.moves === 'number' && snapshot.moves > 0,
        `snapshot.moves must be a positive number, got ${snapshot.moves}`,
    );
    // dungeon.c savegamestate() serializes svm.mapseenchn independently of
    // the live level. The current level's record must survive the segment.
    assert.equal(
        snapshot.mapseenchn.some((entry) =>
            entry.lev.dnum === snapshot.u.uz.dnum
            && entry.lev.dlevel === snapshot.u.uz.dlevel),
        true,
    );

    // Verify the terminal grid contains "Be seeing you..." -- the exit
    // message written by tty_raw_print. js/terminal.js has no serialize()
    // method (frozen/terminal.js does), so getScreens() returns empty
    // strings in the test environment. Read the grid directly instead.
    const grid = game.nhDisplay.terminal.grid;
    const row0 = grid[0].map(c => c.ch).join('');
    assert.ok(
        row0.includes('Be seeing you...'),
        `terminal grid row 0 must contain "Be seeing you...", got: "${row0.trim()}"`,
    );
});

test('dosave undoes Friday-13th luck adjustment', async () => {
    const storage = new InMemoryStorage();
    const seg = {
        seed: 13,
        datetime: '20001013090000',
        nethackrc: [
            'OPTIONS=name:Sneaky,role:Rogue,race:human,gender:female,align:chaotic',
            'OPTIONS=!tutorial',
            'OPTIONS=suppress_alert:3.4.3',
            'OPTIONS=symset:DECgraphics',
            'OPTIONS=disclose:yi ya yv yg yc yo',
        ].join('\n'),
        moves: 'LlKLLlJLLLKLhhhh,,da #chat\nhFhFhFhFh    nnSy',
        storage,
    };

    await runSegment(seg);

    // On Friday the 13th, moveloop_preamble() applied change_luck(-1).
    // dosave0() (save.c:145) undoes it with change_luck(1). The serialized
    // u.uluck should reflect the undone adjustment.
    const snapshot = JSON.parse(storage.getItem('vfs:nhsave'));

    // The base luck for a fresh hero is 0. After Friday-13th adjustment
    // (-1) and its undo (+1), the serialized value should be 0 (unless
    // other luck-changing events occurred during the game). Since the
    // session includes combat, luck may have changed for other reasons.
    // The key invariant is that the Friday-13th undo ran, which we verify
    // by checking that the serialized state reflects dosave0()'s
    // change_luck(1) call. The value should be strictly greater than it
    // would be without the undo (i.e., the undo must have run).
    assert.equal(
        typeof snapshot.u.uluck, 'number',
        'serialized u.uluck must be a number',
    );
    // After all combat and the luck undo, the net effect on this specific
    // session is u.uluck = 0: the Friday-13th -1 at startup is undone by
    // the +1 in dosave0(), and no other event changed luck.
    assert.equal(
        snapshot.u.uluck, 0,
        'u.uluck should be 0 after Friday-13th luck undo in dosave0()',
    );
});

test('dosave cancels on "n" answer without ending the segment', async () => {
    const storage = new InMemoryStorage();
    // Same setup as the save test, but answer 'n' to "Really save?" and
    // then wait ('.') to prove the game continues.
    const seg = {
        seed: 13,
        datetime: '20001013090000',
        nethackrc: [
            'OPTIONS=name:Sneaky,role:Rogue,race:human,gender:female,align:chaotic',
            'OPTIONS=!tutorial',
            'OPTIONS=suppress_alert:3.4.3',
            'OPTIONS=symset:DECgraphics',
            'OPTIONS=disclose:yi ya yv yg yc yo',
        ].join('\n'),
        // After the setup, press S then 'n' (decline), then '.' to wait.
        // The segment should end by running out of input, not by gameover.
        moves: 'LlKLLlJLLLKLhhhh,,da #chat\nhFhFhFhFh    nnSn.',
        storage,
    };

    await runSegment(seg);

    // The game should NOT have ended via gameover.
    assert.ok(
        !game.program_state?.gameover,
        'program_state.gameover must not be set when save is declined',
    );

    // No save file should exist.
    const saveData = storage.getItem('vfs:nhsave');
    assert.equal(
        saveData, null,
        'no save file should be written when save is declined',
    );
});
