import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

// Seed 9400016 places a Valkyrie on a settled level with a door nearby.
// The kick command (Ctrl-D) reaches getdir(null) without hitting unported
// branches first. With getdir(null), s is null, so the `(s && s[0] === '^')
// ? dirsym : 0` test passes 0 as sym to help_dir(), matching the witness
// sessions' behavior (both seed0102 and seed5002 pass sym='\0' because s is
// NULL in C's getdir()).
const SEED = 9400016;
const DATETIME = '20310203040506';
const BASE_RC = [
    'OPTIONS=name:Doorway,role:Valkyrie,race:human,gender:female,'
    + 'align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

// Ctrl-D is the kick command, which calls dokick.c dokick(), then getdir().
const KICK_KEY = '\x04';
// '+' is not a valid direction key, not a quitchars[] member, and matches the
// witness session seed0102 step 16.
const INVALID_DIRECTION = '+';

function displayRow(r) {
    return game.nhDisplay.grid[r].map(({ ch }) => ch).join('').trimEnd();
}

test('help_dir displays the direction-key window for an invalid direction '
    + 'with cmdassist on', async () => {
    // Set up a level, type kick, then an invalid direction key. cmdassist is
    // on by default (optlist.h:233).
    await runSegment({
        seed: SEED,
        datetime: DATETIME,
        nethackrc: BASE_RC,
        moves: `.${KICK_KEY}${INVALID_DIRECTION}`,
    });

    // The text window is on screen waiting for --More--. Verified against
    // the C reference: seed0102 step 16 and seed5002 step 225 show
    // identical output.
    //
    // Row 0: "cmdassist: Invalid direction key!"
    // Row 1: (blank -- putstr(win, 0, ""))
    // Row 2: "Valid direction keys are:"
    // Rows 3-7: 8-direction vi-key diagram
    // Row 8: (blank)
    // Row 9-11: up, down, self direction keys
    // Row 12: (blank)
    // Row 13: suppress-message note
    // Row 23: --More--
    assert.equal(displayRow(0), 'cmdassist: Invalid direction key!');
    assert.equal(displayRow(1), '');
    assert.equal(displayRow(2), 'Valid direction keys are:');

    // Direction-key diagram. C ref: show_direction_keys() lines 4147-4163.
    // Default vi keys (no numpad); hero is not a grid bug.
    assert.equal(displayRow(3).trimStart(), 'y  k  u',
        'top row of direction diagram: NW N NE');
    assert.equal(displayRow(4).trimStart(), '\\ | /',
        'diagonal connectors top-center');
    assert.equal(displayRow(5).trimStart(), 'h- . -l',
        'center row: W centerchar E');
    assert.equal(displayRow(6).trimStart(), '/ | \\',
        'diagonal connectors center-bottom');
    assert.equal(displayRow(7).trimStart(), 'b  j  n',
        'bottom row: SW S SE');

    // Up/down/self lines. C ref: help_dir() lines 4276-4284.
    assert.equal(displayRow(8), '');
    assert.equal(displayRow(9).trimStart(), '<  up',
        'upward direction key');
    assert.equal(displayRow(10).trimStart(), '>  down',
        'downward direction key');
    // C uses %4s to right-align the visctrl() result in a 4-char field.
    // For non-numpad, NHKF_GETDIR_SELF maps to '.', so padStart(4) = "   .".
    assert.equal(displayRow(11).trimStart(), '.  direct at yourself',
        'self-direction key (NHKF_GETDIR_SELF)');

    // Suppress message. C ref: help_dir() lines 4289-4291.
    assert.equal(displayRow(12), '');
    assert.equal(displayRow(13),
        '(Suppress this message with !cmdassist in config file.)');

    // --More-- on the last row (row 23 for a 24-row terminal).
    assert.equal(displayRow(23), '--More--');
});

test('help_dir with cmdassist off and help_requested fires the deferred '
    + 'retry boundary', async () => {
    // With cmdassist off, '?' still triggers help_dir through help_requested.
    // After the text window is dismissed, the deferred retry path throws.
    let boundary = null;
    await runSegment(
        {
            seed: SEED,
            datetime: DATETIME,
            nethackrc: BASE_RC.replace('!acoustics', '!acoustics,!cmdassist'),
            // Wait, kick, '?' (help_requested), space (dismiss --More--).
            moves: `.${KICK_KEY}? `,
        },
        { onBoundary: (error) => { boundary = error; } },
    );
    assert.equal(boundary?.name, 'UnsupportedHeroCommandBoundaryError');
    assert.match(boundary.message, /help_requested retry path/u);
});

test('without cmdassist a non-direction non-help key prints the strange '
    + 'direction message', async () => {
    // Neither help_requested nor cmdassist is true, so did_help stays false
    // and "What a strange direction!" is printed.
    await runSegment({
        seed: SEED,
        datetime: DATETIME,
        nethackrc: BASE_RC.replace('!acoustics', '!acoustics,!cmdassist'),
        moves: `.${KICK_KEY}${INVALID_DIRECTION}`,
    });
    assert.equal(displayRow(0), 'What a strange direction!');
});
