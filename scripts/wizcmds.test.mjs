// Source-pinned checks for wizcmds.c wiz_intrinsic().  The blindness entry is
// deliberately exercised through the menu and its existing potion.c owner,
// because C does not use the generic timeout message for that property.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BLINDED, LAST_PROP, TIMEOUT } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { resetGame } from '../js/gstate.js';
import { wiz_intrinsic } from '../js/wizcmds.js';

test('wizcmds.c keeps blindness out of the generic timeout arm', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /case BLINDED:\s*make_blinded\(newtimeout, TRUE\);\s*break;/u,
        'the source-specific blindness call must remain before def_feedback',
    );
});

function heading(state) {
    return state.nhDisplay.grid[0].map((cell) => cell.ch).join('').trimEnd();
}

test('wiz_intrinsic routes blinded to make_blinded without generic timeout text',
    async () => {
        const state = resetGame();
        state.wizard = true;
        state.iflags = { cbreak: true };
        state.disp = { botl: false };
        state.u = {
            uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
                intrinsic: 0, extrinsic: 0, blocked: 0,
            })),
            uwep: null,
        };
        // C's #wizintrinsic menu assigns 'i' to BLINDED (the ninth property).
        state.u.uprops[BLINDED] = { intrinsic: 3, extrinsic: 0, blocked: 0 };
        state.nhDisplay = new GameDisplay(null);
        state.nhDisplay.onEmptyQueue = () => {
            throw new Error('the intrinsic menu requested an unprovided key');
        };
        state.nhDisplay.pushKey('i'.charCodeAt(0));
        state.nhDisplay.pushKey('\n'.charCodeAt(0));

        await wiz_intrinsic(state);

        assert.equal(state.u.uprops[BLINDED].intrinsic & TIMEOUT, 33);
        assert.equal(heading(state), '',
            'potion.c make_blinded() stays silent when extending blindness');
        assert.equal(state.disp.botl, false,
            'an extension with no visual transition leaves botl unchanged');
    });
