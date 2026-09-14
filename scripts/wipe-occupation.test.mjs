import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BLINDED, FROM_FORM, TIMEOUT } from '../js/const.js';
import { dowipe, wipeoff } from '../js/do.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { make_blinded } from '../js/potion.js';

const WITNESS_PATH = new URL(
    '../sessions/seed0108-wizard-extcmd-wishlist.session.json',
    import.meta.url,
);

async function witnessSegment() {
    const recording = JSON.parse(await readFile(WITNESS_PATH, 'utf8'));
    assert.equal(recording.segments.length, 1);
    const [{ steps: _steps, ...segment }] = recording.segments;
    return segment;
}

// Direct function checks do not pass through the next input boundary that
// normally dismisses a pending tty message. Clear that recorder state between
// source-pinned calls so each call can inspect its own output.
function clearTopline() {
    game._pending_message = '';
    game._ttyToplines = '';
    game._ttyPreviousMessage = '';
    game._ttyMessageStopped = false;
}

test('#wipe clears three-turn cream blindness through its occupation',
    async () => {
        const segment = await witnessSegment();
        const marker = '#wipe\n';
        const wipeAt = segment.moves.indexOf(marker);
        assert.notEqual(wipeAt, -1, 'the development witness contains #wipe');

        // Stopping before '#' leaves the source-selected entry state: the
        // cream-pie command's elapsed turn has reduced both counters to three.
        const before = await runSegment({
            ...segment,
            moves: segment.moves.slice(0, wipeAt),
        });
        assert.equal(game.u.ucreamed, 3);
        assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 3);
        const movesBefore = game.moves;
        const drawsBefore = before.getRngLog().length;

        let boundary = null;
        const after = await runSegment({
            ...segment,
            moves: segment.moves.slice(0, wipeAt + marker.length),
        }, { onBoundary: (error) => { boundary = error; } });

        assert.equal(boundary, null);
        assert.equal(game.u.ucreamed, 0);
        assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
        assert.equal(game.go.occupation, null);
        // do.c dowipe() spends the command turn and wipeoff() spends the next
        // occupation turn. The development C recording has 55 ambient draws
        // across those two turns; neither wipe function draws directly.
        assert.equal(game.moves - movesBefore, 2);
        assert.equal(after.getRngLog().length - drawsBefore, 55);
        assert.equal(
            game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd(),
            "You've got the glop off.  You can see again.",
        );
    });

test('dowipe handles clean and dirty faces without extra state gates',
    async () => {
        const segment = await witnessSegment();
        const wipeAt = segment.moves.indexOf('#wipe\n');
        await runSegment({ ...segment, moves: segment.moves.slice(0, wipeAt) });

        // do.c dowipe() prints this arm when u.ucreamed is zero and still
        // spends the command turn. The assigned holdout reaches this branch.
        game.u.ucreamed = 0;
        clearTopline();
        await dowipe(game);
        assert.equal(game._pending_message, 'Your face is already clean.');
        assert.equal(game.go?.occupation ?? null, null);

        // Any nonzero cream value installs wipeoff(), even when blindness is
        // longer or shorter than cream. These values exercise the source's
        // absence of the old exact-three-turn guard.
        for (const [cream, blinded] of [[4, 4], [3, 2]]) {
            game.u.ucreamed = cream;
            game.u.uprops[BLINDED].intrinsic = blinded;
            await dowipe(game);
            assert.equal(game.go.occupation, wipeoff);
            assert.equal(game.go.occtxt, 'wiping off your face');
            game.go.occupation = null;
        }
    });

test('wipeoff clamps independent counters and keeps busy faces occupied',
    async () => {
        const segment = await witnessSegment();
        const wipeAt = segment.moves.indexOf('#wipe\n');
        await runSegment({ ...segment, moves: segment.moves.slice(0, wipeAt) });

        // With more cream than temporary blindness, both four-turn clamps
        // fire. C clears all cream after blindness reaches zero and calls the
        // ordinary timed-blindness restoration path.
        clearTopline();
        game.u.ucreamed = 6;
        game.u.uprops[BLINDED].intrinsic = 1;
        assert.equal(await wipeoff(game), 0);
        assert.equal(game.u.ucreamed, 0);
        assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 0);
        assert.match(game._pending_message, /You've got the glop off\./u);

        // When cream reaches zero while blindness remains, C reports a clean
        // face and returns zero without forcing sight restoration.
        clearTopline();
        game.u.ucreamed = 1;
        game.u.uprops[BLINDED].intrinsic = 5;
        assert.equal(await wipeoff(game), 0);
        assert.equal(game.u.ucreamed, 0);
        assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 1);
        assert.equal(game._pending_message, 'Your face feels clean now.');

        // HBlinded includes source flags above TIMEOUT. C tests !HBlinded,
        // rather than !BlindedTimeout, so a form-supplied blindness flag keeps
        // the face-clean branch active after its temporary timeout expires.
        clearTopline();
        game.u.ucreamed = 1;
        game.u.uprops[BLINDED].intrinsic = FROM_FORM | 1;
        assert.equal(await wipeoff(game), 0);
        assert.equal(game.u.ucreamed, 0);
        assert.equal(game.u.uprops[BLINDED].intrinsic, FROM_FORM);
        assert.equal(game._pending_message, 'Your face feels clean now.');

        // Both counters can remain busy after one callback, which keeps the
        // occupation active for the next turn.
        clearTopline();
        game.u.ucreamed = 5;
        game.u.uprops[BLINDED].intrinsic = 5;
        assert.equal(await wipeoff(game), 1);
        assert.equal(game.u.ucreamed, 1);
        assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 1);
    });

test('make_blinded(0, true) fires toggle_blindness on sight restoration',
    async () => {
        // C potion.c:270: set_itimeout(&HBlinded, xtime ? 1L : 0L). When
        // xtime=0 the probe sets HBlinded to 0, Blind becomes false, and
        // toggle_blindness fires (u_could_see=false XOR can_see_now=true).
        // The old bug hardcoded 1, which kept the hero blind during the probe
        // and skipped toggle_blindness entirely.
        const segment = await witnessSegment();
        const wipeAt = segment.moves.indexOf('#wipe\n');
        // Run through the wipe occupation so ucreamed reaches 0 and blinded
        // reaches 1, the state wipeoff() has before calling make_blinded(0).
        await runSegment({
            ...segment,
            moves: segment.moves.slice(0, wipeAt + '#wipe\n'.length),
        });

        // Reset to the pre-make_blinded state: blinded=1, ucreamed=0, and
        // the hero is currently blind.
        game.u.uprops[BLINDED].intrinsic = 1;
        game.disp.botl = false;
        game.vision_full_recalc = 0;

        await make_blinded(0, true, game);

        // toggle_blindness sets botl=true and calls vision_recalc(0), which
        // consumes vision_full_recalc. botl persists as the observable proof
        // that toggle_blindness ran.
        assert.equal(game.disp.botl, true,
            'toggle_blindness sets botl for status-line refresh');
        assert.equal(game.u.uprops[BLINDED].intrinsic & TIMEOUT, 0,
            'blindness timeout is cleared');
    });
