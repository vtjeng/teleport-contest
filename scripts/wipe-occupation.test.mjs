import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BLINDED, HALLUC, TIMEOUT } from '../js/const.js';
import { UnsupportedWipeError, dowipe } from '../js/do.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

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
