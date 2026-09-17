import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { getpos } from '../js/getpos.js';
import { runSegment } from '../js/jsmain.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/getpos.c', import.meta.url), 'utf8',
);

const PROBE = Object.freeze({
    seed: 613907,
    datetime: '20390127140622',
    nethackrc: [
        'OPTIONS=name:ValidProbe,role:Valkyrie,race:human,gender:female,align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug,pettype:none',
        '',
    ].join('\n'),
    recorderIsDst: true,
});

test('getpos SHOWVALID always resumes targeting without a callback', async () => {
    const replay = await runSegment({
        ...PROBE,
        // Dismiss startup, enter wizard teleport, dismiss its More and the
        // farlook tip, then leave SHOWVALID as the next getpos key.
        moves: ' \u0014  $',
    });

    assert.equal(replay.getInputExhausted(), true);
    assert.equal(game.getpos_hilitefunc, undefined);
    // The next getpos loop iteration redraws the source goal prompt after
    // SHOWVALID; '$' must not be interpreted as a terrain feature symbol.
    assert.equal(game._ttyToplines, 'Move cursor to the desired position:');
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('getpos SHOWVALID retains the optional highlight callback', async () => {
    await runSegment({
        ...PROBE,
        moves: ' \u0014  $.',
    });
    game.iflags.bgcolors = false;
    const calls = [];
    game.getpos_hilitefunc = async (enabled) => { calls.push(enabled); };
    const coordinate = { x: game.u.ux, y: game.u.uy };
    game.nhDisplay.pushKey('$'.charCodeAt(0));
    game.nhDisplay.pushKey(0x1B);

    assert.equal(
        await getpos(coordinate, false, 'desired location', game),
        -1,
    );
    assert.deepEqual(calls, [true, false]);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('getpos SHOWVALID branch matches the C continuation contract', () => {
    const marker = '} else if (c == gc.Cmd.spkeys[NHKF_GETPOS_SHOWVALID])';
    const start = C_SOURCE.indexOf(marker);
    assert.notEqual(start, -1);
    const end = C_SOURCE.indexOf('} else if', start + marker.length);
    const branch = C_SOURCE.slice(start, end);
    const callback = branch.indexOf('if (getpos_hilitefunc)');
    const showGoal = branch.indexOf('show_goal_msg = TRUE;');
    const continueInput = branch.indexOf('goto nxtc;');
    assert.notEqual(callback, -1);
    assert.ok(callback < showGoal);
    assert.ok(showGoal < continueInput);
});
