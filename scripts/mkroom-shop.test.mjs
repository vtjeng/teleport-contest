// Tests for the special rooms mkroom.c do_mkroom() builds, and for the
// boundary a room this port cannot build raises.

import assert from 'node:assert/strict';
import test from 'node:test';

import { runSegment } from '../js/jsmain.js';
import { UnsupportedSpecialRoomError } from '../js/mkroom.js';

test('a refused shop type ends the segment and keeps every screen before it',
    async () => {
        // The instrument this matters for is scripts/scan-debt.mjs, which
        // reads a session's whole recorded input and needs every fail-closed
        // stop to end its segment rather than escape runSegment() as a crash.
        // Today every shop type stops js/mkroom.js mkshop().
        //
        // Seed 7330325 and this walk were found by breadth-first search over
        // the generated D:1 map: ten steps to the down staircase, then `>` and
        // the space that dismisses the arrival's `--More--`.
        let boundary = null;
        const segment = await runSegment({
            seed: 7330325,
            datetime: '20330607081011',
            nethackrc: [
                'OPTIONS=name:Shopper,role:Valkyrie,race:human,'
                + 'gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,!autopickup',
                '',
            ].join('\n'),
            moves: 'njjlnljjll> ',
        }, { onBoundary: (error) => { boundary = error; } });

        assert.ok(
            boundary instanceof UnsupportedSpecialRoomError,
            `boundary was ${boundary?.name ?? 'absent'}`,
        );
        // Eleven screens: one per walked step plus the `--More--` the descent
        // stops on. The stop happens while D:2 is being generated, so the map
        // after it is never drawn.
        assert.equal(segment.getScreens().length, 11);
    });
