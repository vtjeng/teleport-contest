import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BLINDED, HALLUC, TIMEOUT } from '../js/const.js';
import { UnsupportedWipeError, dowipe } from '../js/do.js';
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

test('dowipe keeps neighboring face and blindness states fail-closed',
    async () => {
        const segment = await witnessSegment();
        const wipeAt = segment.moves.indexOf('#wipe\n');
        await runSegment({ ...segment, moves: segment.moves.slice(0, wipeAt) });

        const cases = [
            {
                label: 'a clean face',
                // Zero reaches dowipe()'s clean-face message outside this goal.
                setup: () => { game.u.ucreamed = 0; },
            },
            {
                label: 'a longer timeout',
                // Four is the nearest duration above the admitted value three.
                setup: () => {
                    game.u.ucreamed = 4;
                    game.u.uprops[BLINDED].intrinsic = 4;
                },
            },
            {
                label: 'mismatched counters',
                // Two differs from the admitted blindness timeout by one turn.
                setup: () => { game.u.uprops[BLINDED].intrinsic = 2; },
            },
            {
                label: 'hallucination',
                // One is the smallest active HALLUC timeout; C would print a
                // different sight-restoration message outside this goal.
                setup: () => { game.u.uprops[HALLUC].intrinsic = 1; },
            },
        ];

        for (const { label, setup } of cases) {
            game.u.ucreamed = 3;
            game.u.uprops[BLINDED].intrinsic = 3;
            game.u.uprops[HALLUC].intrinsic = 0;
            setup();
            const before = {
                cream: game.u.ucreamed,
                blinded: game.u.uprops[BLINDED].intrinsic,
                occupation: game.go?.occupation ?? null,
            };
            await assert.rejects(
                dowipe(game),
                (error) => error instanceof UnsupportedWipeError,
                label,
            );
            assert.deepEqual({
                cream: game.u.ucreamed,
                blinded: game.u.uprops[BLINDED].intrinsic,
                occupation: game.go?.occupation ?? null,
            }, before, label);
        }
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
