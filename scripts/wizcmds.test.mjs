// Source-pinned checks for wizcmds.c wiz_intrinsic().  The blindness entry is
// deliberately exercised through the menu and its existing potion.c owner,
// because C does not use the generic timeout message for that property.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BLINDED, KILLED_BY, LAST_PROP, STONED, TIMEOUT,
} from '../js/const.js';
import { delayed_killer } from '../js/end.js';
import { GameDisplay } from '../js/game_display.js';
import { resetGame } from '../js/gstate.js';
import { make_stoned } from '../js/potion.js';
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

test('wizcmds.c clamps and delegates STONED to potion.c make_stoned', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /case SICK:\s*case SLIMED:\s*case STONED:\s*if \(oldtimeout > 0L && newtimeout > oldtimeout\)\s*newtimeout = oldtimeout;/u,
    );
    assert.match(
        source,
        /case STONED:\s*Sprintf\(buf, fmt,\s*!Stoned \? "" : " still",\s*"turning into stone"\);\s*make_stoned\(newtimeout, buf, KILLED_BY, wizintrinsic\);/u,
    );
});

test('potion.c make_stoned owns the timeout transition and delayed killer', () => {
    const potion = readFileSync(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
    const end = readFileSync(
        new URL('../nethack-c/upstream/src/end.c', import.meta.url),
        'utf8',
    );
    assert.match(
        potion,
        /make_stoned\(long xtime, const char \*msg, int killedby, const char \*killername\)[\s\S]*?set_itimeout\(&Stoned, xtime\);[\s\S]*?if \(\(xtime != 0L\) \^ \(old != 0L\)\)[\s\S]*?if \(!Stoned\)[\s\S]*?dealloc_killer\(find_delayed_killer\(STONED\)\);[\s\S]*?else if \(!old\)[\s\S]*?delayed_killer\(STONED, killedby, killername\);/u,
    );
    assert.match(end, /delayed_killer\(int id, int format, const char \*killername\)/u);
    assert.match(end, /dealloc_killer\(struct kinfo \*kptr\)/u);
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

test('wiz_intrinsic sets STONED and records its delayed killer through the menu',
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
        state.killer = { name: 'old immediate killer', format: 0, next: null };
        state.nhDisplay = new GameDisplay(null);
        state.nhDisplay.onEmptyQueue = () => {
            throw new Error('the intrinsic menu requested an unprovided key');
        };
        // property_by_index() assigns b to STONED, the second menu item.
        state.nhDisplay.pushKey('b'.charCodeAt(0));
        state.nhDisplay.pushKey('\n'.charCodeAt(0));

        await wiz_intrinsic(state);

        assert.equal(state.u.uprops[STONED].intrinsic & TIMEOUT, 30);
        assert.equal(state.disp.botl, true);
        assert.equal(state.killer.name, '');
        assert.deepEqual(state.killer.next, {
            id: STONED,
            next: null,
            format: KILLED_BY,
            name: '#wizintrinsic',
        });
        assert.equal(
            state.nhDisplay.toplines,
            'You are turning into stone.',
        );
    });

test('make_stoned unlinks only its delayed-killer record when cured', async () => {
    const state = resetGame();
    state.disp = { botl: false };
    state.u = {
        uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
            intrinsic: 0, extrinsic: 0, blocked: 0,
        })),
    };
    delayed_killer(77, KILLED_BY, 'another delayed cause', state);

    await make_stoned(30, null, KILLED_BY, '#wizintrinsic', state);
    const stonedKiller = state.killer.next;
    assert.equal(stonedKiller.id, STONED);
    assert.equal(stonedKiller.next.id, 77);
    assert.equal(state.u.uprops[STONED].intrinsic & TIMEOUT, 30);

    await make_stoned(0, null, KILLED_BY, '#wizintrinsic', state);
    assert.equal(state.u.uprops[STONED].intrinsic & TIMEOUT, 0);
    assert.equal(state.killer.next.id, 77);
    assert.equal(state.killer.next.next, null);
});
